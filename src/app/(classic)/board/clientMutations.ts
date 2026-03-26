// clientMutations.ts
// 서버 액션 제거 — 브라우저에서 Supabase로 직접 호출
// Before: 브라우저 → Vercel → Supabase → Vercel → 브라우저  (300-800ms)
// After:  브라우저 → Supabase 직접                          (50-150ms)

import { createClient } from "@/lib/supabase/client";

export type LogEntry = {
    id: string;
    changed_field: string;
    old_value: string | null;
    new_value: string | null;
    reason: string | null;
    changed_by_name: string | null;
    created_at: string;
};

// 세션은 localStorage에서 즉시 읽고, profile만 한 번 fetch
async function withUser() {
    const supabase = createClient();
    const {
        data: { session },
    } = await supabase.auth.getSession(); // 네트워크 없음, localStorage 즉시 읽기
    const userId = session?.user?.id ?? null;
    const fallbackName = session?.user?.email?.split("@")[0] ?? null;
    if (!userId) throw new Error("로그인이 필요합니다.");

    const { data: profile } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", userId)
        .single();

    return {
        supabase,
        userId,
        userName: profile?.name ?? fallbackName,
    };
}

async function insertLog(
    supabase: ReturnType<typeof createClient>,
    taskId: string,
    userId: string,
    userName: string | null,
    changedField: string,
    oldValue: string | null,
    newValue: string | null,
    reason?: string | null,
) {
    await supabase.from("task_logs").insert({
        task_id: taskId,
        user_id: userId,
        changed_field: changedField,
        old_value: oldValue,
        new_value: newValue,
        reason: reason ?? null,
        changed_by_name: userName,
    });
}

// ── 상태 변경 ────────────────────────────────────────────────
export async function clientUpdateTaskStatus(
    id: string,
    oldStatus: string,
    newStatus: string,
    completedAt?: string | null,
    reason?: string | null,
) {
    const { supabase, userId, userName } = await withUser();
    const payload: Record<string, unknown> = { status: newStatus };
    if (completedAt !== undefined) payload.completed_at = completedAt;

    const { error } = await supabase.from("tasks").update(payload).eq("id", id);
    if (error) throw new Error(`상태 변경 실패: ${error.message}`);

    await insertLog(supabase, id, userId, userName, "status", oldStatus, newStatus, reason);
}

// ── 내용 수정 ────────────────────────────────────────────────
export async function clientUpdateTask(
    id: string,
    data: {
        order_source: string;
        customer_name: string;
        order_method: string;
        order_method_note: string | null;
        print_items: string;
        post_processing: string;
        consult_path: string;
        consult_link: string | null;
        special_details: string | null;
        assigned_designer_id: string | null;
        registered_by: string | null;
        is_priority: boolean;
        is_quick: boolean;
    },
    logs: { field: string; oldValue: string | null; newValue: string | null }[],
    reason?: string | null,
) {
    const { supabase, userId, userName } = await withUser();

    const { error } = await supabase.from("tasks").update(data).eq("id", id);
    if (error) throw new Error(`수정 실패: ${error.message}`);

    await Promise.all(
        logs
            .filter((l) => (l.oldValue ?? "") !== (l.newValue ?? ""))
            .map((l) =>
                insertLog(supabase, id, userId, userName, l.field, l.oldValue, l.newValue, reason),
            ),
    );
}

// ── 우선작업 토글 ─────────────────────────────────────────────
export async function clientTogglePriority(
    id: string,
    newValue: boolean,
    reason?: string | null,
) {
    const { supabase, userId, userName } = await withUser();

    const { error } = await supabase
        .from("tasks")
        .update({ is_priority: newValue })
        .eq("id", id);
    if (error) throw new Error(`우선작업 변경 실패: ${error.message}`);

    await insertLog(
        supabase,
        id,
        userId,
        userName,
        "is_priority",
        String(!newValue),
        String(newValue),
        reason ?? (newValue ? "우선작업 등록" : "우선작업 해제"),
    );
}

// ── 소프트 삭제 ───────────────────────────────────────────────
export async function clientDeleteTask(id: string, reason?: string | null) {
    const { supabase, userId, userName } = await withUser();

    const { data: task } = await supabase
        .from("tasks")
        .select("customer_name")
        .eq("id", id)
        .single();

    const { error } = await supabase
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
    if (error) throw new Error(`삭제 실패: ${error.message}`);

    await insertLog(
        supabase,
        id,
        userId,
        userName,
        "deleted",
        task?.customer_name ?? null,
        "휴지통",
        reason,
    );
}

export async function clientDeleteTasks(ids: string[], reason?: string | null) {
    if (!ids.length) return;
    const { supabase, userId, userName } = await withUser();

    const { error } = await supabase
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
    if (error) throw new Error(`선택삭제 실패: ${error.message}`);

    await Promise.all(
        ids.map((id) =>
            insertLog(supabase, id, userId, userName, "deleted", null, "휴지통", reason),
        ),
    );
}

// ── 일괄 완료 ─────────────────────────────────────────────────
export async function clientBulkComplete(
    ids: string[],
    oldStatuses: Map<string, string>,
) {
    if (!ids.length) return;
    const { supabase, userId, userName } = await withUser();
    const now = new Date().toISOString();

    const { error } = await supabase
        .from("tasks")
        .update({ status: "완료", completed_at: now })
        .in("id", ids);
    if (error) throw new Error(`일괄 완료 실패: ${error.message}`);

    await Promise.all(
        ids.map((id) =>
            insertLog(
                supabase, id, userId, userName,
                "status", oldStatuses.get(id) ?? "작업중", "완료", "일괄완료",
            ),
        ),
    );
}

// ── 일괄 담당 디자이너 변경 ────────────────────────────────────
// oldNameMap은 이미 렌더된 tasks에서 직접 구축 → 추가 DB 쿼리 없음
export async function clientBulkUpdateDesigner(
    ids: string[],
    designerId: string | null,
    designerName: string | null,
    oldNameMap: Map<string, string | null>,
) {
    if (!ids.length) return;
    const { supabase, userId, userName } = await withUser();

    const { error } = await supabase
        .from("tasks")
        .update({ assigned_designer_id: designerId })
        .in("id", ids);
    if (error) throw new Error(`일괄 디자이너 변경 실패: ${error.message}`);

    await Promise.all(
        ids.map((id) =>
            insertLog(
                supabase,
                id,
                userId,
                userName,
                "assigned_designer",
                oldNameMap.get(id) ?? null,
                designerName ?? null,
                "일괄 변경",
            ),
        ),
    );
}

// ── 변경 로그 조회 ─────────────────────────────────────────────
export async function clientGetTaskLogs(taskId: string): Promise<LogEntry[]> {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("task_logs")
        .select("id, changed_field, old_value, new_value, reason, changed_by_name, created_at")
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(50);
    if (error) throw new Error(`로그 조회 실패: ${error.message}`);
    return (data ?? []) as LogEntry[];
}

// ── 휴지통 조회 ────────────────────────────────────────────────
export async function clientGetTrashTasks() {
    const supabase = createClient();
    const { data, error } = await supabase
        .from("tasks")
        .select(
            "id, task_number, customer_name, order_source, order_method, " +
                "print_items, status, is_priority, created_at, deleted_at, " +
                "designer:designers(id, name)",
        )
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });
    if (error) throw new Error(`휴지통 조회 실패: ${error.message}`);
    return data ?? [];
}

// ── 휴지통 복구 ────────────────────────────────────────────────
export async function clientRestoreTask(id: string) {
    const { supabase, userId, userName } = await withUser();
    const { error } = await supabase
        .from("tasks")
        .update({ deleted_at: null })
        .eq("id", id);
    if (error) throw new Error(`복구 실패: ${error.message}`);
    await insertLog(supabase, id, userId, userName, "restored", "휴지통", "복구됨", null);
}

// ── 영구삭제 ──────────────────────────────────────────────────
export async function clientHardDeleteTask(id: string) {
    const supabase = createClient();
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw new Error(`영구삭제 실패: ${error.message}`);
}
