// src/app/outsourcing/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordTaskFiles, TASK_FILE_SELECT } from "@/lib/tasks/files";
import type { FileRole, MessageKind, MessageSide } from "@/types/database";



export type OutsourcingTask = {
    id: string;
    customer_name: string;
    print_items: string;
    post_processing: string | null;
    special_details: string | null;
    order_source: string | null;
    order_method: string | null;
    status: string | null;
    is_priority: boolean | null;
    is_quick: boolean | null;
    due_at: string | null;
    created_at: string | null;
    outsourcing_price: number | null;
    outsourcing_status: string | null;
    outsourcing_round: number;
    outsourcing_visible_from_round: number;
    outsourcing_unread_worker: boolean;
    outsourcing_settled_at: string | null;
};

export type TaskFile = {
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

export type Message = {
    id: string;
    round: number;
    side: MessageSide;
    kind: MessageKind;
    body: string;
    author_name: string | null;
    created_at: string;
};

export type ClaimResult =
    | { ok: true }
    | { ok: false; reason: "taken" | "closed" | "gone"; message: string };

const TASK_FIELDS =
    "id, customer_name, print_items, post_processing, special_details, " +
    "order_source, order_method, status, is_priority, is_quick, due_at, created_at, " +
    "outsourcing_price, outsourcing_status, outsourcing_round, " +
    "outsourcing_visible_from_round, outsourcing_unread_worker, outsourcing_settled_at";

const MSG_SELECT = "id, round, side, kind, body, author_name, created_at";

// ─────────────────────────────────────────────────────────────
// 공통 가드
// ─────────────────────────────────────────────────────────────

async function assertOutsourcing() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    if (profile?.role !== "outsourcing") {
        throw new Error("외주 계정만 접근할 수 있습니다.");
    }

    const { data: designer } = await supabase
        .from("designers")
        .select("id, name")
        .eq("user_id", user.id)
        .single();
    if (!designer) {
        throw new Error(
            "연결된 멤버 정보를 찾을 수 없습니다. 관리자에게 문의해주세요.",
        );
    }

    return {
        supabase,
        userId: user.id,
        designerId: designer.id,
        designerName: designer.name,
    };
}

/** 본인 작업인지 확인하고 상태·라운드를 함께 돌려준다 */
async function loadOwnTask(
    admin: ReturnType<typeof createAdminClient>,
    taskId: string,
    designerId: string,
) {
    const { data: task } = await admin
        .from("tasks")
        .select("assigned_designer_id, outsourcing_status, outsourcing_round, outsourcing_visible_from_round")
        .eq("id", taskId)
        .maybeSingle();

    if (!task) throw new Error("작업을 찾을 수 없습니다.");
    if (task.assigned_designer_id !== designerId) {
        throw new Error("본인에게 배정된 작업만 처리할 수 있습니다.");
    }
    return {
        status: task.outsourcing_status as string | null,
        round: (task.outsourcing_round as number | null) ?? 1,
        visibleFrom: (task.outsourcing_visible_from_round as number | null) ?? 1,
    };
}

// ─────────────────────────────────────────────────────────────
// 조회
// ─────────────────────────────────────────────────────────────

export async function fetchAvailableOutsourcingTasks(): Promise<OutsourcingTask[]> {
    const { supabase } = await assertOutsourcing();

    const { data, error } = await supabase
        .from("tasks")
        .select(TASK_FIELDS)
        .eq("outsourcing_status", "open")
        .is("deleted_at", null)
        .order("is_priority", { ascending: false })
        .order("created_at", { ascending: true });

    if (error) throw new Error(`작업목록 조회 실패: ${error.message}`);
    return (data ?? []) as unknown as OutsourcingTask[];
}

export async function fetchMyOutsourcingTasks(): Promise<OutsourcingTask[]> {
    const { supabase, designerId } = await assertOutsourcing();

    const { data, error } = await supabase
        .from("tasks")
        .select(TASK_FIELDS)
        .eq("assigned_designer_id", designerId)
        .in("outsourcing_status", ["claimed", "review", "customer_review", "rework"])   // ★v16
        .is("deleted_at", null)
        .order("outsourcing_unread_worker", { ascending: false })
        .order("created_at", { ascending: false });

    if (error) throw new Error(`내 작업 조회 실패: ${error.message}`);
    return (data ?? []) as unknown as OutsourcingTask[];
}

export async function fetchDoneOutsourcingTasks(): Promise<OutsourcingTask[]> {
    const { supabase, designerId } = await assertOutsourcing();

    const { data, error } = await supabase
        .from("tasks")
        .select(TASK_FIELDS)
        .eq("assigned_designer_id", designerId)
        .eq("outsourcing_status", "done")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });

    if (error) throw new Error(`완료 작업 조회 실패: ${error.message}`);
    return (data ?? []) as unknown as OutsourcingTask[];
}

/**
 * 첨부파일 전체. 평면 배열로 내려주고 화면에서 file_role / outsourcing_round 로 묶는다.
 * ("use server" 모듈은 async 함수만 export 가능 → 그룹핑 헬퍼를 여기 둘 수 없음)
 * internal(사내 자체 결과물)은 외주에게 내려주지 않는다.
 */
export async function fetchTaskFiles(taskId: string): Promise<TaskFile[]> {
    const { designerId } = await assertOutsourcing();
    const admin = createAdminClient();

    const { visibleFrom } = await loadOwnTask(admin, taskId, designerId);

    const { data, error } = await admin
        .from("task_files")
        .select(TASK_FILE_SELECT)
        .eq("task_id", taskId)
        .neq("file_role", "internal")
        .order("created_at", { ascending: true });

    if (error) throw new Error(`첨부파일 조회 실패: ${error.message}`);

    const rows = (data ?? []) as unknown as TaskFile[];

    return rows.filter((f) => {
        const role = f.file_role;
        if (role !== "deliverable" && role !== "feedback") return true;
        return (f.outsourcing_round ?? 1) >= visibleFrom;
    });
}

/** 작업 풀 미리보기 — 전달 자료의 파일명만, URL은 내려주지 않는다 */
export async function fetchOpenTaskFileNames(
    taskId: string,
): Promise<{ name: string; size: number | null }[]> {
    await assertOutsourcing();
    const admin = createAdminClient();

    const { data: task } = await admin
        .from("tasks")
        .select("outsourcing_status")
        .eq("id", taskId)
        .maybeSingle();

    if (!task || task.outsourcing_status !== "open") return [];

    const { data } = await admin
        .from("task_files")
        .select("file_name, file_size")
        .eq("task_id", taskId)
        .eq("file_role", "source")
        .order("created_at", { ascending: true });

    return (data ?? []).map((f) => ({
        name: f.file_name as string,
        size: (f.file_size as number | null) ?? null,
    }));
}

/**
 * 검수 스레드. 기존 fetchLatestReworkReason(task_logs 문자열 매칭)을 대체한다.
 * 열어봤다는 뜻이므로 여기서 worker unread 를 내린다.
 */
export async function fetchMessages(taskId: string): Promise<Message[]> {
    const { designerId } = await assertOutsourcing();
    const admin = createAdminClient();

    const { visibleFrom } = await loadOwnTask(admin, taskId, designerId);

    // 이전 작업자의 대화는 남의 대화다. 회차로 자른다
    const { data, error } = await admin
        .from("outsourcing_messages")
        .select(MSG_SELECT)
        .eq("task_id", taskId)
        .gte("round", visibleFrom)
        .order("created_at", { ascending: true });

    if (error) throw new Error(`대화 내역 조회 실패: ${error.message}`);

    await admin
        .from("tasks")
        .update({ outsourcing_unread_worker: false })
        .eq("id", taskId)
        .eq("outsourcing_unread_worker", true);

    return (data ?? []) as unknown as Message[];
}

// ─────────────────────────────────────────────────────────────
// 작업 가져가기
// ─────────────────────────────────────────────────────────────

export async function claimOutsourcingTask(taskId: string): Promise<ClaimResult> {
    const { designerId, designerName } = await assertOutsourcing();
    const admin = createAdminClient();

    const {data, error} = await admin
        .from("tasks")
        .update({
            assigned_designer_id: designerId,
            outsourcing_status: "claimed",
            outsourcing_assigned_by_staff: false,
            outsourcing_unread_worker: false,
        })
        .eq("id", taskId)
        .eq("outsourcing_status", "open")
        .is("deleted_at", null)
        .select("id");

    // 쿼리가 터진 것 = 코드/DB 문제 → throw
    if (error) throw new Error(`작업 가져오기 실패: ${error.message}`);

    // 0행 = 예상된 거절 → 값으로. 왜 0행인지 확인해 정확히 안내한다
    if (!data || data.length === 0) {
        const { data: t } = await admin
            .from("tasks")
            .select("outsourcing_status, assigned_designer_id, deleted_at")
            .eq("id", taskId)
            .maybeSingle();

        if (!t || t.deleted_at) {
            return { ok: false, reason: "gone", message: "삭제된 작업입니다." };
        }
        if (t.assigned_designer_id) {
            return { ok: false, reason: "taken", message: "이미 다른 작업자가 가져갔습니다." };
        }
        return { ok: false, reason: "closed", message: "사내 작업으로 전환되어 목록에서 내려갔습니다." };
    }

    await admin.from("task_logs").insert({
        task_id: taskId,
        changed_field: "outsourcing_status",
        old_value: "작업 대기",
        new_value: "작업 중",
        reason: "외주 작업자가 직접 가져감",
        changed_by_name: designerName,
    });

    revalidatePath("/outsourcing");
    return {ok: true}
}

// ─────────────────────────────────────────────────────────────
// 결과물 업로드
// ─────────────────────────────────────────────────────────────

export async function attachOutsourcingFiles(
    taskId: string,
    files: { url: string; name: string; size: number }[],
) {
    if (files.length === 0) return;

    const { designerId, designerName } = await assertOutsourcing();
    const admin = createAdminClient();

    const { status, round } = await loadOwnTask(admin, taskId, designerId);
    if (status !== "claimed" && status !== "rework") {
        throw new Error("지금은 파일을 올릴 수 있는 상태가 아닙니다.");
    }

    await recordTaskFiles(
        admin,
        taskId,
        files.map((f) => ({
            file_name: f.name,
            file_url: f.url,
            file_size: f.size,
        })),
        "deliverable",
        round,
        designerName,
    );

    revalidatePath("/outsourcing");
}

/** 아직 검수 전인, 이번 라운드의 본인 업로드 파일만 삭제 */
export async function deleteOutsourcingFile(fileId: string) {
    const { designerId } = await assertOutsourcing();
    const admin = createAdminClient();

    const { data: file } = await admin
        .from("task_files")
        .select("id, task_id, file_role, outsourcing_round")
        .eq("id", fileId)
        .maybeSingle();

    if (!file) throw new Error("파일을 찾을 수 없습니다.");
    if (file.file_role !== "deliverable") {
        throw new Error("사내에서 등록한 파일은 삭제할 수 없습니다.");
    }

    const { status, round } = await loadOwnTask(
        admin,
        file.task_id as string,
        designerId,
    );
    if (status !== "claimed" && status !== "rework") {
        throw new Error("검수 중이거나 완료된 작업의 파일은 삭제할 수 없습니다.");
    }
    if ((file.outsourcing_round as number | null) !== round) {
        throw new Error("이전 회차에 제출한 파일은 삭제할 수 없습니다.");
    }

    const { error } = await admin.from("task_files").delete().eq("id", fileId);
    if (error) throw new Error(`파일 삭제 실패: ${error.message}`);

    revalidatePath("/outsourcing");
}

// ─────────────────────────────────────────────────────────────
// 검수 요청 (메시지 필수)
// ─────────────────────────────────────────────────────────────

/**
 * body 가 NOT NULL 이므로 메시지는 필수다.
 * - 결과물 검사는 "이번 라운드"로 스코프를 좁힌다. 전체로 세면
 *   2차에서 파일을 하나도 안 올리고 1차 파일로 통과된다.
 * - 상태 UPDATE 성공 후에만 메시지를 남긴다. 순서를 뒤집으면
 *   UPDATE 0건일 때 고아 메시지가 쌓인다.
 */
export async function requestReviewTask(
    taskId: string,
    message: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
    // const body = message?.trim();
    // if (!body) {
    //     // throw new Error("작업 내용이나 확인이 필요한 부분을 적어주세요.");
    //     return { ok: false, message: "작업 내용이나 확인이 필요한 부분을 적어주세요."}
    // }

    const body = message?.trim() ?? "";

    const { designerId, designerName, userId } = await assertOutsourcing();
    const admin = createAdminClient();

    const { status, round } = await loadOwnTask(admin, taskId, designerId);
    if (status !== "claimed" && status !== "rework") {
        // throw new Error("지금은 검수를 요청할 수 있는 상태가 아닙니다.");
        return { ok: false, message: "지금은 검수를 요청할 수 있는 상태가 아닙니다."}
    }

    const { count } = await admin
        .from("task_files")
        .select("id", { count: "exact", head: true })
        .eq("task_id", taskId)
        .eq("file_role", "deliverable")
        .eq("outsourcing_round", round);

    // if (!count) {
    //     throw new Error(
    //         round > 1
    //             ? "수정한 결과물을 먼저 올려주세요."
    //             : "작업 결과물을 먼저 올려주세요.",
    //     );
    // }
    if (!count) {
        return {
            ok: false,
            message: round > 1
                ? "수정한 결과물을 먼저 올려주세요."
                : "작업 결과물을 먼저 올려주세요."
        };
    }

    const { data, error } = await admin
        .from("tasks")
        .update({
            outsourcing_status: "review",
            outsourcing_unread_staff: true,
            outsourcing_unread_worker: false,
        })
        .eq("id", taskId)
        .in("outsourcing_status", ["claimed", "rework"])
        .eq("outsourcing_round", round) // 낙관적 락
        .select("id");

    if (error) throw new Error(`검수 요청 실패: ${error.message}`);
    if (!data || data.length === 0) {
        // throw new Error("이미 처리된 작업입니다. 목록을 새로고침해주세요.");
        return { ok: false, message: "이미 처리된 작업입니다. 목록을 새로고침해주세요."};
    }

    const { error: msgError } = await admin.from("outsourcing_messages").insert({
        task_id: taskId,
        round,
        side: "outsourcing",
        kind: "review_request",
        body,
        author_id: userId,
        author_name: designerName,
    });
    if (msgError) {
        throw new Error(
            `상태는 변경됐지만 메시지 저장에 실패했습니다: ${msgError.message}`,
        );
    }

    await admin.from("task_logs").insert({
        task_id: taskId,
        changed_field: "outsourcing_status",
        old_value: status === "rework" ? "수정 요청" : "작업 중",
        new_value: "검수 요청",
        reason: body || null,
        changed_by_name: designerName,
    });

    revalidatePath("/outsourcing");
    revalidatePath("/board/outsourcing");
    return {ok: true};
}

// ─────────────────────────────────────────────────────────────
// 문의 — 상태를 바꾸지 않는 질문
// ─────────────────────────────────────────────────────────────

export async function postWorkerMessage(
    taskId: string,
    message: string,
): Promise<{ ok: true } | { ok: false; message: string }> {
    const body = message?.trim();
    // if (!body) throw new Error("내용을 입력해주세요.");
    if (!body) return {ok: false, message: "내용을 입력해주세요."};

    const { designerId, designerName, userId } = await assertOutsourcing();
    const admin = createAdminClient();

    const { status, round } = await loadOwnTask(admin, taskId, designerId);
    if (!status || status === "open" || status === "done") {
        // throw new Error("지금은 문의를 남길 수 있는 상태가 아닙니다.");
        return {ok: false, message: "지금은 문의를 남길 수 있는 상태가 아닙니다."};
    }

    const { error } = await admin.from("outsourcing_messages").insert({
        task_id: taskId,
        round,
        side: "outsourcing",
        kind: "note",
        body,
        author_id: userId,
        author_name: designerName,
    });
    if (error) throw new Error(`전송 실패: ${error.message}`);

    await admin
        .from("tasks")
        .update({ outsourcing_unread_staff: true })
        .eq("id", taskId);

    revalidatePath("/outsourcing");
    revalidatePath("/board/outsourcing");
    return {ok: true};
}

// ─────────────────────────────────────────────────────────────
// 로그아웃
// ─────────────────────────────────────────────────────────────

export async function signOutAction() {
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
}

// ─────────────────────────────────────────────────────────────
// 폴링용
// ─────────────────────────────────────────────────────────────
// export async function fetchUnreadCount(): Promise<number> {
//     const { designerId } = await assertOutsourcing();
//     const admin = createAdminClient();
//
//     const { count } = await admin
//         .from("tasks")
//         .select("id", { count: "exact", head: true })
//         .eq("assigned_designer_id", designerId)
//         .eq("outsourcing_unread_worker", true)
//         .in("outsourcing_status", ["claimed", "review", "rework"])
//         .is("deleted_at", null);
//
//     return count ?? 0;
// }

export async function fetchIncomingMessageCount(): Promise<number> {
    const { designerId } = await assertOutsourcing();
    const admin = createAdminClient();

    const { data: tasks } = await admin
        .from("tasks")
        .select("id")
        .eq("assigned_designer_id", designerId)
        .in("outsourcing_status", ["claimed", "review", "customer_review", "rework"])   // ★v16
        .is("deleted_at", null);

    const ids = (tasks ?? []).map((t) => t.id as string);
    if (ids.length === 0) return 0;

    const { count } = await admin
        .from("outsourcing_messages")
        .select("id", { count: "exact", head: true })
        .in("task_id", ids)
        .eq("side", "staff");

    return count ?? 0;
}
// ─────────────────────────────────────────────────────────────
// ★v16 Ch4 — 카톡 알림 연락처 (문서 13-7-9)
// designer_contacts 는 RLS ON + 정책 없음 + 권한 회수 (4-10) → 브라우저로는 못 쓴다.
// assertOutsourcing 이 로그인 사용자의 designers.user_id 로 designerId 를 정한다.
// 인자로 designerId 를 받지 않는다 → 남의 번호를 쓰거나 읽을 길이 없다.
// ─────────────────────────────────────────────────────────────

export type NotifyContactState = {
    phone: string | null;       // 본인 번호 (숫자만). 본인에게만 돌려준다
    consentAt: string | null;   // null = 미동의 → dispatch 가 skipped
};

export type NotifyContactResult =
    | { ok: true; state: NotifyContactState }
    | { ok: false; message: string };

/** 휴대폰만 받는다. 알림톡은 휴대폰으로만 온다 (DB CHECK 는 유선번호도 통과시킨다) */
function normalizeMobile(v: string): string | null {
    const d = (v ?? "").replace(/\D/g, "");
    return /^01[016789]\d{7,8}$/.test(d) ? d : null;
}

export async function fetchMyNotifyContact(): Promise<NotifyContactState> {
    const { designerId } = await assertOutsourcing();
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("designer_contacts")
        .select("phone, notify_consent_at")
        .eq("designer_id", designerId)
        .maybeSingle();
    if (error) throw new Error(`알림 설정 조회 실패: ${error.message}`);
    return {
        phone: (data?.phone as string | null) ?? null,
        consentAt: (data?.notify_consent_at as string | null) ?? null,
    };
}

export async function saveMyNotifyContact(input: {
    phone: string;
    consent: boolean;
}): Promise<NotifyContactResult> {
    const { designerId } = await assertOutsourcing();

    const phone = normalizeMobile(input.phone);
    if (!phone) {
        return { ok: false, message: "휴대폰 번호를 확인해주세요. (예: 010-1234-5678)" };
    }
    // 동의 없이 번호만 저장하지 않는다 — 쓸 곳이 없는 개인정보다
    if (input.consent !== true) {
        return { ok: false, message: "알림 수신과 개인정보 수집·이용에 동의해야 등록됩니다." };
    }

    const now = new Date().toISOString();
    const admin = createAdminClient();
    const { error } = await admin
        .from("designer_contacts")
        .upsert(
            { designer_id: designerId, phone, notify_consent_at: now, updated_at: now },
            { onConflict: "designer_id" },
        );
    if (error) {
        console.error("[saveMyNotifyContact]", error.message);
        return { ok: false, message: "저장하지 못했습니다. 잠시 후 다시 시도해주세요." };
    }
    return { ok: true, state: { phone, consentAt: now } };
}

/** 알림 끄기 = 행 삭제. 동의를 거둔 사람의 번호는 남기지 않는다 */
export async function removeMyNotifyContact(): Promise<NotifyContactResult> {
    const { designerId } = await assertOutsourcing();
    const admin = createAdminClient();
    const { error } = await admin
        .from("designer_contacts")
        .delete()
        .eq("designer_id", designerId);
    if (error) {
        console.error("[removeMyNotifyContact]", error.message);
        return { ok: false, message: "해제하지 못했습니다. 잠시 후 다시 시도해주세요." };
    }
    return { ok: true, state: { phone: null, consentAt: null } };
}
