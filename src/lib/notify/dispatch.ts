// src/lib/notify/dispatch.ts
// notification_outbox 를 읽어 알림톡으로 보낸다 — 문서 13-7-3
// ★ 서버 전용 (service role · 솔라피 키). route handler 에서만 부른다.
import { createAdminClient } from "@/lib/supabase/admin";
import { withholding33 } from "@/lib/tasks/withholding";
import type { NotificationOutbox, NotifyEvent } from "@/types/database";
import { TEMPLATES, VAR } from "./templates";
import { kstDate, maskName, normalizePhone, orDash, won } from "./format";
import { isDryRun, sendAlimtalk } from "./solapi";

type Admin = ReturnType<typeof createAdminClient>;

const BATCH = 20;            // 한 번 호출에 처리할 최대 행
const MAX_ATTEMPTS = 3;      // 실패 재시도 상한
const DEDUPE_MINUTES = 10;   // 같은 알림(작업 · 이벤트 · 수신자 · payload) 연속 억제

export interface DispatchSummary {
    dryRun: boolean;
    picked: number;
    sent: number;
    skipped: number;
    failed: number;
    lost: number; // 다른 호출이 먼저 가져간 행
}

type Outcome =
    | { kind: "sent"; providerId: string | null }
    | { kind: "skipped"; reason: string }
    | { kind: "failed"; reason: string };

/**
 * @param includeFailed  true 면 failed 행도 재시도 (주기 호출용). 웹훅 호출은 pending 만.
 */
export async function dispatchOutbox(includeFailed: boolean): Promise<DispatchSummary> {
    const admin = createAdminClient();
    const summary: DispatchSummary = {
        dryRun: isDryRun(), picked: 0, sent: 0, skipped: 0, failed: 0, lost: 0,
    };

    const statuses = includeFailed ? ["pending", "failed"] : ["pending"];
    const { data, error } = await admin
        .from("notification_outbox")
        .select("*")
        .in("status", statuses)
        .lt("attempts", MAX_ATTEMPTS)
        .order("id", { ascending: true })
        .limit(BATCH);
    if (error) throw new Error(`outbox 조회 실패: ${error.message}`);

    for (const row of (data ?? []) as NotificationOutbox[]) {
        // ── 선점: attempts 를 올리는 update 가 1행을 돌려받은 호출만 처리한다.
        //    웹훅이 동시에 여러 번 와도 같은 행을 두 번 보내지 않는다 (낙관적 락)
        const { data: claimed } = await admin
            .from("notification_outbox")
            .update({ attempts: row.attempts + 1 })
            .eq("id", row.id)
            .eq("attempts", row.attempts)
            .in("status", statuses)
            .select("id");
        if (!claimed || claimed.length === 0) {
            summary.lost++;
            continue;
        }
        summary.picked++;

        let outcome: Outcome;
        try {
            outcome = await processRow(admin, row);
        } catch (e) {
            outcome = { kind: "failed", reason: e instanceof Error ? e.message : String(e) };
        }

        const patch =
            outcome.kind === "sent"
                ? {
                    status: "sent",
                    sent_at: new Date().toISOString(),
                    provider_message_id: outcome.providerId,
                    last_error: summary.dryRun ? "dry-run" : null,
                }
                : outcome.kind === "skipped"
                    ? { status: "skipped", last_error: outcome.reason }
                    : { status: "failed", last_error: outcome.reason.slice(0, 500) };

        // dry-run 은 실제로 안 보냈으므로 sent 가 아니라 skipped 로 남긴다 (17절 138)
        if (outcome.kind === "sent" && summary.dryRun) {
            Object.assign(patch, { status: "skipped", sent_at: null });
        }

        await admin.from("notification_outbox").update(patch).eq("id", row.id);

        if (patch.status === "sent") summary.sent++;
        else if (patch.status === "skipped") summary.skipped++;
        else summary.failed++;
    }

    return summary;
}

// ─────────────────────────────────────────────────────────────

async function processRow(admin: Admin, row: NotificationOutbox): Promise<Outcome> {
    const tpl = TEMPLATES[row.event as NotifyEvent];
    if (!tpl) return { kind: "skipped", reason: `모르는 이벤트: ${row.event}` };
    if (!tpl.enabled) return { kind: "skipped", reason: `비활성 템플릿: ${tpl.code}` };

    // ── 연속 억제
    if (await isDuplicate(admin, row)) {
        return { kind: "skipped", reason: `연속 억제 (${DEDUPE_MINUTES}분 내 같은 알림 발송됨)` };
    }

    // ── 수신 번호
    let to: string[];
    let recipientName: string | null = null;
    if (row.recipient_side === "staff") {
        const staff = await staffRecipients(admin);
        if (staff.to.length === 0) return { kind: "skipped", reason: staff.reason };
        to = staff.to;
    } else {
        // 참조가 끊긴 행 (작업자 삭제 → ON DELETE SET NULL) — 17절 Ch2 실측
        if (!row.recipient_designer_id) return { kind: "skipped", reason: "수신 작업자 없음 (삭제됨)" };

        const [{ data: designer }, { data: contact }] = await Promise.all([
            admin.from("designers").select("name").eq("id", row.recipient_designer_id).maybeSingle(),
            admin.from("designer_contacts")
                .select("phone, notify_consent_at")
                .eq("designer_id", row.recipient_designer_id)
                .maybeSingle(),
        ]);
        if (!designer) return { kind: "skipped", reason: "수신 작업자 없음 (삭제됨)" };
        const phone = normalizePhone(contact?.phone);
        if (!phone) return { kind: "skipped", reason: "전화번호 미등록" };
        if (!contact?.notify_consent_at) return { kind: "skipped", reason: "수신 동의 없음" };
        to = [phone];
        recipientName = designer.name as string;
    }

    // ── 변수
    const built = await buildVariables(admin, row, recipientName);
    if ("skip" in built) return { kind: "skipped", reason: built.skip };

    const res = await sendAlimtalk({ to, templateId: tpl.templateId, variables: built.vars });
    return res.ok
        ? { kind: "sent", providerId: res.groupId }
        : { kind: "failed", reason: res.error };
}

// ─────────────────────────────────────────────────────────────
// ★v16 Ch4-B 사내 수신자 (T2) — 문서 13-7-10
//   1. staff_contacts 에서 review_request_on = true 인 사람
//   2. profiles.role 이 사내(admin · designer · cs) 인 사람만 (외주로 바뀐 계정 제외)
//   3. designers 행이 있으면: 비활성 · 상태 '연차' 는 건너뜀 (관리자는 행이 없어 항상 받음)
//   4. 켠 사람이 한 명도 없을 때만 NOTIFY_STAFF_PHONES 로 (전환기 안전망)
//      켠 사람은 있는데 전원 연차면 → 환경변수로 보내지 않고 skipped (쉬는 사람 보호)
// 상태는 발송 시점에 읽는다 — 적재 후 연차로 바꿔도 반영된다
// ─────────────────────────────────────────────────────────────

const STAFF_ROLES = new Set(["admin", "designer", "cs"]);
const LEAVE_STATUS = "연차";

export async function staffRecipients(admin: Admin): Promise<{ to: string[]; reason: string }> {
    const { data: contacts, error } = await admin
        .from("staff_contacts")
        .select("user_id, phone")
        .eq("review_request_on", true);
    if (error) throw new Error(`staff_contacts 조회 실패: ${error.message}`);

    const on = (contacts ?? []) as { user_id: string; phone: string }[];

    if (on.length === 0) {
        const fallback = (process.env.NOTIFY_STAFF_PHONES ?? "")
            .split(",")
            .map((p) => normalizePhone(p))
            .filter((p): p is string => !!p);
        return fallback.length > 0
            ? { to: [...new Set(fallback)], reason: "" }
            : { to: [], reason: "사내 수신자 없음 (알림 켠 직원 0명 · NOTIFY_STAFF_PHONES 없음)" };
    }

    const ids = on.map((c) => c.user_id);
    const [{ data: profiles }, { data: members }] = await Promise.all([
        admin.from("profiles").select("id, role").in("id", ids),
        admin.from("designers").select("user_id, status, is_active").in("user_id", ids),
    ]);
    const roleOf = new Map((profiles ?? []).map((p) => [p.id as string, p.role as string]));
    const memberOf = new Map(
        (members ?? []).map((m) => [m.user_id as string, m as { status: string; is_active: boolean }]),
    );

    const to = new Set<string>();
    let leave = 0;
    for (const c of on) {
        if (!STAFF_ROLES.has(roleOf.get(c.user_id) ?? "")) continue;
        const m = memberOf.get(c.user_id);
        if (m && m.is_active === false) continue;
        if (m && m.status === LEAVE_STATUS) { leave++; continue; }
        const phone = normalizePhone(c.phone);
        if (phone) to.add(phone);
    }

    if (to.size === 0) {
        return {
            to: [],
            reason: leave > 0
                ? `사내 수신자 없음 (알림 켠 직원 전원 연차 ${leave}명)`
                : "사내 수신자 없음 (알림 켠 직원이 사내 계정이 아님)",
        };
    }
    return { to: [...to], reason: "" };
}

async function isDuplicate(admin: Admin, row: NotificationOutbox): Promise<boolean> {
    const since = new Date(Date.now() - DEDUPE_MINUTES * 60_000).toISOString();
    let q = admin
        .from("notification_outbox")
        .select("payload")
        .eq("event", row.event)
        .eq("status", "sent")
        .gte("sent_at", since)
        .neq("id", row.id);
    q = row.task_id ? q.eq("task_id", row.task_id) : q.is("task_id", null);
    q = row.recipient_designer_id
        ? q.eq("recipient_designer_id", row.recipient_designer_id)
        : q.is("recipient_designer_id", null);
    const { data } = await q.limit(20);
    const mine = JSON.stringify(row.payload ?? {});
    return (data ?? []).some((r) => JSON.stringify(r.payload ?? {}) === mine);
}

type Built = { vars: Record<string, string> } | { skip: string };

async function buildVariables(
    admin: Admin,
    row: NotificationOutbox,
    recipientName: string | null,
): Promise<Built> {
    const p = (row.payload ?? {}) as Record<string, unknown>;

    // T5 정산 — 작업 단위가 아니다
    if (row.event === "settled") {
        const count = Number(p.count);
        const total = Number(p.total);
        if (!Number.isFinite(count) || !Number.isFinite(total)) return { skip: "정산 payload 이상" };
        return {
            vars: {
                [VAR.작업자명]: orDash(recipientName),
                [VAR.건수]: String(count),
                // ★ 실지급액(3.3% 공제 후) — 외주 화면의 "미정산/지급받은 금액"과 같은 기준
                [VAR.정산금액]: won(withholding33(total).net),
                [VAR.처리일]: kstDate(row.created_at),
            },
        };
    }

    // 나머지는 작업이 있어야 한다
    if (!row.task_id) return { skip: "작업 없음 (삭제됨)" };
    const { data: task } = await admin
        .from("tasks")
        .select("customer_name, order_method, outsourcing_price, completed_at, assigned_designer_id, deleted_at")
        .eq("id", row.task_id)
        .maybeSingle();
    if (!task || task.deleted_at) return { skip: "작업 없음 (삭제됨)" };

    const isStaff = row.recipient_side === "staff";
    const 고객명 = isStaff ? orDash(task.customer_name as string) : maskName(task.customer_name as string);
    const 주문방법 = orDash((task.order_method as string | null) ?? "미지정");
    const base = { [VAR.고객명]: 고객명, [VAR.주문방법]: 주문방법 };
    const price = task.outsourcing_price as number | null;

    switch (row.event) {
        case "assign":
            if (price == null) return { skip: "단가 없음" };
            return { vars: { [VAR.작업자명]: orDash(recipientName), ...base, [VAR.단가]: won(price) } };

        case "review_request": {
            const { data: d } = task.assigned_designer_id
                ? await admin.from("designers").select("name").eq("id", task.assigned_designer_id).maybeSingle()
                : { data: null };
            return {
                vars: {
                    ...base,
                    [VAR.작업자명]: orDash((d?.name as string | undefined) ?? null),
                    [VAR.회차]: String(Number(p.round) || 1),
                },
            };
        }

        case "rework":
            return {
                vars: { [VAR.작업자명]: orDash(recipientName), ...base, [VAR.회차]: String(Number(p.round) || 1) },
            };

        case "approved":
            if (price == null) return { skip: "단가 없음" };
            return {
                vars: {
                    [VAR.작업자명]: orDash(recipientName),
                    ...base,
                    [VAR.단가]: won(price),
                    [VAR.승인일]: kstDate((task.completed_at as string | null) ?? row.created_at),
                },
            };

        case "released":
            return { vars: { [VAR.작업자명]: orDash(recipientName), ...base, [VAR.해제일]: kstDate(row.created_at) } };

        case "price_changed": {
            const before = Number(p.before);
            const after = Number(p.after);
            if (!Number.isFinite(before) || !Number.isFinite(after)) return { skip: "단가 payload 이상" };
            return {
                vars: {
                    [VAR.작업자명]: orDash(recipientName),
                    ...base,
                    [VAR.변경전단가]: won(before),
                    [VAR.변경후단가]: won(after),
                },
            };
        }
    }
    return { skip: `처리 규칙 없음: ${row.event}` };
}
