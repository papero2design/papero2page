// src/app/(classic)/board/done/DoneClient.tsx
"use client";

import { useState } from "react";
import { getTaskLogs, type LogEntry } from "../actions";
import { useEffect, useCallback, useTransition } from "react";

type DoneTask = {
    id: string;
    task_number: number | null;
    customer_name: string;
    order_source: string;
    order_method: string;
    print_items: string;
    post_processing: string | null;
    completed_at: string | null;
    created_at: string;
    designer: { id: string; name: string } | null;
};

// ─── 날짜 헬퍼 ───────────────────────────────────────────────
function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(iso: string) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtFull(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─── 로그 타임라인 ────────────────────────────────────────────
const FIELD_LABELS: Record<string, string> = {
    status: "상태",
    assigned_designer: "담당 디자이너",
    is_priority: "우선작업",
    order_source: "주문경로",
    customer_name: "고객이름",
    order_method: "주문방법",
    order_method_note: "주문방법 메모",
    print_items: "인쇄항목",
    post_processing: "후가공",
    consult_path: "상담경로",
    consult_link: "상담링크",
    special_details: "처리특이사항",
    deleted: "삭제",
    restored: "복구",
};

function LogTimeline({ taskId }: { taskId: string }) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [errMsg, setErrMsg] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErrMsg(null);
        try {
            setLogs(await getTaskLogs(taskId));
        } catch (err) {
            setErrMsg((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [taskId]);

    useEffect(() => {
        load();
    }, [load]);

    if (loading)
        return (
            <div
                style={{
                    padding: "20px 18px",
                    color: "#9ca3af",
                    textAlign: "center",
                }}
            >
                로그 불러오는 중...
            </div>
        );
    if (errMsg)
        return (
            <div style={{ padding: "16px 18px", color: "#dc2626" }}>
                ⚠ {errMsg}
            </div>
        );
    if (logs.length === 0)
        return (
            <div
                style={{
                    padding: "20px 18px",
                    color: "#d1d5db",
                    textAlign: "center",
                }}
            >
                변경 기록이 없습니다.
            </div>
        );

    return (
        <div style={{ padding: "8px 18px 16px" }}>
            {logs.map((log, i) => {
                const label =
                    FIELD_LABELS[log.changed_field] ?? log.changed_field;
                const dotColor =
                    log.changed_field === "status"
                        ? "#1ED67D"
                        : log.changed_field === "is_priority"
                          ? "#ef4444"
                          : log.changed_field === "deleted"
                            ? "#6b7280"
                            : log.changed_field === "restored"
                              ? "#3b82f6"
                              : "#d1d5db";

                return (
                    <div
                        key={log.id}
                        style={{
                            display: "flex",
                            gap: 10,
                            paddingBottom: i < logs.length - 1 ? 16 : 0,
                            position: "relative",
                        }}
                    >
                        {/* 타임라인 세로선 */}
                        {i < logs.length - 1 && (
                            <div
                                style={{
                                    position: "absolute",
                                    left: 5,
                                    top: 14,
                                    width: 1,
                                    height: "calc(100% - 4px)",
                                    background: "#e5e7eb",
                                }}
                            />
                        )}
                        {/* 점 */}
                        <div
                            style={{
                                width: 11,
                                height: 11,
                                borderRadius: "50%",
                                background: dotColor,
                                border: "2px solid #fff",
                                boxShadow: "0 0 0 1px #e5e7eb",
                                flexShrink: 0,
                                marginTop: 3,
                            }}
                        />

                        <div style={{ flex: 1, minWidth: 0 }}>
                            {/* 1행: 무엇이 어떻게 변경됐는지 */}
                            <div
                                style={{
                                    display: "flex",
                                    gap: 5,
                                    alignItems: "baseline",
                                    flexWrap: "wrap",
                                    marginBottom: 3,
                                }}
                            >
                                <span
                                    style={{
                                        fontWeight: 700,
                                        color: "#111827",
                                    }}
                                >
                                    {label}
                                </span>
                                {log.old_value && (
                                    <>
                                        <span
                                            style={{
                                                padding: "1px 5px",
                                                borderRadius: 4,
                                                background: "#f3f4f6",
                                                color: "#6b7280",
                                                textDecoration: "line-through",
                                            }}
                                        >
                                            {log.old_value}
                                        </span>
                                        <span style={{ color: "#d1d5db" }}>
                                            →
                                        </span>
                                    </>
                                )}
                                {log.new_value && (
                                    <span
                                        style={{
                                            padding: "1px 6px",
                                            borderRadius: 4,
                                            background:
                                                log.changed_field === "status"
                                                    ? "#f0fdf4"
                                                    : log.changed_field ===
                                                        "is_priority"
                                                      ? "#fef2f2"
                                                      : "#f3f4f6",
                                            color:
                                                log.changed_field === "status"
                                                    ? "#15803d"
                                                    : log.changed_field ===
                                                        "is_priority"
                                                      ? "#dc2626"
                                                      : log.changed_field ===
                                                          "deleted"
                                                        ? "#6b7280"
                                                        : log.changed_field ===
                                                            "restored"
                                                          ? "#2563eb"
                                                          : "#111827",
                                            fontWeight: 600,
                                            border: "1px solid",
                                            borderColor:
                                                log.changed_field === "status"
                                                    ? "#bbf7d0"
                                                    : log.changed_field ===
                                                        "is_priority"
                                                      ? "#fecaca"
                                                      : "#e5e7eb",
                                        }}
                                    >
                                        {log.new_value}
                                    </span>
                                )}
                            </div>

                            {/* 2행: 누가 + 언제 */}
                            <div
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    flexWrap: "wrap",
                                }}
                            >
                                {log.changed_by_name ? (
                                    <span
                                        style={{
                                            display: "inline-flex",
                                            alignItems: "center",
                                            gap: 3,
                                            padding: "1px 7px",
                                            borderRadius: 99,
                                            background: "#f3f4f6",
                                            color: "#374151",
                                            fontWeight: 600,
                                        }}
                                    >
                                        👤 {log.changed_by_name}
                                    </span>
                                ) : (
                                    <span style={{ color: "#d1d5db" }}>—</span>
                                )}
                                <span style={{ color: "#9ca3af" }}>
                                    {fmtDate(log.created_at)}{" "}
                                    {fmtTime(log.created_at)}
                                </span>
                            </div>

                            {/* 3행: 왜 (사유) */}
                            {log.reason && (
                                <div
                                    style={{
                                        marginTop: 5,
                                        padding: "5px 10px",
                                        background: "#fafafa",
                                        borderRadius: 5,
                                        color: "#6b7280",
                                        borderLeft: "3px solid #e5e7eb",
                                    }}
                                >
                                    💬 {log.reason}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

// ─── 완료 작업 상세 모달 (읽기 전용) ─────────────────────────

function DoneDetailModal({
    task,
    onClose,
}: {
    task: DoneTask;
    onClose: () => void;
}) {
    const [tab, setTab] = useState<"view" | "log">("view");

    const fields = [
        { label: "주문경로", value: task.order_source },
        { label: "고객이름", value: task.customer_name },
        { label: "주문방법", value: task.order_method },
        { label: "인쇄항목", value: task.print_items },
        { label: "후가공", value: task.post_processing ?? "없음" },
        { label: "담당 디자이너", value: task.designer?.name ?? "미배정" },
        { label: "접수일시", value: fmtFull(task.created_at) },
        {
            label: "완료일시",
            value: task.completed_at ? fmtFull(task.completed_at) : "—",
        },
    ];

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: 16,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "#fff",
                    borderRadius: 6,
                    width: "100%",
                    maxWidth: 500,
                    maxHeight: "90vh",
                    overflowY: "auto",
                    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
                    fontFamily: "inherit",
                }}
            >
                {/* 헤더 */}
                <div
                    style={{
                        padding: "14px 18px",
                        borderBottom: "1px solid #e5e7eb",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        position: "sticky",
                        top: 0,
                        background: "#fff",
                        zIndex: 2,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        {task.task_number && (
                            <span style={{ color: "#d1d5db" }}>
                                #{task.task_number}
                            </span>
                        )}
                        <span style={{ fontWeight: 900, color: "#111827" }}>
                            {task.customer_name}
                        </span>
                        <span
                            style={{
                                padding: "2px 8px",
                                borderRadius: 5,
                                background: "#f0fdf4",
                                color: "#15803d",
                                border: "1px solid #bbf7d0",
                                fontWeight: 700,
                            }}
                        >
                            완료
                        </span>
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#9ca3af",
                            padding: "2px 4px",
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* 탭 */}
                <div
                    style={{
                        display: "flex",
                        borderBottom: "1px solid #e5e7eb",
                        padding: "0 18px",
                    }}
                >
                    {(["view", "log"] as const).map((t) => (
                        <button
                            key={t}
                            type="button"
                            onClick={() => setTab(t)}
                            style={{
                                padding: "8px 14px",
                                fontWeight: 600,
                                background: "none",
                                border: "none",
                                borderBottom:
                                    tab === t
                                        ? "2px solid #111827"
                                        : "2px solid transparent",
                                color: tab === t ? "#111827" : "#9ca3af",
                                cursor: "pointer",
                                fontFamily: "inherit",
                                marginBottom: -1,
                            }}
                        >
                            {t === "view" ? "내용" : "변경 로그"}
                        </button>
                    ))}
                </div>

                {/* VIEW */}
                {tab === "view" && (
                    <div style={{ padding: "4px 0 8px" }}>
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                            }}
                        >
                            <tbody>
                                {fields.map(({ label, value }) => (
                                    <tr
                                        key={label}
                                        style={{
                                            borderBottom: "1px solid #f3f4f6",
                                        }}
                                    >
                                        <th
                                            style={{
                                                padding: "9px 16px",
                                                fontWeight: 600,
                                                color: "#6b7280",
                                                background: "#f9fafb",
                                                textAlign: "left",
                                                whiteSpace: "nowrap",
                                                width: "30%",
                                                verticalAlign: "top",
                                            }}
                                        >
                                            {label}
                                        </th>
                                        <td
                                            style={{
                                                padding: "9px 16px",
                                                fontWeight: 500,
                                                color: "#111827",
                                                verticalAlign: "top",
                                            }}
                                        >
                                            {value}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* LOG */}
                {tab === "log" && <LogTimeline taskId={task.id} />}

                {/* 푸터 */}
                <div
                    style={{
                        padding: "12px 18px",
                        borderTop: "1px solid #e5e7eb",
                        display: "flex",
                        justifyContent: "flex-end",
                        position: "sticky",
                        bottom: 0,
                        background: "#fff",
                        zIndex: 2,
                    }}
                >
                    <button
                        onClick={onClose}
                        style={{
                            padding: "6px 16px",
                            fontWeight: 600,
                            border: "1px solid #e5e7eb",
                            borderRadius: 4,
                            cursor: "pointer",
                            background: "#fff",
                            color: "#374151",
                            fontFamily: "inherit",
                        }}
                    >
                        닫기
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── 메인 DoneClient ─────────────────────────────────────────

export default function DoneClient({ tasks }: { tasks: DoneTask[] }) {
    const [modalTask, setModalTask] = useState<DoneTask | null>(null);

    if (tasks.length === 0)
        return (
            <tr>
                <td
                    colSpan={6}
                    style={{
                        textAlign: "center",
                        padding: "32px 0",
                        color: "#9ca3af",
                        borderBottom: "1px solid #f3f4f6",
                    }}
                >
                    완료된 작업이 없습니다.
                </td>
            </tr>
        );

    return (
        <>
            {tasks.map((task) => (
                <tr
                    key={task.id}
                    onClick={() => setModalTask(task)}
                    style={{
                        borderBottom: "1px solid #f3f4f6",
                        cursor: "pointer",
                    }}
                    onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                            "#f9fafb";
                    }}
                    onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "";
                    }}
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
                    <td
                        style={{
                            ...td,
                            color: "#9ca3af",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {task.completed_at
                            ? `${fmtDate(task.completed_at)} ${fmtTime(task.completed_at)}`
                            : "—"}
                    </td>
                </tr>
            ))}

            {modalTask && (
                <DoneDetailModal
                    task={modalTask}
                    onClose={() => setModalTask(null)}
                />
            )}
        </>
    );
}

const td: React.CSSProperties = {
    padding: "11px 12px",
    verticalAlign: "middle",
};
