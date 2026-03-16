"use client";

import { useState, useTransition, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { TaskWithDesigner } from "@/types/database";
import {
    updateTask,
    updateTaskStatus,
    getTaskLogs,
    deleteTask,
    deleteTasks,
    togglePriority,
    type LogEntry,
} from "./actions";
import { createClient } from "@/lib/supabase/client";

// ─────────────────────────────────────────────────────────────
// 상수 & 타입
// ─────────────────────────────────────────────────────────────

const QUICK_METHODS = ["인쇄만", "재주문(수정X)"];
const STATUSES = ["대기중", "진행중", "검수대기", "완료"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_STYLE: Record<
    Status,
    { bg: string; color: string; border: string }
> = {
    대기중: { bg: "#f4f4f5", color: "#71717a", border: "#e4e4e7" },
    진행중: { bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
    검수대기: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    완료: { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
};
const METHOD_STYLE = {
    quick: { bg: "#f0fdf4", color: "#15803d", border: "#86efac" },
    normal: { bg: "#fafafa", color: "#52525b", border: "#d4d4d8" },
};

interface Props {
    tasks: TaskWithDesigner[];
    total: number;
    from: number;
    designers?: { id: string; name: string }[];
    writeButton?: React.ReactNode;
    isAdmin?: boolean;
}

const ORDER_SOURCES = ["홈페이지", "스토어팜"];
const ORDER_METHODS = [
    "샘플디자인 의뢰",
    "재주문(글자수정)",
    "인쇄만",
    "재주문(수정X)",
    "디자인 복원",
    "신규 디자인",
    "디자인 수정",
    "기타",
];
const POST_PROCESSINGS = ["없음", "단면박", "양면박", "귀도리", "기타"];
const FILE_PATHS = ["게시판", "메일", "없음"];
const CONSULT_PATHS = ["네이버톡톡", "카카오톡채널", "메일", "없음"];

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

// ─────────────────────────────────────────────────────────────
// 공통 확인 다이얼로그
// ─────────────────────────────────────────────────────────────

function ConfirmDialog({
    message,
    confirmLabel = "확인",
    danger = false,
    onConfirm,
    onCancel,
}: {
    message: string;
    confirmLabel?: string;
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
                    width: 340,
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
                    <button onClick={onCancel} style={footerBtn(false)}>
                        취소
                    </button>
                    <button
                        onClick={onConfirm}
                        style={{
                            ...footerBtn(true),
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

// 사유 입력 모달 (상태변경 / 우선작업 모두 사용)
function ReasonModal({
    title,
    subtitle,
    onConfirm,
    onCancel,
}: {
    title: string;
    subtitle: string;
    onConfirm: (reason: string | null) => void;
    onCancel: () => void;
}) {
    const [reason, setReason] = useState("");
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
                    padding: 20,
                    width: 340,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
                }}
            >
                <p
                    style={{
                        margin: "0 0 4px",
                        fontWeight: 700,
                        color: "#111827",
                    }}
                >
                    {title}
                </p>
                <p style={{ margin: "0 0 12px", color: "#6b7280" }}>
                    {subtitle}
                </p>
                <textarea
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="사유 입력 (선택 — 비워도 됩니다)"
                    rows={3}
                    style={{
                        ...inp(false),
                        resize: "vertical",
                        display: "block",
                        marginBottom: 12,
                    }}
                />
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        justifyContent: "flex-end",
                    }}
                >
                    <button onClick={onCancel} style={footerBtn(false)}>
                        취소
                    </button>
                    <button
                        onClick={() => onConfirm(reason.trim() || null)}
                        style={footerBtn(true)}
                    >
                        확인
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 변경 로그 타임라인
// ─────────────────────────────────────────────────────────────

function LogTimeline({ taskId }: { taskId: string }) {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [errMsg, setErrMsg] = useState<string | null>(null);

    const load = useCallback(async () => {
        setLoading(true);
        setErrMsg(null);
        try {
            const data = await getTaskLogs(taskId);
            setLogs(data);
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
            <div style={{ padding: "16px 18px" }}>
                <div
                    style={{
                        background: "#fef2f2",
                        border: "1px solid #fecaca",
                        borderRadius: 6,
                        padding: "12px 14px",
                    }}
                >
                    <p
                        style={{
                            margin: "0 0 6px",
                            fontWeight: 700,
                            color: "#dc2626",
                        }}
                    >
                        ⚠ 로그 조회 실패
                    </p>
                    <p style={{ margin: 0, color: "#991b1b", fontWeight: 600 }}>
                        <code
                            style={{
                                background: "#fee2e2",
                                padding: "1px 4px",
                                borderRadius: 3,
                            }}
                        >
                            log-improvement-migration.sql
                        </code>{" "}
                        실행 필요
                    </p>
                </div>
                <button
                    onClick={load}
                    style={{ marginTop: 10, ...footerBtn(false) }}
                >
                    다시 시도
                </button>
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
                const date = `${fmtDate(log.created_at)} ${fmtTime(log.created_at)}`;
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
                            paddingBottom: i < logs.length - 1 ? 14 : 0,
                            position: "relative",
                        }}
                    >
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
                            {/* 1행: 무엇이 어떻게 */}
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
                                            fontWeight: 600,
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
                                <span style={{ color: "#9ca3af" }}>{date}</span>
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
// ─────────────────────────────────────────────────────────────
// 상세 모달 (보기 탭 생존 + 수정 탭 개선 완벽 퓨전 버전)
// ─────────────────────────────────────────────────────────────

function TaskDetailModal({
    task,
    onClose,
    onDeleted,
    designers = [],
    isAdmin = false,
}: {
    task: TaskWithDesigner;
    onClose: () => void;
    onDeleted: () => void;
    designers?: { id: string; name: string }[];
    isAdmin?: boolean;
}) {
    const router = useRouter(); // 라우터 불러오기
    const isQuick = QUICK_METHODS.includes(task.order_method ?? "");
    const [currentStatus, setCurrentStatus] = useState<Status>(
        task.status as Status,
    );
    const [currentPriority, setCurrentPriority] = useState(
        task.is_priority ?? false,
    );

    const [tab, setTab] = useState<"view" | "edit" | "log">("view");

    const [errors, setErrors] = useState<Record<string, string>>({});

    const [copiedKey, setCopiedKey] = useState<string | null>(null);

    const [isPending, startTransition] = useTransition();
    const blockCloseRef = useRef(false);

    const [newFiles, setNewFiles] = useState<File[]>([]);

    const [statusModal, setStatusModal] = useState<{
        show: boolean;
        target: Status | null;
    }>({ show: false, target: null });
    const [priorityModal, setPriorityModal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    // 복사 함수
    const copyToClipboard = (label: string, value: string) => {
        if (!value || value === "없음" || value === "미배정") return;
        navigator.clipboard.writeText(value).then(() => {
            setCopiedKey(label);
            setTimeout(() => setCopiedKey(null), 1500);
        });
    };

    const initEdit = () => ({
        order_source: task.order_source ?? "",
        customer_name: task.customer_name ?? "",
        order_method: task.order_method ?? "",
        order_method_note: task.order_method_note ?? "",
        print_items: task.print_items ?? "",
        post_processing: task.post_processing ?? "없음",
        post_processing_note: "",
        file_path: task.file_paths?.[0] ?? "없음",
        consult_path: task.consult_path ?? "없음",
        consult_link: task.consult_link ?? "",
        special_details_yn: task.special_details
            ? "있음"
            : ("없음" as "있음" | "없음"),
        special_details: task.special_details ?? "",
        assigned_designer_id: task.designer?.id ?? "",
        is_priority: task.is_priority ?? false,
        edit_reason: "",
    });
    const [form, setForm] = useState(initEdit);

    const set = (k: keyof typeof form, v: unknown) => {
        setForm((prev) => ({ ...prev, [k]: v }));
        setErrors((prev) => {
            const n = { ...prev };
            delete n[k];
            return n;
        });
    };

    // ── 상태 변경 ──
    const confirmStatusChange = (reason: string | null) => {
        const newStatus = statusModal.target!;
        setStatusModal({ show: false, target: null });
        startTransition(async () => {
            try {
                const completedAt =
                    newStatus === "완료"
                        ? new Date().toISOString()
                        : currentStatus === "완료"
                          ? null
                          : undefined;
                await updateTaskStatus(
                    task.id,
                    currentStatus,
                    newStatus,
                    completedAt,
                    reason,
                );
                setCurrentStatus(newStatus);
                router.refresh(); // 👈 3. 완료 후 부모 리스트 새로고침!
            } catch (err) {
                alert("상태 변경 실패: " + (err as Error).message);
            }
        });
    };

    // ── 우선작업 토글 ──
    const confirmPriorityToggle = (reason: string | null) => {
        const newVal = !currentPriority;
        setPriorityModal(false);
        startTransition(async () => {
            try {
                await togglePriority(task.id, newVal, reason);
                setCurrentPriority(newVal);
                set("is_priority", newVal);
                router.refresh(); // 👈 4. 완료 후 부모 리스트 새로고침!
            } catch (err) {
                alert("우선작업 변경 실패: " + (err as Error).message);
            }
        });
    };

    // ── 내용 수정 & 새 첨부파일 저장 (한 번에 묶어서 처리) ──
    const handleSave = () => {
        const e: Record<string, string> = {};
        if (!form.order_source) e.order_source = "주문경로를 선택해주세요";
        if (!form.customer_name.trim())
            e.customer_name = "고객이름을 입력해주세요";
        if (!form.order_method) e.order_method = "주문방법을 선택해주세요";
        if (!form.print_items.trim()) e.print_items = "인쇄항목을 입력해주세요";
        if (form.special_details_yn === "있음" && !form.special_details.trim())
            e.special_details = "특이사항 내용을 입력해주세요";
        if (Object.keys(e).length) {
            setErrors(e);
            return;
        }

        startTransition(async () => {
            try {
                const supabase = createClient();

                // 1. 파일이 있으면 먼저 스토리지에 업로드
                if (newFiles.length > 0) {
                    for (const file of newFiles) {
                        const ext = file.name.split(".").pop();
                        const randomName = Math.random()
                            .toString(36)
                            .substring(2, 10);
                        const safePath = `tasks/${Date.now()}_${randomName}.${ext}`;

                        const { data: upData, error: uploadErr } =
                            await supabase.storage
                                .from("task-files")
                                .upload(safePath, file);

                        if (!uploadErr && upData) {
                            const { data: urlData } = supabase.storage
                                .from("task-files")
                                .getPublicUrl(safePath);
                            await supabase.from("task_files").insert({
                                task_id: task.id,
                                file_url: urlData.publicUrl,
                                file_name: file.name,
                                file_size: file.size,
                            });
                        } else {
                            throw new Error(`파일 업로드 실패: ${file.name}`);
                        }
                    }
                }

                // 2. 텍스트 내용 업데이트
                const postProc =
                    form.post_processing === "기타"
                        ? `기타: ${form.post_processing_note}`
                        : form.post_processing;
                const newDesignerName =
                    designers.find((d) => d.id === form.assigned_designer_id)
                        ?.name ?? null;
                const oldDesignerName = task.designer?.name ?? null;
                const logEntries = [
                    {
                        field: "order_source",
                        oldValue: task.order_source,
                        newValue: form.order_source,
                    },
                    {
                        field: "customer_name",
                        oldValue: task.customer_name,
                        newValue: form.customer_name.trim(),
                    },
                    {
                        field: "order_method",
                        oldValue: task.order_method,
                        newValue: form.order_method,
                    },
                    {
                        field: "order_method_note",
                        oldValue: task.order_method_note,
                        newValue: form.order_method_note.trim() || null,
                    },
                    {
                        field: "print_items",
                        oldValue: task.print_items,
                        newValue: form.print_items.trim(),
                    },
                    {
                        field: "post_processing",
                        oldValue: task.post_processing ?? null,
                        newValue: postProc,
                    },
                    {
                        field: "consult_path",
                        oldValue: task.consult_path ?? null,
                        newValue: form.consult_path,
                    },
                    {
                        field: "consult_link",
                        oldValue: task.consult_link ?? null,
                        newValue: form.consult_link.trim() || null,
                    },
                    {
                        field: "special_details",
                        oldValue: task.special_details ?? null,
                        newValue:
                            form.special_details_yn === "있음"
                                ? form.special_details.trim()
                                : null,
                    },
                    {
                        field: "assigned_designer",
                        oldValue: oldDesignerName,
                        newValue: newDesignerName,
                    },
                ];

                await updateTask(
                    task.id,
                    {
                        order_source: form.order_source,
                        customer_name: form.customer_name.trim(),
                        order_method: form.order_method,
                        order_method_note:
                            form.order_method_note.trim() || null,
                        print_items: form.print_items.trim(),
                        post_processing: postProc,
                        consult_path: form.consult_path,
                        consult_link: form.consult_link.trim() || null,
                        special_details:
                            form.special_details_yn === "있음"
                                ? form.special_details.trim()
                                : null,
                        assigned_designer_id: form.assigned_designer_id || null,
                        is_priority: form.is_priority,
                        is_quick: QUICK_METHODS.includes(form.order_method),
                    },
                    logEntries,
                    form.edit_reason.trim() || null,
                );

                setNewFiles([]);
                router.refresh(); // 부모 리스트 새로고침
                onClose();
            } catch (err) {
                alert("수정 실패: " + (err as Error).message);
            }
        });
    };

    const handleDelete = () => {
        setDeleteConfirm(false);
        startTransition(async () => {
            try {
                await deleteTask(task.id, "모달에서 삭제");
                router.refresh(); // 부모 리스트 새로고침
                onDeleted();
            } catch (err) {
                alert("삭제 실패: " + (err as Error).message);
            }
        });
    };

    const st = STATUS_STYLE[currentStatus] ?? STATUS_STYLE["대기중"];

    // ✅ 보기 탭에서 보여줄 필드 정리
    const viewFields = [
        { label: "주문경로", value: task.order_source },
        { label: "고객이름", value: task.customer_name },
        { label: "주문방법", value: task.order_method, method: true },
        ...(task.order_method_note
            ? [{ label: "주문방법 메모", value: task.order_method_note }]
            : []),
        { label: "인쇄항목", value: task.print_items },
        { label: "후가공", value: task.post_processing ?? "없음" },
        { label: "파일전달경로", value: task.file_paths?.[0] ?? "없음" },
        { label: "상담경로", value: task.consult_path ?? "없음" },
        ...(task.consult_link
            ? [{ label: "상담링크", value: task.consult_link }]
            : []),
        {
            label: "처리특이사항",
            value: task.special_details ?? "없음",
            alert: !!task.special_details,
        },
        { label: "담당 디자이너", value: task.designer?.name ?? "미배정" },
        { label: "접수일시", value: fmtDateTime(task.created_at) },
    ] as { label: string; value: string; alert?: boolean; method?: boolean }[];

    return (
        <>
            {deleteConfirm && (
                <ConfirmDialog
                    message={`"${task.customer_name}" 작업을 휴지통으로 보낼까요?\n관리자 페이지에서 복구할 수 있습니다.`}
                    confirmLabel="휴지통으로"
                    danger
                    onConfirm={handleDelete}
                    onCancel={() => setDeleteConfirm(false)}
                />
            )}
            {statusModal.show && statusModal.target && (
                <ReasonModal
                    title="상태 변경 사유"
                    subtitle={`${currentStatus} → ${statusModal.target}`}
                    onConfirm={confirmStatusChange}
                    onCancel={() =>
                        setStatusModal({ show: false, target: null })
                    }
                />
            )}
            {priorityModal && (
                <ReasonModal
                    title={currentPriority ? "우선작업 해제" : "우선작업 등록"}
                    subtitle={
                        currentPriority
                            ? "우선작업을 해제합니다."
                            : "🚨 우선작업으로 등록합니다."
                    }
                    onConfirm={confirmPriorityToggle}
                    onCancel={() => setPriorityModal(false)}
                />
            )}

            <div
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
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget && !blockCloseRef.current)
                        onClose();
                }}
            >
                <div
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                        background: "#fff",
                        borderRadius: 6,
                        width: "100%",
                        maxWidth: 520,
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
                                flexWrap: "wrap",
                            }}
                        >
                            {task.task_number && (
                                <span
                                    style={{
                                        color: "#d1d5db",
                                        fontWeight: 500,
                                    }}
                                >
                                    #{task.task_number}
                                </span>
                            )}
                            <span
                                style={{
                                    fontWeight: 900,
                                    color: currentPriority
                                        ? "#dc2626"
                                        : "#111827",
                                }}
                            >
                                {task.customer_name}
                            </span>
                            {currentPriority && (
                                <span style={pridBadge("priority")}>우선</span>
                            )}
                            {!currentPriority && isQuick && (
                                <span style={pridBadge("quick")}>간단작업</span>
                            )}
                            <span style={baseBadge(st.bg, st.color, st.border)}>
                                {currentStatus}
                            </span>
                            {tab === "edit" && (
                                <span
                                    style={baseBadge(
                                        "#eef2ff",
                                        "#6366f1",
                                        "#c7d2fe",
                                    )}
                                >
                                    수정 중
                                </span>
                            )}
                            {isPending && (
                                <span style={{ color: "#9ca3af" }}>
                                    처리 중...
                                </span>
                            )}
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

                    {/* 탭 네비게이션 */}
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
                                onClick={() => {
                                    if (tab !== "edit") setTab(t);
                                }}
                                style={{
                                    padding: "8px 14px",
                                    fontWeight: 600,
                                    background: "none",
                                    border: "none",
                                    borderBottom:
                                        tab === t ||
                                        (tab === "edit" && t === "view")
                                            ? "2px solid #111827"
                                            : "2px solid transparent",
                                    color:
                                        tab === t ||
                                        (tab === "edit" && t === "view")
                                            ? "#111827"
                                            : "#9ca3af",
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    marginBottom: -1,
                                }}
                            >
                                {t === "view" ? "내용" : "변경 로그"}
                            </button>
                        ))}
                    </div>

                    {/* 상태 변경 바 */}
                    {tab !== "log" && (
                        <div
                            style={{
                                padding: "10px 18px",
                                borderBottom: "1px solid #f3f4f6",
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                flexWrap: "wrap",
                            }}
                        >
                            <span
                                style={{
                                    color: "#9ca3af",
                                    marginRight: 4,
                                    whiteSpace: "nowrap",
                                }}
                            >
                                상태
                            </span>
                            {STATUSES.map((s) => {
                                const sst = STATUS_STYLE[s];
                                const isActive = s === currentStatus;
                                return (
                                    <button
                                        key={s}
                                        type="button"
                                        disabled={isPending}
                                        onClick={() =>
                                            setStatusModal({
                                                show: true,
                                                target: s,
                                            })
                                        }
                                        style={{
                                            padding: "3px 10px",
                                            borderRadius: 5,
                                            border: `1px solid ${isActive ? sst.border : "#e4e4e7"}`,
                                            background: isActive
                                                ? sst.bg
                                                : "#fafafa",
                                            color: isActive
                                                ? sst.color
                                                : "#a1a1aa",
                                            fontWeight: isActive ? 700 : 400,
                                            cursor: isPending
                                                ? "not-allowed"
                                                : "pointer",
                                            opacity: isPending ? 0.6 : 1,
                                            transition: "all 0.1s",
                                            fontFamily: "inherit",
                                        }}
                                    >
                                        {s}
                                    </button>
                                );
                            })}
                            {isAdmin && (
                                <button
                                    type="button"
                                    disabled={isPending}
                                    onClick={() => setPriorityModal(true)}
                                    style={{
                                        marginLeft: "auto",
                                        padding: "3px 10px",
                                        borderRadius: 5,
                                        border: `1px solid ${currentPriority ? "#fecaca" : "#e4e4e7"}`,
                                        background: currentPriority
                                            ? "#fef2f2"
                                            : "#fafafa",
                                        color: currentPriority
                                            ? "#dc2626"
                                            : "#a1a1aa",
                                        fontWeight: currentPriority ? 700 : 400,
                                        cursor: isPending
                                            ? "not-allowed"
                                            : "pointer",
                                        opacity: isPending ? 0.6 : 1,
                                        transition: "all 0.1s",
                                        fontFamily: "inherit",
                                    }}
                                >
                                    {currentPriority
                                        ? "🚨 우선 해제"
                                        : "우선 등록"}
                                </button>
                            )}
                        </div>
                    )}

                    {/* ✅ 부활한 VIEW 탭 (읽기 & 복사 모드) */}
                    {tab === "view" && (
                        <div style={{ padding: "4px 0 8px" }}>
                            <table
                                style={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                }}
                            >
                                <tbody>
                                    {viewFields.map(
                                        ({ label, value, alert, method }) => {
                                            const isCopied =
                                                copiedKey === label;
                                            const canCopy =
                                                !!value &&
                                                value !== "없음" &&
                                                value !== "미배정";
                                            return (
                                                <tr
                                                    key={label}
                                                    onClick={() =>
                                                        canCopy &&
                                                        copyToClipboard(
                                                            label,
                                                            value,
                                                        )
                                                    }
                                                    title={
                                                        canCopy
                                                            ? "클릭하여 복사"
                                                            : undefined
                                                    }
                                                    style={{
                                                        borderBottom:
                                                            "1px solid #f3f4f6",
                                                        cursor: canCopy
                                                            ? "pointer"
                                                            : "default",
                                                        background: isCopied
                                                            ? "#f0fdf4"
                                                            : "transparent",
                                                        transition:
                                                            "background 0.15s",
                                                    }}
                                                >
                                                    <th
                                                        style={{
                                                            padding: "9px 16px",
                                                            fontWeight: 600,
                                                            color: isCopied
                                                                ? "#15803d"
                                                                : "#6b7280",
                                                            background: isCopied
                                                                ? "#dcfce7"
                                                                : "#f9fafb",
                                                            textAlign: "left",
                                                            whiteSpace:
                                                                "nowrap",
                                                            width: "30%",
                                                            verticalAlign:
                                                                "top",
                                                            transition:
                                                                "all 0.15s",
                                                        }}
                                                    >
                                                        {label}
                                                        {canCopy && (
                                                            <span
                                                                style={{
                                                                    marginLeft: 5,
                                                                    color: isCopied
                                                                        ? "#15803d"
                                                                        : "#d1d5db",
                                                                }}
                                                            >
                                                                {isCopied
                                                                    ? "✓"
                                                                    : "⎘"}
                                                            </span>
                                                        )}
                                                    </th>
                                                    <td
                                                        style={{
                                                            padding: "9px 16px",
                                                            fontWeight: alert
                                                                ? 700
                                                                : 500,
                                                            color: isCopied
                                                                ? "#15803d"
                                                                : alert
                                                                  ? "#ef4444"
                                                                  : "#111827",
                                                            verticalAlign:
                                                                "top",
                                                            transition:
                                                                "color 0.15s",
                                                        }}
                                                    >
                                                        {isCopied ? (
                                                            <span
                                                                style={{
                                                                    fontWeight: 700,
                                                                }}
                                                            >
                                                                복사됨 ✓
                                                            </span>
                                                        ) : method ? (
                                                            <span
                                                                style={methodBadge(
                                                                    isQuick,
                                                                )}
                                                            >
                                                                {value}
                                                            </span>
                                                        ) : (
                                                            value
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        },
                                    )}
                                </tbody>
                            </table>
                            {/* 첨부파일 읽기 모드 컴포넌트 */}
                            <TaskFiles taskId={task.id} />
                        </div>
                    )}

                    {/* LOG 탭 */}
                    {tab === "log" && <LogTimeline taskId={task.id} />}

                    {/* EDIT 탭 (텍스트 수정 및 파일 추가 묶음 처리) */}
                    {tab === "edit" && (
                        <div
                            style={{ padding: "4px 0 8px" }}
                            onKeyDown={(e) => {
                                if (
                                    e.key === "Enter" &&
                                    !e.shiftKey &&
                                    !(e.target as HTMLElement).matches(
                                        "textarea",
                                    )
                                ) {
                                    e.preventDefault();
                                    handleSave();
                                }
                            }}
                        >
                            <table
                                style={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                }}
                            >
                                <tbody>
                                    <ERow
                                        label="주문경로"
                                        required
                                        error={errors.order_source}
                                    >
                                        <BtnGroup
                                            options={ORDER_SOURCES}
                                            value={form.order_source}
                                            onChange={(v) =>
                                                set("order_source", v)
                                            }
                                        />
                                    </ERow>
                                    <ERow
                                        label="고객이름"
                                        required
                                        error={errors.customer_name}
                                    >
                                        <input
                                            value={form.customer_name}
                                            onChange={(e) =>
                                                set(
                                                    "customer_name",
                                                    e.target.value,
                                                )
                                            }
                                            style={inp(!!errors.customer_name)}
                                        />
                                    </ERow>
                                    <ERow
                                        label="주문방법"
                                        required
                                        error={errors.order_method}
                                    >
                                        <BtnGroup
                                            options={ORDER_METHODS}
                                            value={form.order_method}
                                            onChange={(v) =>
                                                set("order_method", v)
                                            }
                                        />
                                        <input
                                            value={form.order_method_note}
                                            onChange={(e) =>
                                                set(
                                                    "order_method_note",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="주문방법 메모 (선택)"
                                            style={{
                                                ...inp(false),
                                                marginTop: 6,
                                            }}
                                        />
                                    </ERow>
                                    <ERow
                                        label="인쇄항목"
                                        required
                                        error={errors.print_items}
                                    >
                                        <input
                                            value={form.print_items}
                                            onChange={(e) =>
                                                set(
                                                    "print_items",
                                                    e.target.value,
                                                )
                                            }
                                            style={inp(!!errors.print_items)}
                                        />
                                    </ERow>
                                    <ERow label="후가공">
                                        <BtnGroup
                                            options={POST_PROCESSINGS}
                                            value={form.post_processing}
                                            onChange={(v) =>
                                                set("post_processing", v)
                                            }
                                        />
                                        {form.post_processing === "기타" && (
                                            <input
                                                value={
                                                    form.post_processing_note
                                                }
                                                onChange={(e) =>
                                                    set(
                                                        "post_processing_note",
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="후가공 내용"
                                                style={{
                                                    ...inp(false),
                                                    marginTop: 6,
                                                }}
                                            />
                                        )}
                                    </ERow>
                                    <ERow label="파일전달경로">
                                        <BtnGroup
                                            options={FILE_PATHS}
                                            value={form.file_path}
                                            onChange={(v) =>
                                                set("file_path", v)
                                            }
                                        />
                                    </ERow>
                                    <ERow label="상담경로">
                                        <BtnGroup
                                            options={CONSULT_PATHS}
                                            value={form.consult_path}
                                            onChange={(v) =>
                                                set("consult_path", v)
                                            }
                                        />
                                        <input
                                            value={form.consult_link}
                                            onChange={(e) =>
                                                set(
                                                    "consult_link",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="상담 링크 (선택)"
                                            style={{
                                                ...inp(false),
                                                marginTop: 6,
                                            }}
                                        />
                                    </ERow>
                                    <ERow
                                        label="처리특이사항"
                                        error={errors.special_details}
                                    >
                                        <BtnGroup
                                            options={["없음", "있음"]}
                                            value={form.special_details_yn}
                                            onChange={(v) =>
                                                set("special_details_yn", v)
                                            }
                                        />
                                        {form.special_details_yn === "있음" && (
                                            <textarea
                                                value={form.special_details}
                                                onChange={(e) =>
                                                    set(
                                                        "special_details",
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="특이사항 내용을 입력하세요"
                                                rows={3}
                                                style={{
                                                    ...inp(
                                                        !!errors.special_details,
                                                    ),
                                                    resize: "vertical",
                                                    display: "block",
                                                    marginTop: 6,
                                                }}
                                            />
                                        )}
                                    </ERow>
                                    <ERow label="첨부파일">
                                        <TaskFilesEdit
                                            taskId={task.id}
                                            newFiles={newFiles}
                                            setNewFiles={setNewFiles}
                                            blockCloseRef={blockCloseRef}
                                        />
                                    </ERow>
                                    <ERow label="담당 디자이너">
                                        {isAdmin ? (
                                            designers.length > 0 ? (
                                                <BtnGroup
                                                    options={designers.map(
                                                        (d) => d.name,
                                                    )}
                                                    value={
                                                        designers.find(
                                                            (d) =>
                                                                d.id ===
                                                                form.assigned_designer_id,
                                                        )?.name ?? ""
                                                    }
                                                    onChange={(name) => {
                                                        const id =
                                                            designers.find(
                                                                (d) =>
                                                                    d.name ===
                                                                    name,
                                                            )?.id;
                                                        set(
                                                            "assigned_designer_id",
                                                            form.assigned_designer_id ===
                                                                id
                                                                ? ""
                                                                : id,
                                                        );
                                                    }}
                                                />
                                            ) : (
                                                <span
                                                    style={{ color: "#9ca3af" }}
                                                >
                                                    등록된 디자이너 없음
                                                </span>
                                            )
                                        ) : (
                                            <span
                                                style={{
                                                    color: task.designer?.name
                                                        ? "#374151"
                                                        : "#d1d5db",
                                                }}
                                            >
                                                {task.designer?.name ??
                                                    "미배정"}{" "}
                                                <span
                                                    style={{ color: "#d1d5db" }}
                                                >
                                                    (관리자만 변경 가능)
                                                </span>
                                            </span>
                                        )}
                                    </ERow>
                                    <ERow label="수정 사유">
                                        <input
                                            value={form.edit_reason}
                                            onChange={(e) =>
                                                set(
                                                    "edit_reason",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="사유 입력 (선택사항)"
                                            style={inp(false)}
                                        />
                                    </ERow>
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* 푸터 */}
                    <div
                        style={{
                            padding: "12px 18px",
                            borderTop: "1px solid #e5e7eb",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            position: "sticky",
                            bottom: 0,
                            background: "#fff",
                            zIndex: 2,
                        }}
                    >
                        <div>
                            {(tab === "view" || tab === "log") && (
                                <button
                                    onClick={() => setDeleteConfirm(true)}
                                    disabled={isPending}
                                    style={{
                                        padding: "6px 14px",
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
                                    🗑 휴지통으로
                                </button>
                            )}
                        </div>
                        <div style={{ display: "flex", gap: 8 }}>
                            {tab === "view" || tab === "log" ? (
                                <>
                                    <button
                                        onClick={onClose}
                                        style={footerBtn(false)}
                                    >
                                        닫기
                                    </button>
                                    <button
                                        onClick={() => {
                                            setForm(initEdit());
                                            setTab("edit");
                                        }}
                                        style={footerBtn(true)}
                                    >
                                        수정하기 ✎
                                    </button>
                                </>
                            ) : (
                                <>
                                    <button
                                        onClick={() => {
                                            setTab("view");
                                            setErrors({});
                                        }}
                                        style={footerBtn(false)}
                                    >
                                        취소
                                    </button>
                                    <button
                                        onClick={handleSave}
                                        disabled={isPending}
                                        style={{
                                            ...footerBtn(true),
                                            opacity: isPending ? 0.7 : 1,
                                        }}
                                    >
                                        {isPending
                                            ? "저장 중..."
                                            : "저장하기 ✓"}
                                    </button>
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// 메인 BoardTable
// ─────────────────────────────────────────────────────────────

export default function BoardTable({
    tasks,
    total,
    from,
    designers = [],
    writeButton,
    isAdmin = false,
}: Props) {
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [modalTask, setModalTask] = useState<TaskWithDesigner | null>(null);
    const [isPending, startTransition] = useTransition();
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);

    const toggleRow = (id: string) =>
        setChecked((prev) => {
            const n = new Set(prev);
            n.has(id) ? n.delete(id) : n.add(id);
            return n;
        });
    const toggleAll = () =>
        setChecked((prev) =>
            prev.size === tasks.length
                ? new Set()
                : new Set(tasks.map((t) => t.id)),
        );

    const handleBulkDelete = () => {
        setBulkDeleteConfirm(false);
        startTransition(async () => {
            try {
                await deleteTasks(Array.from(checked), "선택삭제");
                setChecked(new Set());
            } catch (err) {
                alert("선택삭제 실패: " + (err as Error).message);
            }
        });
    };

    const hasChecked = checked.size > 0;

    return (
        <>
            {bulkDeleteConfirm && (
                <ConfirmDialog
                    message={`선택한 ${checked.size}건을 휴지통으로 보낼까요?\n관리자 페이지에서 복구할 수 있습니다.`}
                    confirmLabel={`${checked.size}건 휴지통으로`}
                    danger
                    onConfirm={handleBulkDelete}
                    onCancel={() => setBulkDeleteConfirm(false)}
                />
            )}

            {/* 액션바 */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 12,
                }}
            >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button
                        className="bo-btn"
                        disabled={!hasChecked || isPending}
                        onClick={() => hasChecked && setBulkDeleteConfirm(true)}
                        style={{
                            opacity: hasChecked ? 1 : 0.35,
                            cursor: hasChecked ? "pointer" : "default",
                        }}
                    >
                        🗑 선택삭제
                    </button>
                    {hasChecked && (
                        <span
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                background: "#f0fdf4",
                                border: "1px solid #86efac",
                                borderRadius: 6,
                                padding: "3px 10px",
                                color: "#15803d",
                                fontWeight: 700,
                            }}
                        >
                            <span
                                style={{
                                    background: "#1ED67D",
                                    color: "#fff",
                                    borderRadius: 4,
                                    padding: "0 6px",
                                    fontWeight: 900,
                                }}
                            >
                                {checked.size}
                            </span>
                            건 선택됨
                        </span>
                    )}
                </div>
                <div>{writeButton}</div>
            </div>

            {/* 테이블 */}
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <caption className="sr-only">작업등록 목록</caption>
                <thead>
                    <tr style={styles.headRow}>
                        <th
                            scope="col"
                            style={{
                                ...styles.th,
                                width: 60,
                                textAlign: "center",
                            }}
                        >
                            번호
                        </th>
                        <th
                            scope="col"
                            style={{
                                ...styles.th,
                                width: 50,
                                textAlign: "center",
                            }}
                        >
                            <input
                                type="checkbox"
                                title="전체선택"
                                checked={
                                    checked.size === tasks.length &&
                                    tasks.length > 0
                                }
                                onChange={toggleAll}
                                style={{ cursor: "pointer" }}
                            />
                        </th>
                        <th
                            scope="col"
                            style={{
                                ...styles.th,
                                textAlign: "left",
                                paddingLeft: 12,
                            }}
                        >
                            내용
                        </th>
                        <th
                            scope="col"
                            style={{
                                ...styles.th,
                                width: 100,
                                textAlign: "center",
                            }}
                        >
                            날짜
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {tasks.length === 0 && (
                        <tr>
                            <td
                                colSpan={4}
                                style={{
                                    textAlign: "center",
                                    padding: "32px 0",
                                    color: "#9ca3af",
                                    borderBottom: "1px solid #f3f4f6",
                                }}
                            >
                                등록된 작업이 없습니다.
                            </td>
                        </tr>
                    )}
                    {tasks.map((task) => {
                        const isQuick = QUICK_METHODS.includes(
                            task.order_method ?? "",
                        );
                        const hasAlert = !!task.special_details;
                        const isChecked = checked.has(task.id);
                        const sst =
                            STATUS_STYLE[task.status as Status] ??
                            STATUS_STYLE["대기중"];

                        return (
                            <tr
                                key={task.id}
                                style={{
                                    ...styles.row,
                                    borderLeft: task.is_priority
                                        ? "3px solid #ef4444"
                                        : "3px solid transparent",
                                    background: isChecked ? "#f0fdf4" : "#fff",
                                }}
                                onMouseEnter={(e) => {
                                    (
                                        e.currentTarget as HTMLElement
                                    ).style.background = isChecked
                                        ? "#dcfce7"
                                        : "#f9fafb";
                                }}
                                onMouseLeave={(e) => {
                                    (
                                        e.currentTarget as HTMLElement
                                    ).style.background = isChecked
                                        ? "#f0fdf4"
                                        : "#fff";
                                }}
                            >
                                <td
                                    onClick={() => toggleRow(task.id)}
                                    style={{
                                        ...styles.td,
                                        width: 60,
                                        textAlign: "center",
                                        cursor: "pointer",
                                    }}
                                >
                                    {task.is_priority && (
                                        <span
                                            style={{
                                                color: "#ef4444",
                                                fontWeight: 800,
                                                display: "block",
                                            }}
                                        >
                                            우선
                                        </span>
                                    )}
                                    <span
                                        style={{
                                            color: isChecked
                                                ? "#15803d"
                                                : "#9ca3af",
                                            fontWeight: isChecked ? 700 : 400,
                                        }}
                                    >
                                        {task.task_number ?? "—"}
                                    </span>
                                </td>
                                <td
                                    onClick={() => toggleRow(task.id)}
                                    style={{
                                        ...styles.td,
                                        width: 50,
                                        textAlign: "center",
                                        cursor: "pointer",
                                    }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={isChecked}
                                        onChange={() => toggleRow(task.id)}
                                        onClick={(e) => e.stopPropagation()}
                                        style={{
                                            cursor: "pointer",
                                            width: 14,
                                            height: 14,
                                        }}
                                    />
                                </td>
                                <td
                                    onClick={() => setModalTask(task)}
                                    style={{
                                        ...styles.td,
                                        paddingLeft: 12,
                                        paddingRight: 12,
                                        cursor: "pointer",
                                    }}
                                >
                                    <dl
                                        style={{
                                            margin: 0,
                                            padding: 0,
                                            display: "grid",
                                            gridTemplateColumns: "auto 1fr",
                                            columnGap: 6,
                                            rowGap: 1,
                                        }}
                                    >
                                        <dt style={styles.dt}>주문경로 :</dt>
                                        <dd style={styles.dd}>
                                            {task.order_source}
                                        </dd>
                                        <dt style={styles.dt}>고객이름 :</dt>
                                        <dd
                                            style={{
                                                ...styles.dd,
                                                fontWeight: 800,
                                                color: task.is_priority
                                                    ? "#dc2626"
                                                    : "#111827",
                                            }}
                                        >
                                            {task.customer_name}
                                        </dd>
                                        <dt style={styles.dt}>주문방법 :</dt>
                                        <dd style={styles.dd}>
                                            <span style={methodBadge(isQuick)}>
                                                {task.order_method}
                                            </span>
                                        </dd>
                                        <dt style={styles.dt}>인쇄항목 :</dt>
                                        <dd style={styles.dd}>
                                            {task.print_items}
                                        </dd>
                                        <dt style={styles.dt}>후가공 :</dt>
                                        <dd
                                            style={{
                                                ...styles.dd,
                                                color:
                                                    task.post_processing &&
                                                    task.post_processing !==
                                                        "없음"
                                                        ? "#111827"
                                                        : "#9ca3af",
                                            }}
                                        >
                                            {task.post_processing ?? "없음"}
                                        </dd>
                                        <dt style={styles.dt}>
                                            파일전달경로 :
                                        </dt>
                                        <dd
                                            style={{
                                                ...styles.dd,
                                                color: task.file_paths?.length
                                                    ? "#059669"
                                                    : "#9ca3af",
                                            }}
                                        >
                                            {task.file_paths?.length
                                                ? `${task.file_paths.length}개`
                                                : "없음"}
                                        </dd>
                                        <dt style={styles.dt}>상담경로 :</dt>
                                        <dd style={styles.dd}>
                                            {task.consult_path ?? "없음"}
                                        </dd>
                                        <dt style={styles.dt}>
                                            처리특이사항 :
                                        </dt>
                                        <dd
                                            style={{
                                                ...styles.dd,
                                                color: hasAlert
                                                    ? "#ef4444"
                                                    : "#9ca3af",
                                                fontWeight: hasAlert
                                                    ? 700
                                                    : 400,
                                            }}
                                        >
                                            {hasAlert ? "있음" : "없음"}
                                        </dd>
                                        <dt style={styles.dt}>
                                            담당 디자이너 :
                                        </dt>
                                        <dd
                                            style={{
                                                ...styles.dd,
                                                color: task.designer?.name
                                                    ? "#374151"
                                                    : "#d1d5db",
                                            }}
                                        >
                                            {task.designer?.name ?? "미배정"}
                                        </dd>
                                        <dt style={styles.dt}>상태 :</dt>
                                        <dd style={styles.dd}>
                                            <span style={statusBadge(sst)}>
                                                {task.status}
                                            </span>
                                        </dd>
                                    </dl>
                                </td>
                                <td
                                    onClick={() => setModalTask(task)}
                                    style={{
                                        ...styles.td,
                                        width: 100,
                                        textAlign: "center",
                                        color: "#9ca3af",
                                        whiteSpace: "nowrap",
                                        cursor: "pointer",
                                    }}
                                >
                                    {fmtDate(task.created_at)}
                                    <br />
                                    <span style={{ color: "#c4c4c4" }}>
                                        {fmtTime(task.created_at)}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>

            {modalTask && (
                <TaskDetailModal
                    task={modalTask}
                    onClose={() => setModalTask(null)}
                    onDeleted={() => setModalTask(null)}
                    designers={designers}
                    isAdmin={isAdmin}
                />
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// 스타일 헬퍼
// ─────────────────────────────────────────────────────────────

function baseBadge(
    bg: string,
    color: string,
    border: string,
): React.CSSProperties {
    return {
        display: "inline-block",
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 5,
        background: bg,
        color,
        border: `1px solid ${border}`,
    };
}
function pridBadge(type: "priority" | "quick"): React.CSSProperties {
    return type === "priority"
        ? baseBadge("#fef2f2", "#dc2626", "#fecaca")
        : baseBadge("#f0fdf4", "#15803d", "#86efac");
}
function methodBadge(quick: boolean): React.CSSProperties {
    const s = quick ? METHOD_STYLE.quick : METHOD_STYLE.normal;
    return baseBadge(s.bg, s.color, s.border);
}
function statusBadge(st: {
    bg: string;
    color: string;
    border: string;
}): React.CSSProperties {
    return baseBadge(st.bg, st.color, st.border);
}
function footerBtn(primary: boolean): React.CSSProperties {
    return {
        padding: "6px 16px",
        fontWeight: 600,
        border: "1px solid",
        borderColor: primary ? "#111827" : "#e5e7eb",
        borderRadius: 4,
        cursor: "pointer",
        background: primary ? "#111827" : "#fff",
        color: primary ? "#fff" : "#374151",
        fontFamily: "inherit",
    };
}
function inp(hasError: boolean): React.CSSProperties {
    return {
        width: "100%",
        padding: "6px 10px",
        border: `1px solid ${hasError ? "#ef4444" : "#d1d5db"}`,
        borderRadius: 4,
        outline: "none",
        background: hasError ? "#fff5f5" : "#fff",
        fontFamily: "inherit",
        boxSizing: "border-box",
    };
}
function toggleBtn(active: boolean): React.CSSProperties {
    return {
        padding: "3px 10px",
        border: `1px solid ${active ? "#111827" : "#d1d5db"}`,
        borderRadius: 4,
        background: active ? "#111827" : "#fff",
        color: active ? "#fff" : "#374151",
        cursor: "pointer",
        fontFamily: "inherit",
        fontWeight: active ? 600 : 400,
        transition: "all 0.1s",
    };
}
function ERow({
    label,
    required,
    error,
    children,
}: {
    label: string;
    required?: boolean;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
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
                {required && (
                    <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>
                )}
            </th>
            <td style={{ padding: "9px 16px", verticalAlign: "top" }}>
                {children}
                {error && (
                    <p
                        style={{
                            margin: "4px 0 0",
                            color: "#ef4444",
                            fontWeight: 500,
                        }}
                    >
                        ⚠ {error}
                    </p>
                )}
            </td>
        </tr>
    );
}
function BtnGroup({
    options,
    value,
    onChange,
}: {
    options: string[];
    value: string;
    onChange: (v: string) => void;
}) {
    return (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {options.map((o) => (
                <button
                    key={o}
                    type="button"
                    onClick={() => onChange(o)}
                    style={toggleBtn(value === o)}
                >
                    {o}
                </button>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 첨부파일 공통 훅
// ─────────────────────────────────────────────────────────────

type TaskFile = {
    id: string;
    file_name: string;
    file_url: string;
    file_size: number | null;
};

function useTaskFiles(taskId: string) {
    // null = 로딩 중, [] = 로드 완료(파일 없음)
    const [files, setFiles] = useState<TaskFile[] | null>(null);
    const [tick, setTick] = useState(0);

    const reload = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        let cancelled = false;
        createClient()
            .from("task_files")
            .select("id, file_name, file_url, file_size")
            .eq("task_id", taskId)
            .order("uploaded_at", { ascending: true })
            .then(({ data }) => {
                if (!cancelled) setFiles(data ?? []);
            });
        return () => {
            cancelled = true;
        };
    }, [taskId, tick]);

    return { files, loading: files === null, reload };
}

function FileItem({ f, onDelete }: { f: TaskFile; onDelete?: () => void }) {
    const sizeText = f.file_size
        ? f.file_size >= 1024 * 1024
            ? `${(f.file_size / 1024 / 1024).toFixed(1)}MB`
            : `${Math.round(f.file_size / 1024)}KB`
        : "";

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "6px 10px",
                borderRadius: 6,
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
            }}
        >
            <span style={{ fontSize: 15 }}>📄</span>
            <a
                href={f.file_url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    fontWeight: 500,
                    color: "#374151",
                    textDecoration: "none",
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = "#1ED67D")}
                onMouseLeave={(e) => (e.currentTarget.style.color = "#374151")}
            >
                {f.file_name}
            </a>
            {sizeText && (
                <span style={{ color: "#9ca3af", fontSize: 12, flexShrink: 0 }}>
                    {sizeText}
                </span>
            )}
            <a
                href={f.file_url}
                download={f.file_name}
                style={{
                    color: "#1ED67D",
                    fontSize: 12,
                    fontWeight: 600,
                    flexShrink: 0,
                    textDecoration: "none",
                }}
            >
                ↓
            </a>
            {onDelete && (
                <button
                    onClick={onDelete}
                    style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#d1d5db",
                        padding: "0 2px",
                        lineHeight: 1,
                        flexShrink: 0,
                    }}
                    title="삭제"
                >
                    ✕
                </button>
            )}
        </div>
    );
}

// VIEW 탭 — 읽기 전용
function TaskFiles({ taskId }: { taskId: string }) {
    const { files, loading } = useTaskFiles(taskId);

    if (loading)
        return (
            <div
                style={{
                    padding: "8px 16px",
                    borderTop: "1px solid #f3f4f6",
                    color: "#d1d5db",
                    fontSize: 13,
                }}
            >
                파일 불러오는 중...
            </div>
        );

    const fileList = files ?? [];
    return (
        <div
            style={{ padding: "8px 16px 12px", borderTop: "1px solid #f3f4f6" }}
        >
            <p
                style={{
                    margin: "0 0 8px",
                    fontWeight: 600,
                    color: "#6b7280",
                    fontSize: 13,
                }}
            >
                📎 첨부파일{" "}
                {fileList.length > 0 ? `${fileList.length}개` : "없음"}
            </p>
            {fileList.length > 0 && (
                <div
                    style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                    {fileList.map((f) => (
                        <FileItem key={f.id} f={f} />
                    ))}
                </div>
            )}
        </div>
    );
}
// EDIT 탭 — 기존 파일 삭제 + 새 파일 추가
function TaskFilesEdit({
    taskId,
    newFiles,
    setNewFiles,
    blockCloseRef,
}: {
    taskId: string;
    newFiles: File[];
    setNewFiles: React.Dispatch<React.SetStateAction<File[]>>;
    blockCloseRef: React.MutableRefObject<boolean>;
}) {
    const { files, reload } = useTaskFiles(taskId);
    const fileRef = useRef<HTMLInputElement>(null);

    const handleDelete = async (fileId: string, fileUrl: string) => {
        const supabase = createClient();
        const path = fileUrl.split("/task-files/")[1]?.split("?")[0];
        if (path) await supabase.storage.from("task-files").remove([path]);
        await supabase.from("task_files").delete().eq("id", fileId);
        reload();
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* 기존 파일 */}
            {(files ?? []).map((f) => (
                <FileItem
                    key={f.id}
                    f={f}
                    onDelete={() => handleDelete(f.id, f.file_url)}
                />
            ))}

            {/* 새 파일 추가 버튼 */}
            <div>
                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        fileRef.current?.click();
                    }}
                    style={{
                        padding: "4px 12px",
                        border: "1px dashed #d1d5db",
                        borderRadius: 4,
                        background: "#f9fafb",
                        cursor: "pointer",
                        color: "#6b7280",
                        fontFamily: "inherit",
                    }}
                >
                    + 파일 추가
                </button>
                <input
                    ref={fileRef}
                    type="file"
                    multiple
                    style={{ display: "none" }}
                    onChange={(e) => {
                        const picked = Array.from(e.target.files ?? []);
                        if (picked.length > 0) {
                            setNewFiles((prev) => [...prev, ...picked]);
                        }
                        e.target.value = "";
                    }}
                />
            </div>

            {/* 추가할 파일 목록 (미리보기) */}
            {newFiles.map((f, i) => (
                <div
                    key={i}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 10px",
                        borderRadius: 6,
                        background: "#f0fdf4",
                        border: "1px solid #86efac",
                    }}
                >
                    <span style={{ fontSize: 14 }}>📎</span>
                    <span
                        style={{
                            flex: 1,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            fontSize: 13,
                            color: "#15803d",
                        }}
                    >
                        {f.name}
                    </span>
                    <span style={{ color: "#9ca3af", fontSize: 12 }}>
                        {Math.round(f.size / 1024)}KB
                    </span>
                    <button
                        type="button"
                        onClick={() =>
                            setNewFiles((prev) =>
                                prev.filter((_, j) => j !== i),
                            )
                        }
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#9ca3af",
                            padding: "0 2px",
                        }}
                    >
                        ✕
                    </button>
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 날짜 헬퍼 — toLocaleString 대신 직접 포맷 (Hydration 오류 방지)
// 서버(Node.js)와 브라우저의 로케일이 달라 "오전" vs "AM" 불일치 발생
// ─────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    const d = new Date(iso);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${mm}/${dd}`;
}
function fmtTime(iso: string) {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${min}`;
}
function fmtDateTime(iso: string) {
    const d = new Date(iso);
    const y = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${y}년 ${mm}월 ${dd}일 ${hh}:${min}`;
}
const styles = {
    headRow: {
        borderTop: "2px solid #111827",
        borderBottom: "1px solid #e5e7eb",
        background: "#f9fafb",
    } as React.CSSProperties,
    th: {
        padding: "10px 8px",
        fontWeight: 700,
        color: "#6b7280",
        letterSpacing: "0.05em",
        textTransform: "uppercase" as const,
    },
    row: {
        borderBottom: "1px solid #f3f4f6",
        transition: "background 0.08s",
    } as React.CSSProperties,
    td: { padding: "10px 8px", verticalAlign: "top" } as React.CSSProperties,
    dt: {
        color: "#9ca3af",
        fontWeight: 400,
        whiteSpace: "nowrap",
        paddingTop: 1,
    } as React.CSSProperties,
    dd: { color: "#374151", fontWeight: 500, margin: 0 } as React.CSSProperties,
};
