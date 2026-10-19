// src/app/(staff)/board/outsourcing/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordTaskFiles, TASK_FILE_SELECT, type UploadedFileMeta } from "@/lib/tasks/files";
import type { FileRole, MessageKind, MessageSide } from "@/types/database";
import { OUTSOURCING_REVIEWING, OUTSOURCING_STATUS_LABEL, type OutsourcingStatus } from "@/types/database";



export type Message = {
    id: string;
    round: number;
    side: MessageSide;
    kind: MessageKind;
    body: string;
    author_name: string | null;
    created_at: string;
};

export type StaffTaskFile = {
    id: string;
    task_id: string;
    file_name: string;
    file_url: string;
    file_size: number | null;
    created_at: string;
    uploaded_by_outsourcing: boolean;
    file_role: FileRole | null;
    outsourcing_round: number | null;
    uploaded_by_name: string | null;
};

const MSG_SELECT = "id, round, side, kind, body, author_name, created_at";

// ─────────────────────────────────────────────────────────────
// 내부 헬퍼
// ─────────────────────────────────────────────────────────────

async function getClient() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    return { supabase, userId: user?.id ?? null };
}

async function getCurrentUserName(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string | null,
): Promise<string | null> {
    if (!userId) return null;
    const { data } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", userId)
        .maybeSingle();
    if (data?.name) return data.name;
    const { data: authUser } = await supabase.auth.getUser();
    return authUser.user?.email?.split("@")[0] ?? null;
}

async function insertLog(
    supabase: Awaited<ReturnType<typeof createClient>>,
    taskId: string,
    userId: string | null,
    changedField: string,
    oldValue: string | null,
    newValue: string | null,
    reason: string | null,
    changedByName: string | null,
) {
    const { error } = await supabase.from("task_logs").insert({
        task_id: taskId,
        user_id: userId,
        changed_field: changedField,
        old_value: oldValue,
        new_value: newValue,
        reason,
        changed_by_name: changedByName,
    });
    if (error) console.error("[task_logs insert error]", error.message);
}

/** 사내 역할(admin/designer/cs)인지 확인. 외주의 서버 액션 직접 호출을 막는다. */
async function assertStaff(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string | null,
) {
    if (!userId) throw new Error("로그인이 필요합니다.");
    const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
    const role = data?.role;
    if (role !== "admin" && role !== "designer" && role !== "cs") {
        throw new Error("이 작업을 처리할 권한이 없습니다.");
    }
}

async function loadRound(
    supabase: Awaited<ReturnType<typeof createClient>>,
    taskId: string,
): Promise<{ status: string | null; round: number }> {
    const { data } = await supabase
        .from("tasks")
        .select("outsourcing_status, outsourcing_round")
        .eq("id", taskId)
        .maybeSingle();
    return {
        status: (data?.outsourcing_status as string | null) ?? null,
        round: (data?.outsourcing_round as number | null) ?? 1,
    };
}

/** task_logs 에 남길 상태 이름 */
function statusLabel(status: string | null): string {
    return status && status in OUTSOURCING_STATUS_LABEL
        ? OUTSOURCING_STATUS_LABEL[status as OutsourcingStatus]
        : "검수 요청";
}

async function insertMessage(
    supabase: Awaited<ReturnType<typeof createClient>>,
    taskId: string,
    round: number,
    kind: Extract<MessageKind, "rework" | "note" | "approve" | "price_changed">,
    userId: string | null,
    userName: string | null,
    body: string,
) {
    const { error } = await supabase.from("outsourcing_messages").insert({
        task_id: taskId,
        round,
        side: "staff",
        kind,
        body,
        author_id: userId,
        author_name: userName,
    });
    if (error) throw new Error(`메시지 저장 실패: ${error.message}`);
}

function revalidateAll() {
    revalidatePath("/board/outsourcing");
    revalidatePath("/board");
    revalidatePath("/board/done");
    revalidatePath("/outsourcing");
}

// ─────────────────────────────────────────────────────────────
// 조회
// ─────────────────────────────────────────────────────────────

/** 대화 스레드 (사내용). 열어보면 staff unread 를 내린다. */
export async function fetchMessagesForStaff(taskId: string): Promise<Message[]> {
    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);

    const { data, error } = await supabase
        .from("outsourcing_messages")
        .select(MSG_SELECT)
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

    if (error) throw new Error(`대화 내역 조회 실패: ${error.message}`);

    await supabase
        .from("tasks")
        .update({ outsourcing_unread_staff: false })
        .eq("id", taskId)
        .eq("outsourcing_unread_staff", true);

    return (data ?? []) as unknown as Message[];
}

export async function markStaffRead(taskId: string) {
    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);

    await supabase
        .from("tasks")
        .update({ outsourcing_unread_staff: false })
        .eq("id", taskId);

    revalidateAll();
}

/**
 * 첨부파일 전체 (사내용). 화면에서 file_role 로 4계층 렌더링:
 *   source(전달 자료) / deliverable(외주 결과물, 회차별) /
 *   feedback(수정요청 첨부) / internal(사내 작업물)
 */
export async function fetchTaskFilesForStaff(taskId: string): Promise<StaffTaskFile[]> {
    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);

    const { data, error } = await supabase
        .from("task_files")
        .select(TASK_FILE_SELECT)
        .eq("task_id", taskId)
        .order("created_at", { ascending: true });

    if (error) throw new Error(`첨부파일 조회 실패: ${error.message}`);
    return (data ?? []) as unknown as StaffTaskFile[];
}

// ─────────────────────────────────────────────────────────────
// 사내 파일 업로드 — 외주 결과물과 계층 분리
// ─────────────────────────────────────────────────────────────

/**
 * 사내(디자이너·CS)가 올리는 파일.
 * 'deliverable' 은 외주 전용이라 타입으로 막아둔다 —
 * 그래야 uploaded_by_outsourcing = (file_role = 'deliverable') 이 계속 성립한다.
 */
export async function attachStaffFiles(
    taskId: string,
    files: UploadedFileMeta[],
    role: Extract<FileRole, "internal" | "feedback"> = "internal",
) {
    if (files.length === 0) return;

    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);
    const userName = await getCurrentUserName(supabase, userId);

    const { round } = await loadRound(supabase, taskId);
    await recordTaskFiles(supabase, taskId, files, role, round, userName);

    revalidateAll();
}

/** 사내가 올린 파일만 삭제 가능 */
export async function deleteStaffFile(fileId: string) {
    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);

    const { data: file } = await supabase
        .from("task_files")
        .select("id, file_role")
        .eq("id", fileId)
        .maybeSingle();

    if (!file) throw new Error("파일을 찾을 수 없습니다.");
    if (file.file_role === "deliverable") {
        throw new Error("외주 결과물은 삭제할 수 없습니다.");
    }

    const { error } = await supabase.from("task_files").delete().eq("id", fileId);
    if (error) throw new Error(`파일 삭제 실패: ${error.message}`);

    revalidateAll();
}

// ─────────────────────────────────────────────────────────────
// 인쇄 접수완료 표시
// ─────────────────────────────────────────────────────────────

export type PrintReceivedResult =
    | { ok: true; receivedAt: string | null }
    | { ok: false; message: string };

/**
 * 인쇄 접수완료 체크 / 해제.
 *
 * ★ 완료(done) 건에만 건다. 완료 탭에서만 쓰는 표시라 다른 상태에서 켜지면
 *   의미가 없다. 나중에 다른 탭에도 붙이려면 아래 .eq 한 줄만 빼면 된다.
 *
 * 승인·정산과 달리 낙관적 락이 없다. 둘이 동시에 눌러도 결과가 같은 값이라
 * 다툴 것이 없다. 0건이 나오는 경우는 "완료가 아니다" 하나뿐이고, 그건
 * throw 가 아니라 값으로 돌려준다 (5-3 ㉓)
 */
export async function setPrintReceived(
    taskId: string,
    received: boolean,
): Promise<PrintReceivedResult> {
    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);
    const userName = await getCurrentUserName(supabase, userId);

    const receivedAt = received ? new Date().toISOString() : null;

    const { data, error } = await supabase
        .from("tasks")
        .update({
            print_received_at: receivedAt,
            print_received_by: received ? userId : null,
        })
        .eq("id", taskId)
        .eq("outsourcing_status", "done")
        .select("id");

    if (error) throw new Error(`인쇄 접수 처리 실패: ${error.message}`);
    if (!data || data.length === 0) {
        return {
            ok: false,
            message: "완료된 작업에만 표시할 수 있습니다. 새로고침 후 다시 확인해주세요.",
        };
    }

    await insertLog(
        supabase, taskId, userId,
        "print_received_at", null, receivedAt,
        received ? "인쇄 접수완료" : "인쇄 접수완료 해제",
        userName,
    );

    revalidateAll();
    return { ok: true, receivedAt };
}

// ─────────────────────────────────────────────────────────────
// 검수 승인 → 최종 완료
// ─────────────────────────────────────────────────────────────

/**
 * 승인은 스레드에 approve 메시지로 남음, reason이 비면 기본 문구
 */
export async function approveOutsourcingTask(taskId: string, reason: string | null) {
    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);
    const userName = await getCurrentUserName(supabase, userId);
    const { status: before } = await loadRound(supabase, taskId);
    if (before === "review") throw new Error("고객 확인으로 넘긴 뒤에 승인할 수 있습니다.");

    const { data, error } = await supabase
        .from("tasks")
        .update({
            outsourcing_status: "done",
            status: "완료",
            completed_at: new Date().toISOString(),
            outsourcing_unread_staff: false,
            outsourcing_unread_worker: true,
        })
        .eq("id", taskId)
        .eq("outsourcing_status", "customer_review")   // ★v16 고객 확인을 거친 뒤에만 승인
        .select("id");

    if (error) throw new Error(`승인 실패: ${error.message}`);
    if (!data || data.length === 0)
        throw new Error("이미 처리된 작업입니다. 새로고침 후 다시 확인해주세요.");

    const {round} = await loadRound(supabase, taskId);
    await insertMessage(
        supabase, taskId, round, "approve", userId, userName,
        reason?.trim() || "검수가 승인되었습니다."
    );

    await insertLog(
        supabase, taskId, userId,
        "outsourcing_status", statusLabel(before), "완료",
        reason ?? "외주 검수 승인", userName,
    );
    await insertLog(
        supabase, taskId, userId,
        "status", "작업중", "완료",
        "외주 검수 승인", userName,
    );

    revalidateAll();
}

// ─────────────────────────────────────────────────────────────
// 수정 요청 → rework (사유 + 참고 파일)
// ─────────────────────────────────────────────────────────────

/**
 * 라운드는 여기서 증가한다.
 * .in("outsourcing_status", 검수요청·고객확인중).eq("outsourcing_round", round) 두 조건이
 * 낙관적 락 역할을 해서, 디자이너·CS·관리자가 동시에 눌러도 한 번만 통과한다.
 */
export async function requestReworkTask(
    taskId: string,
    reason: string,
    files: UploadedFileMeta[] = [],
) {
    const body = reason?.trim() ?? "";
    // const body = reason?.trim();
    // if (!body) throw new Error("수정 요청 사유를 입력해주세요.");

    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);
    const userName = await getCurrentUserName(supabase, userId);

    const { status: before, round } = await loadRound(supabase, taskId);
    if (before === "review") throw new Error("고객 확인으로 넘긴 뒤에 수정 요청할 수 있습니다.");

    const { data, error } = await supabase
        .from("tasks")
        .update({
            outsourcing_status: "rework",
            outsourcing_round: round + 1,
            outsourcing_unread_staff: false,
            outsourcing_unread_worker: true,
        })
        .eq("id", taskId)
        .eq("outsourcing_status", "customer_review")   // ★v16 고객 확인을 거친 뒤에만 수정가능
        .eq("outsourcing_round", round)
        .select("id");

    if (error) throw new Error(`수정 요청 실패: ${error.message}`);
    if (!data || data.length === 0)
        throw new Error("이미 처리된 작업입니다. 새로고침 후 다시 확인해주세요.");

    // 반려된 회차(round)에 붙여 스레드에서 사유 옆에 보이게 한다
    await insertMessage(supabase, taskId, round, "rework", userId, userName, body);

    if (files.length > 0) {
        await recordTaskFiles(supabase, taskId, files, "feedback", round, userName);
    }

    await insertLog(
        supabase, taskId, userId,
        "outsourcing_status", statusLabel(before), "수정 요청",
        body || null, userName,
    );

    revalidateAll();
}

// ─────────────────────────────────────────────────────────────
// ★v16 고객 확인중 — review ⇄ customer_review (문서 13-8)
// ─────────────────────────────────────────────────────────────

export type CustomerReviewResult = { ok: true } | { ok: false; message: string };

/**
 * 사내가 결과물을 고객에게 보내 최종 확인을 받는 중.
 * 알림 없음 · 회차 그대로 · 스레드 메시지 없음 (task_logs 에만).
 * 외주 화면에는 상태 뱃지로 보인다.
 */
export async function markCustomerReview(taskId: string): Promise<CustomerReviewResult> {
    return switchReviewStatus(taskId, "review", "customer_review", "고객 확인 요청");
}

/** 잘못 눌렀을 때 — 고객 확인중 → 검수 요청. 트리거가 T2 를 다시 쌓지 않는다 */
export async function revertToReview(taskId: string): Promise<CustomerReviewResult> {
    return switchReviewStatus(taskId, "customer_review", "review", "검수 요청으로 되돌림");
}

async function switchReviewStatus(
    taskId: string,
    from: OutsourcingStatus,
    to: OutsourcingStatus,
    reason: string,
): Promise<CustomerReviewResult> {
    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);
    const userName = await getCurrentUserName(supabase, userId);

    const { data, error } = await supabase
        .from("tasks")
        .update({ outsourcing_status: to, outsourcing_unread_staff: false })
        .eq("id", taskId)
        .eq("outsourcing_status", from)   // 낙관적 락 — 다른 사람이 먼저 승인·수정요청했으면 0건
        .is("deleted_at", null)
        .select("id");

    if (error) throw new Error(`상태 변경 실패: ${error.message}`);
    if (!data || data.length === 0) {
        return { ok: false, message: "이미 처리된 작업입니다. 새로고침 후 다시 확인해주세요." };
    }

    await insertLog(
        supabase, taskId, userId,
        "outsourcing_status", OUTSOURCING_STATUS_LABEL[from], OUTSOURCING_STATUS_LABEL[to],
        reason, userName,
    );

    revalidateAll();
    return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// 사내 → 외주 메시지 (상태 변경 없음)
// ─────────────────────────────────────────────────────────────

/** 외주의 문의에 답하거나, 작업 중 추가 지시를 남길 때 */
export async function postStaffMessage(taskId: string, message: string) {
    const body = message?.trim();
    if (!body) throw new Error("내용을 입력해주세요.");

    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);
    const userName = await getCurrentUserName(supabase, userId);

    const { status, round } = await loadRound(supabase, taskId);
    if (!status) throw new Error("외주 작업이 아닙니다.");

    await insertMessage(supabase, taskId, round, "note", userId, userName, body);

    await supabase
        .from("tasks")
        .update({
            outsourcing_unread_worker: true,
            outsourcing_unread_staff: false,
        })
        .eq("id", taskId);

    revalidateAll();
}

// ─────────────────────────────────────────────────────────────
// 배정 해제 → 다시 작업대기로
// ─────────────────────────────────────────────────────────────

/**
 * 라운드도 함께 올린다. 안 올리면 새 작업자가 이전 사람의 결과물이 남아 있는
 * 회차를 물려받아, 파일을 하나도 안 올리고 검수요청을 통과시킬 수 있다.
 *
 * visible_from_round 도 같이 올린다. 라운드 증가는 파일 검사만 막을 뿐이라,
 * 이 값이 없으면 다음 작업자에게 이전 사람의 결과물과 대화가 전부 보인다.
 */
export async function releaseOutsourcingTask(taskId: string, reason: string | null) {
    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);
    const userName = await getCurrentUserName(supabase, userId);

    const { data: before } = await supabase
        .from("tasks")
        .select("outsourcing_status, outsourcing_round, designer:designers(name)")
        .eq("id", taskId)
        .maybeSingle();

    const prevRound = (before?.outsourcing_round as number | null) ?? 1;

    const { data, error } = await supabase
        .from("tasks")
        .update({
            assigned_designer_id: null,
            outsourcing_status: "open",
            outsourcing_assigned_by_staff: false,
            outsourcing_round: prevRound + 1,
            outsourcing_visible_from_round: prevRound + 1,
            outsourcing_unread_staff: false,
            outsourcing_unread_worker: false,
        })
        .eq("id", taskId)
        .in("outsourcing_status", ["claimed", "review", "customer_review", "rework", "done"])
        .select("id");

    if (error) throw new Error(`배정 해제 실패: ${error.message}`);
    if (!data || data.length === 0)
        throw new Error("해제할 수 없는 상태입니다. 새로고침 후 다시 확인해주세요.");

    const prevName =
        (before as { designer?: { name: string } | null } | null)?.designer?.name ?? null;

    await insertLog(
        supabase, taskId, userId,
        "outsourcing_status", "배정됨", "작업 대기",
        reason ?? "외주 배정 해제", userName,
    );
    await insertLog(
        supabase, taskId, userId,
        "assigned_designer", prevName, null,
        "외주 배정 해제", userName,
    );

    revalidateAll();
}


// ─────────────────────────────────────────────────────────────
// 단가 수정
// ─────────────────────────────────────────────────────────────

export type PriceResult =
    | { ok: true; price: number | null }
    | { ok: false; message: string };

/**
 * done 은 막는다. 승인 시 "단가가 확정됩니다"라고 사용자에게 약속했고,
 * 정산(outsourcing_settled_at)이 그 금액을 근거로 기록되기 때문.
 *
 * .not("outsourcing_status","eq","done") 이 낙관적 락 역할을 한다 —
 * 화면이 열려 있는 동안 다른 사람이 승인했으면 0건이 나온다.
 * null 은 "단가 미정"이라는 뜻이 있으므로 허용한다.
 */
export async function updateOutsourcingPrice(
    taskId: string,
    price: number | null,
): Promise<PriceResult> {
    if (price != null) {
        if (!Number.isInteger(price) || price < 0) {
            return { ok: false, message: "단가는 0 이상의 정수로 입력해주세요." };
        }
        if (price > 100_000_000) {
            return { ok: false, message: "단가가 너무 큽니다. 다시 확인해주세요." };
        }
    }

    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);
    const userName = await getCurrentUserName(supabase, userId);

    const { data: before } = await supabase
        .from("tasks")
        .select("outsourcing_price, outsourcing_status")
        .eq("id", taskId)
        .maybeSingle();

    if (!before) return { ok: false, message: "작업을 찾을 수 없습니다." };

    const prev = (before.outsourcing_price as number | null) ?? null;
    if (prev === price) return { ok: true, price };

    const { data, error } = await supabase
        .from("tasks")
        .update({ outsourcing_price: price })
        .eq("id", taskId)
        .not("outsourcing_status", "eq", "done")
        .is("outsourcing_settled_at", null)
        .select("id");

    if (error) throw new Error(`단가 수정 실패: ${error.message}`);
    if (!data || data.length === 0) {
        return {
            ok: false,
            message: "완료·정산된 작업의 단가는 수정할 수 없습니다. 새로고침 후 확인해주세요.",
        };
    }

    const won = (v: number | null) =>
        v == null ? "미정" : `${v.toLocaleString("ko-KR")}원`;

    // 외주에게도 보여야 한다. 자기가 받을 금액이 바뀐 것이므로
    const { status, round } = await loadRound(supabase, taskId);
    if (status) {
        await insertMessage(
            supabase, taskId, round, "price_changed", userId, userName,
            `단가가 ${won(prev)} → ${won(price)} 로 변경되었습니다.`,
        );
        await supabase
            .from("tasks")
            .update({ outsourcing_unread_worker: true })
            .eq("id", taskId);
    }

    await insertLog(
        supabase, taskId, userId,
        "outsourcing_price", won(prev), won(price),
        "단가 수정", userName,
    );

    revalidateAll();
    return { ok: true, price };
}

// /** 폴링용 — 사내 미확인 건수 */
// export async function fetchStaffUnreadCount(): Promise<number> {
//     const { supabase, userId } = await getClient();
//     await assertStaff(supabase, userId);
//
//     const { count } = await supabase
//         .from("tasks")
//         .select("id", { count: "exact", head: true })
//         .eq("outsourcing_unread_staff", true)
//         .is("deleted_at", null);
//
//     return count ?? 0;
// }
// ─────────────────────────────────────────────────────────────
// 정산
// ─────────────────────────────────────────────────────────────

export type SettleResult =
    | { ok: true; count: number; total: number }
    | { ok: false; message: string };

/**
 * 정산 권한. profiles.role 을 여기서 읽지 않고 SQL 함수를 부른다.
 * 허용 역할을 바꾸려면 can_settle() 만 고치면 되고 배포가 필요 없다.
 */
async function canSettle(
    supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<boolean> {
    const { data, error } = await supabase.rpc("can_settle");
    if (error) throw new Error(`권한 확인 실패: ${error.message}`);
    return data === true;
}

/** 정산 확인 화면용 — 이 작업자의 미정산 완료 건 */
export async function fetchUnsettledTasks(designerId: string) {
    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);

    const { data, error } = await supabase
        .from("tasks")
        .select("id, customer_name, order_method, outsourcing_price, completed_at")
        .eq("assigned_designer_id", designerId)
        .eq("outsourcing_status", "done")
        .is("outsourcing_settled_at", null)
        .is("deleted_at", null)
        .order("completed_at", { ascending: true });

    if (error) throw new Error(`미정산 내역 조회 실패: ${error.message}`);
    return data ?? [];
}

/**
 * 작업자 단위 일괄 정산.
 *
 * ★ outsourcing_price 를 건드리지 않는다. 바뀌는 것은
 *   "합계에 잡히는 범위"이지 금액이 아니다.
 *
 * .is("outsourcing_settled_at", null) 이 낙관적 락 역할을 한다.
 * 두 사람이 동시에 눌러도 두 번째는 0건이 나온다.
 */
export async function settleDesignerTasks(
    designerId: string,
    expectedTotal: number,
): Promise<SettleResult> {
    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);

    // 예상된 거절은 throw 하지 않는다 (5-3 ㉓)
    if (!(await canSettle(supabase))) {
        return { ok: false, message: "정산을 처리할 권한이 없습니다." };
    }

    const userName = await getCurrentUserName(supabase, userId);

    const { data, error } = await supabase
        .from("tasks")
        .update({
            outsourcing_settled_at: new Date().toISOString(),
            outsourcing_settled_by: userId,
        })
        .eq("assigned_designer_id", designerId)
        .eq("outsourcing_status", "done")
        .is("outsourcing_settled_at", null)
        .is("deleted_at", null)
        .select("id, outsourcing_price");

    if (error) throw new Error(`정산 처리 실패: ${error.message}`);

    const rows = data ?? [];
    if (rows.length === 0) {
        return { ok: false, message: "정산할 건이 없습니다. 이미 처리됐을 수 있습니다." };
    }

    const total = rows.reduce(
        (s, t) => s + ((t.outsourcing_price as number | null) ?? 0), 0,
    );

    // 화면이 본 금액과 실제가 다르면 알린다. 되돌리지는 않는다 —
    // 이미 지급했는데 기록만 없는 상태가 더 나쁘다
    const mismatch = total !== expectedTotal;

    for (const t of rows) {
        await insertLog(
            supabase, t.id as string, userId,
            "outsourcing_settled_at", null, new Date().toISOString(),
            mismatch
                ? `일괄 정산 (화면 ${expectedTotal.toLocaleString("ko-KR")}원 / 실제 ${total.toLocaleString("ko-KR")}원)`
                : "일괄 정산",
            userName,
        );
    }

    // ★v16 알림톡 T5 — 트리거가 아니라 여기서 작업자당 1행 (건마다 쌓으면 N통이 간다).
    // notification_outbox 는 서버 전용(RLS · 권한 회수)이라 RLS 클라이언트로는 못 넣는다 → admin.
    // 금액은 화면 값(expectedTotal)이 아니라 DB 합계(total). 적재 실패가 정산을 되돌리면 안 된다 → 로그만
    try {
        const { error: notifyError } = await createAdminClient()
            .from("notification_outbox")
            .insert({
                event: "settled",
                recipient_side: "outsourcing",
                recipient_designer_id: designerId,
                payload: { count: rows.length, total },
            });
        if (notifyError) console.error("[notify] settled 적재 실패:", notifyError.message);
    } catch (e) {
        console.error("[notify] settled 적재 실패:", e);
    }

    revalidateAll();
    return { ok: true, count: rows.length, total };
}


/** 폴링용 — 외주가 보낸 메시지 누적 건수. 늘면 새 소식. */
export async function fetchIncomingMessageCountForStaff(): Promise<number> {
    const { supabase, userId } = await getClient();
    await assertStaff(supabase, userId);

    const { data: tasks } = await supabase
        .from("tasks")
        .select("id")
        .not("outsourcing_status", "is", null)
        .is("deleted_at", null);

    const ids = (tasks ?? []).map((t) => t.id as string);
    if (ids.length === 0) return 0;

    const { count } = await supabase
        .from("outsourcing_messages")
        .select("id", { count: "exact", head: true })
        .in("task_id", ids)
        .eq("side", "outsourcing");

    return count ?? 0;
}