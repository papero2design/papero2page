"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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

/**
 * 현재 로그인 유저의 표시 이름 조회
 * profiles.name → 없으면 auth.users.email 앞부분 fallback
 */
async function getCurrentUserName(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string | null,
): Promise<string | null> {
    if (!userId) return null;
    const { data } = await supabase
        .from("profiles")
        .select("name")
        .eq("id", userId)
        .single();
    if (data?.name) return data.name;
    // fallback: auth email
    const { data: authUser } = await supabase.auth.getUser();
    return authUser.user?.email?.split("@")[0] ?? null;
}

/**
 * task_logs에 변경 기록 삽입
 * changed_by_name: 변경자 이름 (로그 타임라인에 표시)
 */
async function insertLog(
    supabase: Awaited<ReturnType<typeof createClient>>,
    taskId: string,
    userId: string | null,
    changedField: string,
    oldValue: string | null,
    newValue: string | null,
    reason?: string | null,
    changedByName?: string | null,
) {
    const { error } = await supabase.from("task_logs").insert({
        task_id: taskId,
        user_id: userId,
        changed_field: changedField,
        old_value: oldValue,
        new_value: newValue,
        reason: reason ?? null,
        // changed_by_name 컬럼이 없으면 reason에 이름 포함시켜 fallback
        // migration으로 컬럼 추가 후에는 별도 컬럼으로 저장
    });
    // changed_by_name 컬럼은 아래 migration으로 추가:
    // ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS changed_by_name TEXT;
    if (error) console.error("[task_logs insert error]", error.message);
}

function revalidateAll() {
    revalidatePath("/board");
    revalidatePath("/board/quick");
    revalidatePath("/board/simple");
    revalidatePath("/board/done");
    revalidatePath("/board/stats");
    revalidatePath("/board/trash");
}

// ─────────────────────────────────────────────────────────────
// CREATE
// ─────────────────────────────────────────────────────────────

export async function createTask(data: {
    order_source: string;
    customer_name: string;
    order_method: string;
    order_method_note: string | null;
    print_items: string;
    post_processing: string;
    file_paths: string[];
    consult_path: string;
    consult_link: string | null;
    special_details: string | null;
    assigned_designer_id: string | null;
    is_priority: boolean;
    is_quick: boolean;
}) {
    const { supabase, userId } = await getClient();
    const userName = await getCurrentUserName(supabase, userId);

    const { data: task, error } = await supabase
        .from("tasks")
        .insert(data)
        .select("id")
        .single();

    if (error) throw new Error(`작업 등록 실패: ${error.message}`);

    await insertLog(
        supabase,
        task.id,
        userId,
        "status",
        null,
        "대기중",
        `작업 등록`,
        userName,
    );
    revalidateAll();
}

// ─────────────────────────────────────────────────────────────
// READ — 변경 로그
// ─────────────────────────────────────────────────────────────

export type LogEntry = {
    id: string;
    changed_field: string;
    old_value: string | null;
    new_value: string | null;
    reason: string | null;
    changed_by_name: string | null;
    created_at: string;
};

export async function getTaskLogs(taskId: string): Promise<LogEntry[]> {
    const { supabase } = await getClient();

    // changed_by_name 컬럼은 아래 SQL로 추가 필요:
    // ALTER TABLE task_logs ADD COLUMN IF NOT EXISTS changed_by_name TEXT;
    const { data, error } = await supabase
        .from("task_logs")
        .select(
            "id, changed_field, old_value, new_value, reason, changed_by_name, created_at",
        )
        .eq("task_id", taskId)
        .order("created_at", { ascending: false })
        .limit(50);

    if (error)
        throw new Error(
            `로그 조회 실패: ${error.message}\n` +
                `→ task-number-log-schema.sql 및 changed_by_name 컬럼 추가 필요`,
        );

    type RawRow = {
        id: string;
        changed_field: string;
        old_value: string | null;
        new_value: string | null;
        reason: string | null;
        changed_by_name?: string | null;
        created_at: string;
    };

    return ((data ?? []) as unknown as RawRow[]).map((r) => ({
        id: r.id,
        changed_field: r.changed_field,
        old_value: r.old_value,
        new_value: r.new_value,
        reason: r.reason,
        changed_by_name: r.changed_by_name ?? null,
        created_at: r.created_at,
    }));
}

// ─────────────────────────────────────────────────────────────
// UPDATE — 상태 변경
// ─────────────────────────────────────────────────────────────

export async function updateTaskStatus(
    id: string,
    oldStatus: string,
    newStatus: string,
    completedAt?: string | null,
    reason?: string | null,
) {
    const { supabase, userId } = await getClient();
    const userName = await getCurrentUserName(supabase, userId);

    const payload: Record<string, unknown> = { status: newStatus };
    if (completedAt !== undefined) payload.completed_at = completedAt;

    const { error } = await supabase.from("tasks").update(payload).eq("id", id);
    if (error) throw new Error(`상태 변경 실패: ${error.message}`);

    await insertLog(
        supabase,
        id,
        userId,
        "status",
        oldStatus,
        newStatus,
        reason,
        userName,
    );
    revalidateAll();
}

// ─────────────────────────────────────────────────────────────
// UPDATE — 내용 수정
// ─────────────────────────────────────────────────────────────

export async function updateTask(
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
        is_priority: boolean;
        is_quick: boolean;
    },
    logs: { field: string; oldValue: string | null; newValue: string | null }[],
    reason?: string | null,
) {
    const { supabase, userId } = await getClient();
    const userName = await getCurrentUserName(supabase, userId);

    const { error } = await supabase.from("tasks").update(data).eq("id", id);
    if (error) throw new Error(`수정 실패: ${error.message}`);

    for (const log of logs) {
        if ((log.oldValue ?? "") !== (log.newValue ?? "")) {
            await insertLog(
                supabase,
                id,
                userId,
                log.field,
                log.oldValue,
                log.newValue,
                reason,
                userName,
            );
        }
    }
    revalidateAll();
}

// ─────────────────────────────────────────────────────────────
// UPDATE — 우선작업 토글 (사유 입력 포함)
// ─────────────────────────────────────────────────────────────

export async function togglePriority(
    id: string,
    newValue: boolean,
    reason?: string | null,
) {
    const { supabase, userId } = await getClient();
    const userName = await getCurrentUserName(supabase, userId);

    const { error } = await supabase
        .from("tasks")
        .update({ is_priority: newValue })
        .eq("id", id);
    if (error) throw new Error(`우선작업 변경 실패: ${error.message}`);

    await insertLog(
        supabase,
        id,
        userId,
        "is_priority",
        String(!newValue),
        String(newValue),
        reason ?? (newValue ? "우선작업 등록" : "우선작업 해제"),
        userName,
    );
    revalidateAll();
}

// ─────────────────────────────────────────────────────────────
// DELETE — 소프트 삭제
// ─────────────────────────────────────────────────────────────

export async function deleteTask(id: string, reason?: string | null) {
    const { supabase, userId } = await getClient();
    const userName = await getCurrentUserName(supabase, userId);

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
        "deleted",
        task?.customer_name ?? null,
        "휴지통",
        reason,
        userName,
    );
    revalidateAll();
}

export async function deleteTasks(ids: string[], reason?: string | null) {
    if (ids.length === 0) return;
    const { supabase, userId } = await getClient();
    const userName = await getCurrentUserName(supabase, userId);

    const { error } = await supabase
        .from("tasks")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", ids);
    if (error) throw new Error(`선택삭제 실패: ${error.message}`);

    await Promise.all(
        ids.map((id) =>
            insertLog(
                supabase,
                id,
                userId,
                "deleted",
                null,
                "휴지통",
                reason,
                userName,
            ),
        ),
    );
    revalidateAll();
}

// ─────────────────────────────────────────────────────────────
// 휴지통
// ─────────────────────────────────────────────────────────────

export async function getTrashTasks(): Promise<
    {
        id: string;
        task_number: number | null;
        customer_name: string;
        order_source: string;
        order_method: string;
        print_items: string;
        status: string;
        is_priority: boolean;
        created_at: string;
        deleted_at: string;
        designer: { id: string; name: string } | null;
    }[]
> {
    const { supabase } = await getClient();

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

    type Row = {
        id: string;
        task_number: number | null;
        customer_name: string;
        order_source: string;
        order_method: string;
        print_items: string;
        status: string;
        is_priority: boolean;
        created_at: string;
        deleted_at: string | null;
        designer: { id: string; name: string } | null;
    };

    return ((data ?? []) as unknown as Row[]).map((t) => ({
        id: t.id,
        task_number: t.task_number,
        customer_name: t.customer_name,
        order_source: t.order_source,
        order_method: t.order_method,
        print_items: t.print_items,
        status: t.status,
        is_priority: t.is_priority,
        created_at: t.created_at,
        deleted_at: t.deleted_at ?? "",
        designer: t.designer,
    }));
}

export async function restoreTask(id: string) {
    const { supabase, userId } = await getClient();
    const userName = await getCurrentUserName(supabase, userId);

    const { error } = await supabase
        .from("tasks")
        .update({ deleted_at: null })
        .eq("id", id);
    if (error) throw new Error(`복구 실패: ${error.message}`);

    await insertLog(
        supabase,
        id,
        userId,
        "restored",
        "휴지통",
        "복구됨",
        null,
        userName,
    );
    revalidateAll();
}

export async function hardDeleteTask(id: string) {
    const { supabase } = await getClient();
    const { error } = await supabase.from("tasks").delete().eq("id", id);
    if (error) throw new Error(`영구삭제 실패: ${error.message}`);
    revalidatePath("/board/trash");
}
