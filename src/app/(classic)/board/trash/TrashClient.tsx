// src/app/(classic)/board/trash/TrashClient.tsx
"use client";

import { useState, useTransition } from "react";
import { restoreTask, hardDeleteTask } from "../actions";

export interface TrashTask {
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
}

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
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        justifyContent: "flex-end",
                    }}
                >
                    <button onClick={onCancel} style={btn(false)}>
                        취소
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            ...btn(true),
                            ...(danger
                                ? {
                                      background: "#ef4444",
                                      borderColor: "#ef4444",
                                  }
                                : {}),
                        }}
                    >
                        {confirmLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function TrashClient({
    tasks: initialTasks,
}: {
    tasks: TrashTask[];
}) {
    const [tasks, setTasks] = useState(initialTasks);
    const [isPending, startTransition] = useTransition();

    // 복구 확인
    const [restoreTarget, setRestoreTarget] = useState<TrashTask | null>(null);
    // 영구삭제 확인
    const [deleteTarget, setDeleteTarget] = useState<TrashTask | null>(null);

    const handleRestore = (task: TrashTask) => {
        setRestoreTarget(null);
        startTransition(async () => {
            try {
                await restoreTask(task.id);
                setTasks((prev) => prev.filter((t) => t.id !== task.id));
            } catch (err) {
                alert("복구 실패: " + (err as Error).message);
            }
        });
    };

    const handleHardDelete = (task: TrashTask) => {
        setDeleteTarget(null);
        startTransition(async () => {
            try {
                await hardDeleteTask(task.id);
                setTasks((prev) => prev.filter((t) => t.id !== task.id));
            } catch (err) {
                alert("영구삭제 실패: " + (err as Error).message);
            }
        });
    };

    if (tasks.length === 0)
        return (
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
                <p style={{ margin: 0, fontWeight: 600 }}>
                    휴지통이 비어있습니다
                </p>
                <p style={{ margin: "4px 0 0", color: "#d1d5db" }}>
                    삭제된 작업이 여기에 표시됩니다
                </p>
            </div>
        );

    return (
        <>
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

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                    <tr
                        style={{
                            borderTop: "2px solid #111827",
                            borderBottom: "1px solid #e5e7eb",
                            background: "#f9fafb",
                        }}
                    >
                        {[
                            "번호",
                            "고객이름",
                            "주문방법",
                            "인쇄항목",
                            "담당 디자이너",
                            "삭제일",
                            "",
                        ].map((h) => (
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
                        const deletedAt = new Date(
                            task.deleted_at,
                        ).toLocaleString("ko-KR", {
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                        });
                        return (
                            <tr
                                key={task.id}
                                style={{
                                    borderBottom: "1px solid #f3f4f6",
                                    opacity: isPending ? 0.5 : 1,
                                    transition: "opacity 0.15s",
                                }}
                            >
                                <td style={td}>
                                    <span style={{ color: "#9ca3af" }}>
                                        {task.task_number ?? "—"}
                                    </span>
                                </td>
                                <td style={td}>
                                    <span
                                        style={{
                                            fontWeight: 700,
                                            color: "#111827",
                                        }}
                                    >
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
                                        color: task.designer?.name
                                            ? "#374151"
                                            : "#d1d5db",
                                    }}
                                >
                                    {task.designer?.name ?? "미배정"}
                                </td>
                                <td
                                    style={{
                                        ...td,
                                        color: "#9ca3af",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {deletedAt}
                                </td>
                                <td style={{ ...td, whiteSpace: "nowrap" }}>
                                    <div style={{ display: "flex", gap: 6 }}>
                                        {/* 복구 */}
                                        <button
                                            onClick={() =>
                                                setRestoreTarget(task)
                                            }
                                            disabled={isPending}
                                            style={{
                                                padding: "4px 12px",
                                                fontWeight: 600,
                                                border: "1px solid #d1fae5",
                                                borderRadius: 4,
                                                cursor: isPending
                                                    ? "not-allowed"
                                                    : "pointer",
                                                background: "#f0fdf4",
                                                color: "#15803d",
                                                fontFamily: "inherit",
                                                opacity: isPending ? 0.5 : 1,
                                            }}
                                        >
                                            ↩ 복구
                                        </button>
                                        {/* 영구삭제 */}
                                        <button
                                            onClick={() =>
                                                setDeleteTarget(task)
                                            }
                                            disabled={isPending}
                                            style={{
                                                padding: "4px 12px",
                                                fontWeight: 600,
                                                border: "1px solid #fecaca",
                                                borderRadius: 4,
                                                cursor: isPending
                                                    ? "not-allowed"
                                                    : "pointer",
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
                총 {tasks.length}건 — 영구삭제된 작업은 복구할 수 없습니다
            </p>
        </>
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
