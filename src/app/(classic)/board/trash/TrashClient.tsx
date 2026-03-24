"use client";

import { useState, useEffect, useTransition, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { clientRestoreTask, clientHardDeleteTask } from "../clientMutations";
import { TaskDetailModal } from "../BoardTable";
import { type TaskWithDesigner } from "@/types/database";
import { useToast } from "../Toast";
import PaginationClient from "../PaginationClient";

const PAGE_SIZE = 15;

function ConfirmDialog({
    message,
    confirmLabel,
    danger = false,
    onConfirm,
    onCancel,
}: {
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
}) {
    return (
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 2000,
                padding: 16,
            }}
        >
            <div
                style={{
                    background: "#fff",
                    borderRadius: 8,
                    padding: "24px 24px 20px",
                    width: 360,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                }}
            >
                <p
                    style={{
                        margin: "0 0 20px",
                        color: "#111827",
                        fontWeight: 600,
                        whiteSpace: "pre-line",
                    }}
                >
                    {message}
                </p>
                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={onCancel} style={btn(false)}>
                        취소
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            ...btn(true),
                            ...(danger ? { background: "#ef4444", borderColor: "#ef4444" } : {}),
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function TrashClient() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));

    const [tasks, setTasks] = useState<TaskWithDesigner[]>([]);
    const [totalPages, setTotalPages] = useState(1);
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [modalTask, setModalTask] = useState<TaskWithDesigner | null>(null);
    const [restoreTarget, setRestoreTarget] = useState<TaskWithDesigner | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<TaskWithDesigner | null>(null);
    const { showToast, ToastUI } = useToast();

    const loadTasks = useCallback(async () => {
        setLoading(true);
        const supabase = createClient();
        const from = (page - 1) * PAGE_SIZE;
        const { data, count } = await supabase
            .from("tasks")
            .select(
                "id, task_number, order_source, customer_name, order_method, order_method_note, " +
                "print_items, post_processing, file_paths, " +
                "consult_path, consult_link, special_details, registered_by, " +
                "status, is_priority, is_quick, created_at, deleted_at, " +
                "designer:designers(id, name)",
                { count: "exact" },
            )
            .not("deleted_at", "is", null)
            .order("deleted_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1);

        setTasks((data ?? []) as unknown as TaskWithDesigner[]);
        setTotalPages(Math.ceil((count ?? 0) / PAGE_SIZE) || 1);
        setLoading(false);
    }, [page]);

    useEffect(() => { loadTasks(); }, [loadTasks]);

    const handleRestore = (task: TaskWithDesigner) => {
        setRestoreTarget(null);
        startTransition(async () => {
            try {
                await clientRestoreTask(task.id);
                setTasks((prev) => prev.filter((t) => t.id !== task.id));
                if (modalTask?.id === task.id) setModalTask(null);
            } catch (err) {
                showToast("복구 실패: " + (err as Error).message);
            }
        });
    };

    const handleHardDelete = (task: TaskWithDesigner) => {
        setDeleteTarget(null);
        startTransition(async () => {
            try {
                await clientHardDeleteTask(task.id);
                setTasks((prev) => prev.filter((t) => t.id !== task.id));
                if (modalTask?.id === task.id) setModalTask(null);
            } catch (err) {
                showToast("영구삭제 실패: " + (err as Error).message);
            }
        });
    };

    return (
        <div
            style={{
                width: "100%",
                maxWidth: 1260,
                margin: "0 auto",
                padding: "0 16px 40px",
            }}
        >
            <div
                style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: 10,
                    marginBottom: 20,
                    paddingTop: 4,
                }}
            >
                <span style={{ fontSize: 20 }}>🗑</span>
                <div>
                    <h2 style={{ margin: 0, fontWeight: 800, color: "#111827", fontSize: 20 }}>
                        휴지통
                    </h2>
                    <p style={{ margin: 0, color: "#9ca3af" }}>
                        삭제된 작업 {tasks.length}건을 복구하거나 영구삭제할 수 있습니다
                    </p>
                </div>
            </div>

            {ToastUI}

            {modalTask && (
                <TaskDetailModal
                    task={modalTask}
                    onClose={() => setModalTask(null)}
                    onDeleted={() => {
                        setTasks((prev) => prev.filter((t) => t.id !== modalTask.id));
                        setModalTask(null);
                    }}
                    designers={[]}
                    canEditDesigner={false}
                />
            )}
            {restoreTarget && (
                <ConfirmDialog
                    message={`"${restoreTarget.customer_name}" 작업을 복구할까요?\n작업 목록으로 돌아갑니다.`}
                    confirmLabel="복구"
                    onConfirm={() => handleRestore(restoreTarget)}
                    onCancel={() => setRestoreTarget(null)}
                />
            )}
            {deleteTarget && (
                <ConfirmDialog
                    message={`"${deleteTarget.customer_name}" 작업을 영구삭제할까요?\n이 작업은 되돌릴 수 없습니다.`}
                    confirmLabel="영구삭제"
                    danger
                    onConfirm={() => handleHardDelete(deleteTarget)}
                    onCancel={() => setDeleteTarget(null)}
                />
            )}

            {loading ? (
                <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
                    불러오는 중...
                </div>
            ) : tasks.length === 0 ? (
                <div
                    style={{
                        textAlign: "center",
                        padding: "60px 0",
                        color: "#9ca3af",
                        border: "1px dashed #e5e7eb",
                        borderRadius: 8,
                    }}
                >
                    <div style={{ fontSize: 32, marginBottom: 8 }}>🗑</div>
                    <p style={{ margin: 0, fontWeight: 600 }}>휴지통이 비어있습니다</p>
                    <p style={{ margin: "4px 0 0", color: "#d1d5db" }}>
                        삭제된 작업이 여기에 표시됩니다
                    </p>
                </div>
            ) : (
                <>
                    <table style={{ width: "100%", borderCollapse: "collapse" }}>
                        <thead>
                            <tr
                                style={{
                                    borderTop: "2px solid #111827",
                                    borderBottom: "1px solid #e5e7eb",
                                    background: "#f9fafb",
                                }}
                            >
                                {["번호", "고객이름", "주문방법", "인쇄항목", "담당 디자이너", "삭제일", ""].map((h) => (
                                    <th
                                        key={h}
                                        style={{
                                            padding: "10px 12px",
                                            fontWeight: 700,
                                            color: "#6b7280",
                                            textAlign: "left",
                                            whiteSpace: "nowrap",
                                        }}
                                    >
                                        {h}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {tasks.map((task) => {
                                const deletedAt = task.deleted_at
                                    ? new Date(task.deleted_at).toLocaleString("ko-KR", {
                                          month: "2-digit",
                                          day: "2-digit",
                                          hour: "2-digit",
                                          minute: "2-digit",
                                      })
                                    : "—";
                                return (
                                    <tr
                                        key={task.id}
                                        onClick={() => setModalTask(task)}
                                        style={{
                                            borderBottom: "1px solid #f3f4f6",
                                            opacity: isPending ? 0.5 : 1,
                                            transition: "opacity 0.15s",
                                            cursor: "pointer",
                                        }}
                                        onMouseEnter={(e) =>
                                            (e.currentTarget.style.background = "#f9fafb")
                                        }
                                        onMouseLeave={(e) =>
                                            (e.currentTarget.style.background = "")
                                        }
                                    >
                                        <td style={td}>
                                            <span style={{ color: "#9ca3af" }}>
                                                {task.task_number ?? "—"}
                                            </span>
                                        </td>
                                        <td style={td}>
                                            <span style={{ fontWeight: 700, color: "#111827" }}>
                                                {task.customer_name}
                                            </span>
                                            {task.is_priority && (
                                                <span
                                                    style={{
                                                        marginLeft: 6,
                                                        padding: "1px 5px",
                                                        background: "#fef2f2",
                                                        color: "#dc2626",
                                                        border: "1px solid #fecaca",
                                                        borderRadius: 4,
                                                        fontWeight: 700,
                                                    }}
                                                >
                                                    우선
                                                </span>
                                            )}
                                        </td>
                                        <td style={td}>
                                            <span
                                                style={{
                                                    padding: "2px 7px",
                                                    borderRadius: 5,
                                                    background: "#f3f4f6",
                                                    color: "#374151",
                                                    border: "1px solid #e5e7eb",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {task.order_method}
                                            </span>
                                        </td>
                                        <td style={{ ...td, color: "#374151" }}>
                                            {task.print_items}
                                        </td>
                                        <td
                                            style={{
                                                ...td,
                                                color: task.designer?.name ? "#374151" : "#d1d5db",
                                            }}
                                        >
                                            {task.designer?.name ?? "미배정"}
                                        </td>
                                        <td style={{ ...td, color: "#9ca3af", whiteSpace: "nowrap" }}>
                                            {deletedAt}
                                        </td>
                                        <td style={{ ...td, whiteSpace: "nowrap" }}>
                                            <div
                                                style={{ display: "flex", gap: 6 }}
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                <button
                                                    onClick={() => setRestoreTarget(task)}
                                                    disabled={isPending}
                                                    style={{
                                                        padding: "4px 12px",
                                                        fontWeight: 600,
                                                        border: "1px solid #d1fae5",
                                                        borderRadius: 4,
                                                        cursor: isPending ? "not-allowed" : "pointer",
                                                        background: "#f0fdf4",
                                                        color: "#15803d",
                                                        fontFamily: "inherit",
                                                        opacity: isPending ? 0.5 : 1,
                                                    }}
                                                >
                                                    ↩ 복구
                                                </button>
                                                <button
                                                    onClick={() => setDeleteTarget(task)}
                                                    disabled={isPending}
                                                    style={{
                                                        padding: "4px 12px",
                                                        fontWeight: 600,
                                                        border: "1px solid #fecaca",
                                                        borderRadius: 4,
                                                        cursor: isPending ? "not-allowed" : "pointer",
                                                        background: "#fff",
                                                        color: "#ef4444",
                                                        fontFamily: "inherit",
                                                        opacity: isPending ? 0.5 : 1,
                                                    }}
                                                >
                                                    영구삭제
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    <p style={{ marginTop: 16, color: "#9ca3af", textAlign: "right" }}>
                        영구삭제된 작업은 복구할 수 없습니다
                    </p>
                    <PaginationClient page={page} totalPages={totalPages} />
                </>
            )}
        </div>
    );
}

const td: React.CSSProperties = {
    padding: "11px 12px",
    verticalAlign: "middle",
};
const btn = (primary: boolean): React.CSSProperties => ({
    padding: "6px 16px",
    fontWeight: 600,
    border: "1px solid",
    borderColor: primary ? "#111827" : "#e5e7eb",
    borderRadius: 4,
    cursor: "pointer",
    background: primary ? "#111827" : "#fff",
    color: primary ? "#fff" : "#374151",
    fontFamily: "inherit",
});
