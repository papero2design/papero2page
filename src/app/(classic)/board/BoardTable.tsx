"use client";

import {
    useState,
    useTransition,
    useEffect,
    useCallback,
    useRef,
    memo,
    Fragment,
} from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TaskWithDesigner } from "@/types/database";
import { deleteTaskFile } from "./actions";
import {
    clientUpdateTask,
    clientUpdateTaskStatus,
    clientGetTaskLogs,
    clientDeleteTask,
    clientDeleteTasks,
    clientBulkUpdateDesigner,
    clientBulkComplete,
    clientTogglePriority,
    type LogEntry,
} from "./clientMutations";
import { createClient } from "@/lib/supabase/client";
import { uploadToR2, deleteFromR2 } from "@/lib/r2/upload";
import FileUploadField, { type ExistingFile } from "./FileUploadField";
import { useToast } from "./Toast";

// ─────────────────────────────────────────────────────────────
// 상수 & 타입
// ─────────────────────────────────────────────────────────────

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, registered_by, " +
    "status, is_priority, is_quick, created_at, deleted_at, " +
    "designer:designers(id, name)";

const STATUSES = ["작업중", "완료"] as const;
type Status = (typeof STATUSES)[number];

const STATUS_STYLE: Record<
    Status,
    { bg: string; color: string; border: string }
> = {
    작업중: { bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
    완료: { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0" },
};

interface Props {
    tasks: TaskWithDesigner[];
    total: number;
    from: number;
    designers?: { id: string; name: string }[];
    writeButton?: React.ReactNode;
    canEditDesigner?: boolean;
    onMutate?: () => void;
    highlightPriorityRows?: boolean;
}

const ORDER_SOURCES = ["홈페이지", "스토어팜"];
const ORDER_METHODS = [
    "샘플디자인 의뢰",
    "재주문(글자수정)",
    "인쇄만 의뢰",
    "재주문(수정없는)",
    "디자인 복원",
    "신규 디자인",
    "디자인 수정",
    "기타",
];
const POST_PROCESSINGS = ["없음", "단면박", "양면박", "귀도리", "기타"];
const BOX_TYPES = ["단면박", "양면박"];
const FILE_PATHS = ["게시판", "메일", "없음"];
function deriveConsultPath(url: string): string {
    if (!url.trim()) return "없음";
    const lower = url.toLowerCase();
    if (lower.includes("naver")) return "네이버";
    if (lower.includes("kakao")) return "카카오";
    return "기타";
}

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
    special_details: "처리특이사항",
    registered_by: "등록자",
    deleted: "삭제",
    restored: "복구",
};

// 후가공 값 파싱
function parsePostProc(raw: string | null) {
    const v = raw ?? "없음";
    if (v.startsWith("귀도리 ")) {
        return {
            base: "귀도리",
            귀도리_size: v.replace("귀도리 ", "") as "4mm" | "6mm",
            note: "",
        };
    }
    if (v.startsWith("단면박 - ")) {
        return {
            base: "단면박",
            귀도리_size: "4mm" as const,
            note: v.slice(5),
        };
    }
    if (v.startsWith("양면박 - ")) {
        return {
            base: "양면박",
            귀도리_size: "4mm" as const,
            note: v.slice(5),
        };
    }
    if (v.startsWith("기타: ")) {
        return { base: "기타", 귀도리_size: "4mm" as const, note: v.slice(4) };
    }
    return { base: v, 귀도리_size: "4mm" as const, note: "" };
}

function buildPostProc(base: string, note: string, 귀도리Size: "4mm" | "6mm") {
    if (base === "귀도리") return `귀도리 ${귀도리Size}`;
    if (BOX_TYPES.includes(base) && note.trim())
        return `${base} - ${note.trim()}`;
    if (base === "기타" && note.trim()) return `기타: ${note.trim()}`;
    return base;
}

// ─────────────────────────────────────────────────────────────
// 날짜 헬퍼
// ─────────────────────────────────────────────────────────────

function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear().toString().slice(2)}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}
function fmtTime(iso: string) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtDateTime(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}년 ${String(d.getMonth() + 1).padStart(2, "0")}월 ${String(d.getDate()).padStart(2, "0")}일 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ─────────────────────────────────────────────────────────────
// 공통 다이얼로그
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
        <div style={overlay(2000)}>
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
        <div style={overlay(2000)}>
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
                    placeholder="사유 입력 (선택사항)"
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
            setLogs(await clientGetTaskLogs(taskId));
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
                <button
                    onClick={load}
                    style={{
                        marginTop: 10,
                        ...footerBtn(false),
                        display: "block",
                    }}
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
                                {(() => {
                                    const hasOld = log.old_value !== null;
                                    const hasNew = log.new_value !== null;
                                    const showArrow = hasOld || hasNew;
                                    const displayOld =
                                        log.old_value ??
                                        (hasNew ? "미작성" : null);
                                    const displayNew =
                                        log.new_value ??
                                        (hasOld ? "미작성" : null);
                                    return (
                                        <>
                                            {displayOld !== null && (
                                                <>
                                                    <span
                                                        style={{
                                                            padding: "1px 5px",
                                                            borderRadius: 4,
                                                            background:
                                                                "#f3f4f6",
                                                            color: hasOld
                                                                ? "#6b7280"
                                                                : "#d1d5db",
                                                            textDecoration:
                                                                hasOld
                                                                    ? "line-through"
                                                                    : "none",
                                                            fontStyle: hasOld
                                                                ? "normal"
                                                                : "italic",
                                                        }}
                                                    >
                                                        {displayOld}
                                                    </span>
                                                    {showArrow && (
                                                        <span
                                                            style={{
                                                                color: "#d1d5db",
                                                            }}
                                                        >
                                                            →
                                                        </span>
                                                    )}
                                                </>
                                            )}
                                            {displayNew !== null && (
                                                <span
                                                    style={{
                                                        padding: "1px 6px",
                                                        borderRadius: 4,
                                                        fontWeight: 600,
                                                        background:
                                                            log.changed_field ===
                                                            "status"
                                                                ? "#f0fdf4"
                                                                : log.changed_field ===
                                                                    "is_priority"
                                                                  ? "#fef2f2"
                                                                  : "#f3f4f6",
                                                        color: !hasNew
                                                            ? "#d1d5db"
                                                            : log.changed_field ===
                                                                "status"
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
                                                            log.changed_field ===
                                                            "status"
                                                                ? "#bbf7d0"
                                                                : log.changed_field ===
                                                                    "is_priority"
                                                                  ? "#fecaca"
                                                                  : "#e5e7eb",
                                                        fontStyle: hasNew
                                                            ? "normal"
                                                            : "italic",
                                                    }}
                                                >
                                                    {displayNew}
                                                </span>
                                            )}
                                        </>
                                    );
                                })()}
                            </div>
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
                                        {log.changed_by_name}
                                    </span>
                                ) : (
                                    <span style={{ color: "#d1d5db" }}>—</span>
                                )}
                                <span style={{ color: "#9ca3af" }}>
                                    {fmtDate(log.created_at)}{" "}
                                    {fmtTime(log.created_at)}
                                </span>
                            </div>
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
                                    {log.reason}
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
// 첨부파일 훅 & 컴포넌트
// ─────────────────────────────────────────────────────────────

function useTaskFiles(taskId: string) {
    const [files, setFiles] = useState<ExistingFile[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [rev, setRev] = useState(0);

    useEffect(() => {
        let cancelled = false;
        const supabase = createClient();
        supabase
            .from("task_files")
            .select("id, file_name, file_url, file_size")
            .eq("task_id", taskId)
            .order("created_at")
            .then(({ data, error }) => {
                if (cancelled) return;
                if (error)
                    console.error("[useTaskFiles] 조회 실패:", error.message);
                const mapped: ExistingFile[] = (data ?? []).map(
                    (f: {
                        id: string;
                        file_name: string;
                        file_url: string;
                        file_size: number | null;
                    }) => ({
                        id: f.id,
                        name: f.file_name,
                        url: f.file_url,
                        size: f.file_size,
                    }),
                );
                setFiles(mapped);
                setLoading(false);
            });
        return () => {
            cancelled = true;
        };
    }, [taskId, rev]);

    // setLoading(true) is called here (outside the effect) so the linter is satisfied
    const reload = useCallback(() => {
        setLoading(true);
        setRev((n) => n + 1);
    }, []);

    const removeById = (id: string) =>
        setFiles((prev) => (prev ? prev.filter((f) => f.id !== id) : prev));
    const addFile = (f: ExistingFile) =>
        setFiles((prev) => (prev ? [...prev, f] : [f]));

    return { files, loading, reload, removeById, addFile };
}

function FileItem({ f }: { f: ExistingFile }) {
    const kb = f.size ? Math.ceil(f.size / 1024) : null;
    return (
        <a
            href={f.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "3px 8px",
                background: "#f9fafb",
                border: "1px solid #e5e7eb",
                borderRadius: 4,
                color: "#374151",
                textDecoration: "none",
                fontSize: 13,
            }}
        >
            📎 {f.name}
            {kb ? ` (${kb}KB)` : ""}
        </a>
    );
}

function TaskFilesEdit({
    dbFiles,
    newFiles,
    setNewFiles,
    onDeleteExisting,
}: {
    dbFiles: ExistingFile[];
    newFiles: File[];
    setNewFiles: (f: File[]) => void;
    onDeleteExisting: (id: string) => void;
}) {
    return (
        <div>
            {dbFiles.map((f) => (
                <div
                    key={f.id}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        marginBottom: 4,
                    }}
                >
                    <FileItem f={f} />
                    <button
                        type="button"
                        onClick={() => onDeleteExisting(f.id)}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#ef4444",
                            padding: "2px 4px",
                        }}
                    >
                        ✕
                    </button>
                </div>
            ))}
            <FileUploadField files={newFiles} onChange={setNewFiles} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 상세 모달
// ─────────────────────────────────────────────────────────────

export function TaskDetailModal({
    task,
    onClose,
    onDeleted,
    designers = [],
    canEditDesigner = false,
    onMutate,
}: {
    task: TaskWithDesigner;
    onClose: () => void;
    onDeleted: () => void;
    designers?: { id: string; name: string }[];
    canEditDesigner?: boolean;
    onMutate?: () => void;
}) {
    const [currentStatus, setCurrentStatus] = useState<Status>(
        (STATUSES as readonly string[]).includes(task.status)
            ? (task.status as Status)
            : "작업중",
    );
    const [currentPriority, setCurrentPriority] = useState(
        task.is_priority ?? false,
    );
    const [tab, setTab] = useState<"view" | "edit" | "log">("view");
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [copiedKey, setCopiedKey] = useState<string | null>(null);
    const [copiedTdKey, setCopiedTdKey] = useState<string | null>(null);
    const [linkCopied, setLinkCopied] = useState(false);
    const [isPending, startTransition] = useTransition();
    const blockCloseRef = useRef(false);
    const [newFiles, setNewFiles] = useState<File[]>([]);
    const { showToast, ToastUI } = useToast();

    const {
        files: taskFiles,
        loading: filesLoading,
        reload: reloadFiles,
        removeById: removeFileById,
    } = useTaskFiles(task.id);

    const [statusModal, setStatusModal] = useState<{
        show: boolean;
        target: Status | null;
    }>({ show: false, target: null });
    const [priorityModal, setPriorityModal] = useState(false);
    const [deleteConfirm, setDeleteConfirm] = useState(false);

    const parsedPP = parsePostProc(task.post_processing);

    const initEdit = () => ({
        order_source: task.order_source ?? "",
        customer_name: task.customer_name ?? "",
        order_method: task.order_method ?? "",
        order_method_note: task.order_method_note ?? "",
        print_items: task.print_items ?? "",
        post_processing: parsedPP.base,
        귀도리_size: parsedPP.귀도리_size,
        post_processing_note: parsedPP.note,
        file_path: task.file_paths?.[0] ?? "없음",
        consult_link: task.consult_link ?? "",
        special_details_yn: task.special_details
            ? "있음"
            : ("없음" as "있음" | "없음"),
        special_details: task.special_details ?? "",
        registered_by: task.registered_by ?? "",
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

    const copyToClipboard = (label: string, value: string) => {
        if (!value || value === "없음" || value === "미배정") return;
        let copyValue = value;
        // 인쇄항목에 귀도리 포함 시 모서리라운드로 변환
        // (+귀도리 또는 귀도리 모두 대응)
        if (copyValue.includes("귀도리")) {
            const printItems = task.print_items ?? "";
            const isHeavy =
                printItems.includes("두꺼운") || printItems.includes("고품격");
            // +귀도리, 귀도리 모두 대응 (\+? = + 기호 있어도 없어도)
            copyValue = isHeavy
                ? copyValue.replace(/\+?귀도리/g, "모서리라운드 6mm")
                : copyValue.replace(/\+?귀도리/g, "모서리라운드 4mm");
        }
        navigator.clipboard.writeText(copyValue).then(() => {
            setCopiedKey(label);
            setTimeout(() => setCopiedKey(null), 1500);
        });
    };

    const handleStatusChange = (newStatus: Status) => {
        if (newStatus === currentStatus) return;
        startTransition(async () => {
            try {
                const completedAt =
                    newStatus === "완료"
                        ? new Date().toISOString()
                        : currentStatus === "완료"
                          ? null
                          : undefined;
                await clientUpdateTaskStatus(
                    task.id,
                    currentStatus,
                    newStatus,
                    completedAt,
                    null,
                );
                setCurrentStatus(newStatus);
                onMutate?.();
                if (newStatus === "완료") onClose();
            } catch (err) {
                showToast("상태 변경 실패: " + (err as Error).message);
            }
        });
    };

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
                await clientUpdateTaskStatus(
                    task.id,
                    currentStatus,
                    newStatus,
                    completedAt,
                    reason,
                );
                setCurrentStatus(newStatus);
                onMutate?.();
            } catch (err) {
                showToast("상태 변경 실패: " + (err as Error).message);
            }
        });
    };

    const confirmPriorityToggle = (reason: string | null) => {
        const newVal = !currentPriority;
        setPriorityModal(false);
        startTransition(async () => {
            try {
                await clientTogglePriority(task.id, newVal, reason);
                setCurrentPriority(newVal);
                set("is_priority", newVal);
                onMutate?.();
            } catch (err) {
                showToast("우선작업 변경 실패: " + (err as Error).message);
            }
        });
    };

    const handleComplete = () => {
        startTransition(async () => {
            try {
                const completedAt = new Date().toISOString();
                await clientUpdateTaskStatus(
                    task.id,
                    currentStatus,
                    "완료",
                    completedAt,
                    null,
                );
                setCurrentStatus("완료");
                onMutate?.();
                onClose();
            } catch (err) {
                showToast("상태 변경 실패: " + (err as Error).message);
            }
        });
    };

    const handleDeleteExisting = async (id: string) => {
        removeFileById(id);
        const target = (taskFiles ?? []).find((f) => f.id === id);
        try {
            if (target?.url) await deleteFromR2("task-files", target.url);
            await deleteTaskFile(id);
        } catch (err) {
            showToast("파일 삭제 실패: " + (err as Error).message);
            reloadFiles();
        }
    };

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
                if (newFiles.length > 0) {
                    for (const file of newFiles) {
                        const { publicUrl } = await uploadToR2(
                            "task-files",
                            file,
                        );
                        const { error: insertErr } = await supabase
                            .from("task_files")
                            .insert({
                                task_id: task.id,
                                file_url: publicUrl,
                                file_name: file.name,
                                file_size: file.size,
                            });
                        if (insertErr)
                            throw new Error(
                                `첨부파일 저장 실패: ${insertErr.message}`,
                            );
                    }
                    setNewFiles([]);
                }

                const postProc = buildPostProc(
                    form.post_processing,
                    form.post_processing_note,
                    form.귀도리_size,
                );
                const newDesignerName =
                    designers.find((d) => d.id === form.assigned_designer_id)
                        ?.name ??
                    (form.assigned_designer_id === task.designer?.id
                        ? (task.designer?.name ?? null)
                        : form.assigned_designer_id
                          ? null
                          : null);
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
                        oldValue: task.consult_link ?? null,
                        newValue: form.consult_link || null,
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
                    {
                        field: "registered_by",
                        oldValue: task.registered_by ?? null,
                        newValue: form.registered_by.trim() || null,
                    },
                ];

                await clientUpdateTask(
                    task.id,
                    {
                        order_source: form.order_source,
                        customer_name: form.customer_name.trim(),
                        order_method: form.order_method,
                        order_method_note:
                            form.order_method_note.trim() || null,
                        print_items: form.print_items.trim(),
                        post_processing: postProc,
                        consult_path: deriveConsultPath(form.consult_link),
                        consult_link: form.consult_link || null,
                        special_details:
                            form.special_details_yn === "있음"
                                ? form.special_details.trim()
                                : null,
                        assigned_designer_id: form.assigned_designer_id || null,
                        registered_by: form.registered_by.trim() || null,
                        is_priority: form.is_priority,
                        is_quick: false,
                    },
                    logEntries,
                    form.edit_reason.trim() || null,
                );
                onClose();
                onMutate?.();
            } catch (err) {
                showToast("수정 실패: " + (err as Error).message);
            }
        });
    };

    const handleDelete = () => {
        setDeleteConfirm(false);
        startTransition(async () => {
            try {
                await clientDeleteTask(task.id, "목록에서 삭제");
                onDeleted();
                onMutate?.();
            } catch (err) {
                showToast("삭제 실패: " + (err as Error).message);
            }
        });
    };

    const st = STATUS_STYLE[currentStatus] ?? STATUS_STYLE["작업중"];

    const viewFields = [
        { label: "주문경로", value: task.order_source },
        { label: "고객이름", value: task.customer_name },
        { label: "주문방법", value: task.order_method },
        { label: "주문방법 메모", value: task.order_method_note ?? "—" },
        { label: "인쇄항목", value: task.print_items },
        { label: "후가공", value: task.post_processing ?? "없음" },
        {
            label: "상담경로",
            value: task.consult_link
                ? deriveConsultPath(task.consult_link)
                : (task.consult_path ?? "없음"),
            link: task.consult_link ?? undefined,
        },
        {
            label: "처리특이사항",
            value: task.special_details ?? "없음",
            alert: !!task.special_details,
            link: task.special_details
                ? (task.special_details.match(/https?:\/\/\S+/)?.[0] ??
                  undefined)
                : undefined,
        },
        { label: "담당 디자이너", value: task.designer?.name ?? "미배정" },
        { label: "등록자", value: task.registered_by ?? "—" },
        { label: "접수일시", value: fmtDateTime(task.created_at) },
    ] as { label: string; value: string; alert?: boolean; link?: string }[];

    const showPpNote =
        BOX_TYPES.includes(form.post_processing) ||
        form.post_processing === "기타";

    return (
        <>
            {ToastUI}
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
                            : "우선작업으로 등록합니다."
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
                                <span style={{ color: "#d1d5db" }}>
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
                                <span
                                    style={baseBadge(
                                        "#fef2f2",
                                        "#dc2626",
                                        "#fecaca",
                                    )}
                                >
                                    우선
                                </span>
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
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                            }}
                        >
                            <button
                                onClick={() => {
                                    navigator.clipboard
                                        .writeText(window.location.href)
                                        .then(() => {
                                            setLinkCopied(true);
                                            setTimeout(
                                                () => setLinkCopied(false),
                                                1500,
                                            );
                                        });
                                }}
                                title="링크 복사"
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    width: 30,
                                    height: 30,
                                    borderRadius: "50%",
                                    border: `1px solid ${linkCopied ? "#bbf7d0" : "#e5e7eb"}`,
                                    background: linkCopied
                                        ? "#f0fdf4"
                                        : "#f9fafb",
                                    cursor: "pointer",
                                    color: linkCopied ? "#15803d" : "#6b7280",
                                    transition: "all 0.15s",
                                    flexShrink: 0,
                                }}
                            >
                                {linkCopied ? (
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2.5"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                ) : (
                                    <svg
                                        width="14"
                                        height="14"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                    >
                                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                                    </svg>
                                )}
                            </button>
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
                                        onClick={() => handleStatusChange(s)}
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
                            {canEditDesigner && (
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
                                        ? "우선 해제"
                                        : "우선 등록"}
                                </button>
                            )}
                        </div>
                    )}

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
                                    {viewFields.map(
                                        ({ label, value, alert, link }) => {
                                            const isCopied =
                                                copiedKey === label;
                                            const isTdCopied =
                                                copiedTdKey === label;
                                            const canCopy =
                                                !!value &&
                                                value !== "없음" &&
                                                value !== "미배정" &&
                                                value !== "—" &&
                                                !link;
                                            // 주문방법 메모: td 클릭 시 괄호 안 내용만 복사
                                            const isMemo =
                                                label === "주문방법 메모";
                                            const bracketMatch =
                                                isMemo && value
                                                    ? value.match(/\(([^)]+)\)/)
                                                    : null;
                                            const canCopyBracket =
                                                !!bracketMatch;
                                            // 처리특이사항: td 클릭 시 스)...파일명 복사
                                            const isSpecial =
                                                label === "처리특이사항";
                                            const backupMatch =
                                                isSpecial && value
                                                    ? value.match(/스\).+/)
                                                    : null;
                                            const backupCopyText = backupMatch
                                                ? backupMatch[0].trim()
                                                : null;
                                            const canCopyBackup =
                                                !!backupCopyText;
                                            return (
                                                <tr
                                                    key={label}
                                                    style={{
                                                        borderBottom:
                                                            "1px solid #f3f4f6",
                                                        background: isCopied
                                                            ? "#f0fdf4"
                                                            : "transparent",
                                                        transition:
                                                            "background 0.15s",
                                                    }}
                                                >
                                                    <th
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
                                                            cursor: canCopy
                                                                ? "pointer"
                                                                : "default",
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
                                                        onClick={
                                                            canCopyBracket
                                                                ? () => {
                                                                      navigator.clipboard
                                                                          .writeText(
                                                                              bracketMatch![1],
                                                                          )
                                                                          .then(
                                                                              () => {
                                                                                  setCopiedTdKey(
                                                                                      label,
                                                                                  );
                                                                                  setTimeout(
                                                                                      () =>
                                                                                          setCopiedTdKey(
                                                                                              null,
                                                                                          ),
                                                                                      1500,
                                                                                  );
                                                                              },
                                                                          );
                                                                  }
                                                                : canCopyBackup
                                                                  ? () => {
                                                                        navigator.clipboard
                                                                            .writeText(
                                                                                backupCopyText!,
                                                                            )
                                                                            .then(
                                                                                () => {
                                                                                    setCopiedTdKey(
                                                                                        label,
                                                                                    );
                                                                                    setTimeout(
                                                                                        () =>
                                                                                            setCopiedTdKey(
                                                                                                null,
                                                                                            ),
                                                                                        1500,
                                                                                    );
                                                                                },
                                                                            );
                                                                    }
                                                                  : undefined
                                                        }
                                                        style={{
                                                            padding: "9px 16px",
                                                            fontWeight: alert
                                                                ? 700
                                                                : 500,
                                                            color: isCopied
                                                                ? "#15803d"
                                                                : isTdCopied
                                                                  ? "#7c3aed"
                                                                  : alert
                                                                    ? "#ef4444"
                                                                    : "#111827",
                                                            verticalAlign:
                                                                "top",
                                                            transition:
                                                                "color 0.15s",
                                                            cursor:
                                                                canCopyBracket ||
                                                                canCopyBackup
                                                                    ? "pointer"
                                                                    : "default",
                                                            whiteSpace:
                                                                isSpecial
                                                                    ? "pre-line"
                                                                    : undefined,
                                                        }}
                                                    >
                                                        {link ? (
                                                            <a
                                                                href={link}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                style={{
                                                                    color: "#1ED67D",
                                                                    fontWeight: 600,
                                                                    textDecoration:
                                                                        "none",
                                                                    wordBreak:
                                                                        "break-all",
                                                                }}
                                                            >
                                                                {value} ↗
                                                            </a>
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
                            <div
                                style={{
                                    padding: "8px 16px 12px",
                                    borderTop: "1px solid #f3f4f6",
                                }}
                            >
                                <p
                                    style={{
                                        margin: "0 0 8px",
                                        fontWeight: 600,
                                        color: "#6b7280",
                                        fontSize: 13,
                                    }}
                                >
                                    {`첨부파일 ${taskFiles && taskFiles.length > 0 ? `${taskFiles.length}개` : "없음"}`}
                                </p>
                                {taskFiles && taskFiles.length > 0 && (
                                    <div
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: 4,
                                        }}
                                    >
                                        {taskFiles.map((f) => (
                                            <FileItem key={f.id} f={f} />
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* LOG */}
                    {tab === "log" && <LogTimeline taskId={task.id} />}

                    {/* EDIT */}
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
                                        <div
                                            style={{
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: 5,
                                                marginBottom: 6,
                                            }}
                                        >
                                            {ORDER_METHODS.map((m) => (
                                                <button
                                                    key={m}
                                                    type="button"
                                                    onClick={() =>
                                                        set("order_method", m)
                                                    }
                                                    style={toggleBtn(
                                                        form.order_method === m,
                                                    )}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                        {(form.order_method ===
                                            "샘플디자인 의뢰" ||
                                            form.order_method === "기타") && (
                                            <input
                                                value={form.order_method_note}
                                                onChange={(e) =>
                                                    set(
                                                        "order_method_note",
                                                        e.target.value,
                                                    )
                                                }
                                                placeholder="주문방법 상세 메모 (선택)"
                                                style={inp(false)}
                                            />
                                        )}
                                    </ERow>
                                    <ERow
                                        label="인쇄항목"
                                        required
                                        error={errors.print_items}
                                    >
                                        <input
                                            value={form.print_items}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                set("print_items", val);
                                                if (
                                                    (val.includes("두꺼운") ||
                                                        val.includes(
                                                            "고품격",
                                                        )) &&
                                                    form.post_processing ===
                                                        "귀도리" &&
                                                    form.귀도리_size === "4mm"
                                                ) {
                                                    set("귀도리_size", "6mm");
                                                }
                                            }}
                                            style={inp(!!errors.print_items)}
                                        />
                                    </ERow>
                                    <ERow label="후가공">
                                        <BtnGroup
                                            options={POST_PROCESSINGS}
                                            value={form.post_processing}
                                            onChange={(v) => {
                                                set("post_processing", v);
                                                set("post_processing_note", "");
                                            }}
                                        />
                                        {/* 귀도리 4/6mm */}
                                        {form.post_processing === "귀도리" && (
                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: 5,
                                                    marginTop: 6,
                                                }}
                                            >
                                                {(["4mm", "6mm"] as const).map(
                                                    (s) => {
                                                        const force6mm =
                                                            form.print_items.includes(
                                                                "두꺼운",
                                                            ) ||
                                                            form.print_items.includes(
                                                                "고품격",
                                                            );
                                                        const disabled =
                                                            s === "4mm" &&
                                                            force6mm;
                                                        return (
                                                            <button
                                                                key={s}
                                                                type="button"
                                                                disabled={
                                                                    disabled
                                                                }
                                                                onClick={() =>
                                                                    set(
                                                                        "귀도리_size",
                                                                        s,
                                                                    )
                                                                }
                                                                style={{
                                                                    ...toggleBtn(
                                                                        form.귀도리_size ===
                                                                            s,
                                                                    ),
                                                                    ...(form.귀도리_size ===
                                                                    s
                                                                        ? {
                                                                              background:
                                                                                  "#7c3aed",
                                                                              borderColor:
                                                                                  "#7c3aed",
                                                                              color: "#fff",
                                                                          }
                                                                        : {}),
                                                                    ...(disabled
                                                                        ? {
                                                                              opacity: 0.35,
                                                                              cursor: "not-allowed",
                                                                          }
                                                                        : {}),
                                                                }}
                                                            >
                                                                {s}
                                                            </button>
                                                        );
                                                    },
                                                )}
                                            </div>
                                        )}
                                        {/* 단면박/양면박 텍스트 */}
                                        {BOX_TYPES.includes(
                                            form.post_processing,
                                        ) && (
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
                                                placeholder="박 상세 내용 (선택)"
                                                style={{
                                                    ...inp(false),
                                                    marginTop: 6,
                                                }}
                                            />
                                        )}
                                        {/* 기타 */}
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
                                    <ERow label="첨부파일">
                                        <TaskFilesEdit
                                            dbFiles={taskFiles ?? []}
                                            newFiles={newFiles}
                                            setNewFiles={setNewFiles}
                                            onDeleteExisting={
                                                handleDeleteExisting
                                            }
                                        />
                                    </ERow>
                                    <ERow label="상담링크">
                                        <input
                                            type="url"
                                            value={form.consult_link}
                                            onChange={(e) =>
                                                set(
                                                    "consult_link",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="https://..."
                                            style={inp(false)}
                                        />
                                    </ERow>
                                    <ERow
                                        label="처리특이사항"
                                        error={errors.special_details}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 5,
                                                marginBottom:
                                                    form.special_details_yn ===
                                                    "있음"
                                                        ? 6
                                                        : 0,
                                            }}
                                        >
                                            {(["없음", "있음"] as const).map(
                                                (v) => (
                                                    <button
                                                        key={v}
                                                        type="button"
                                                        onClick={() =>
                                                            set(
                                                                "special_details_yn",
                                                                v,
                                                            )
                                                        }
                                                        style={{
                                                            ...toggleBtn(
                                                                form.special_details_yn ===
                                                                    v,
                                                            ),
                                                            ...(v === "있음" &&
                                                            form.special_details_yn ===
                                                                "있음"
                                                                ? {
                                                                      background:
                                                                          "#ef4444",
                                                                      borderColor:
                                                                          "#ef4444",
                                                                      color: "#fff",
                                                                  }
                                                                : {}),
                                                        }}
                                                    >
                                                        {v}
                                                    </button>
                                                ),
                                            )}
                                        </div>
                                        {form.special_details_yn === "있음" && (
                                            <textarea
                                                value={form.special_details}
                                                onChange={(e) =>
                                                    set(
                                                        "special_details",
                                                        e.target.value,
                                                    )
                                                }
                                                rows={3}
                                                style={{
                                                    ...inp(
                                                        !!errors.special_details,
                                                    ),
                                                    resize: "vertical",
                                                    display: "block",
                                                }}
                                            />
                                        )}
                                    </ERow>
                                    {/* 담당 디자이너 — admin 또는 canEditDesigner일 때 수정 가능 */}
                                    <ERow label="담당 디자이너">
                                        {canEditDesigner ? (
                                            designers.length > 0 ? (
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        flexWrap: "wrap",
                                                        gap: 5,
                                                    }}
                                                >
                                                    {/* 미배정 버튼 */}
                                                    <button
                                                        type="button"
                                                        onClick={() =>
                                                            set(
                                                                "assigned_designer_id",
                                                                "",
                                                            )
                                                        }
                                                        style={{
                                                            ...toggleBtn(
                                                                form.assigned_designer_id ===
                                                                    "",
                                                            ),
                                                            ...(form.assigned_designer_id ===
                                                            ""
                                                                ? {
                                                                      background:
                                                                          "#6b7280",
                                                                      borderColor:
                                                                          "#6b7280",
                                                                      color: "#fff",
                                                                  }
                                                                : {}),
                                                        }}
                                                    >
                                                        미배정
                                                    </button>
                                                    {designers.map((d) => (
                                                        <button
                                                            key={d.id}
                                                            type="button"
                                                            onClick={() =>
                                                                set(
                                                                    "assigned_designer_id",
                                                                    form.assigned_designer_id ===
                                                                        d.id
                                                                        ? ""
                                                                        : d.id,
                                                                )
                                                            }
                                                            style={{
                                                                ...toggleBtn(
                                                                    form.assigned_designer_id ===
                                                                        d.id,
                                                                ),
                                                                ...(form.assigned_designer_id ===
                                                                d.id
                                                                    ? {
                                                                          background:
                                                                              "#1ED67D",
                                                                          borderColor:
                                                                              "#1ED67D",
                                                                          color: "#fff",
                                                                      }
                                                                    : {}),
                                                            }}
                                                        >
                                                            {d.name}
                                                        </button>
                                                    ))}
                                                </div>
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
                                                    "미배정"}
                                            </span>
                                        )}
                                    </ERow>
                                    <ERow label="등록자">
                                        <input
                                            value={form.registered_by}
                                            onChange={(e) =>
                                                set(
                                                    "registered_by",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="등록자 이름"
                                            style={inp(false)}
                                        />
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
                                    휴지통으로
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
                                        style={{
                                            padding: "6px 16px",
                                            fontWeight: 600,
                                            border: "1px solid #d1d5db",
                                            borderRadius: 4,
                                            cursor: "pointer",
                                            background: "#fff",
                                            color: "#374151",
                                            fontFamily: "inherit",
                                        }}
                                    >
                                        수정
                                    </button>
                                    {currentStatus !== "완료" && (
                                        <button
                                            onClick={handleComplete}
                                            disabled={isPending}
                                            style={{
                                                padding: "6px 16px",
                                                fontWeight: 600,
                                                border: "1px solid #bbf7d0",
                                                borderRadius: 4,
                                                cursor: isPending
                                                    ? "not-allowed"
                                                    : "pointer",
                                                background: "#f0fdf4",
                                                color: "#15803d",
                                                fontFamily: "inherit",
                                                opacity: isPending ? 0.7 : 1,
                                            }}
                                        >
                                            완료
                                        </button>
                                    )}
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

function BoardTable({
    tasks,
    total,
    from,
    designers = [],
    writeButton,
    canEditDesigner = false,
    onMutate,
    highlightPriorityRows = false,
}: Props) {
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const [modalTask, setModalTask] = useState<TaskWithDesigner | null>(null);
    const [isPending, startTransition] = useTransition();
    const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
    const [bulkCompleteConfirm, setBulkCompleteConfirm] = useState(false);
    const { showToast, ToastUI } = useToast();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // 공유 링크: 마운트 시 URL의 task param으로 모달 자동 오픈
    useEffect(() => {
        const taskId = searchParams.get("task");
        if (!taskId) return;
        const existing = tasks.find((t) => t.id === taskId);
        if (existing) {
            setModalTask(existing);
            return;
        }
        // 현재 페이지에 없으면 DB에서 직접 단건 fetch
        createClient()
            .from("tasks")
            .select(TASK_SELECT)
            .eq("id", taskId)
            .is("deleted_at", null)
            .single()
            .then(({ data }) => {
                if (data) setModalTask(data as unknown as TaskWithDesigner);
            });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const openModal = (task: TaskWithDesigner) => {
        setModalTask(task);
        const params = new URLSearchParams(searchParams.toString());
        params.set("task", task.id);
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const closeModal = () => {
        setModalTask(null);
        const params = new URLSearchParams(searchParams.toString());
        params.delete("task");
        router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    };

    const toggleCheck = (id: string) =>
        setChecked((prev) => {
            const n = new Set(prev);
            if (n.has(id)) n.delete(id);
            else n.add(id);
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
                await clientDeleteTasks(Array.from(checked), "선택삭제");
                setChecked(new Set());
                onMutate?.();
            } catch (err) {
                showToast("선택삭제 실패: " + (err as Error).message);
            }
        });
    };

    const handleBulkComplete = () => {
        setBulkCompleteConfirm(false);
        startTransition(async () => {
            try {
                const oldStatuses = new Map(
                    tasks
                        .filter((t) => checked.has(t.id))
                        .map((t) => [t.id, t.status as string]),
                );
                await clientBulkComplete(Array.from(checked), oldStatuses);
                setChecked(new Set());
                onMutate?.();
            } catch (err) {
                showToast("일괄 완료 실패: " + (err as Error).message);
            }
        });
    };

    const hasChecked = checked.size > 0;

    return (
        <>
            {ToastUI}
            {bulkDeleteConfirm && (
                <ConfirmDialog
                    message={`선택한 ${checked.size}건을 휴지통으로 보낼까요?\n관리자 페이지에서 복구할 수 있습니다.`}
                    confirmLabel={`${checked.size}건 휴지통으로`}
                    danger
                    onConfirm={handleBulkDelete}
                    onCancel={() => setBulkDeleteConfirm(false)}
                />
            )}
            {bulkCompleteConfirm && (
                <ConfirmDialog
                    message={`선택한 ${checked.size}건을 완료로 이동할까요?`}
                    confirmLabel={`${checked.size}건 완료`}
                    onConfirm={handleBulkComplete}
                    onCancel={() => setBulkCompleteConfirm(false)}
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
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                    }}
                >
                    <button
                        className="bo-btn"
                        disabled={!hasChecked || isPending}
                        onClick={() => hasChecked && setBulkDeleteConfirm(true)}
                        style={{
                            opacity: hasChecked ? 1 : 0.35,
                            cursor: hasChecked ? "pointer" : "default",
                        }}
                    >
                        선택 삭제
                    </button>

                    {hasChecked && designers.length > 0 && (
                        <BulkDesignerSelect
                            designers={designers}
                            count={checked.size}
                            onAssign={(designerId, designerName) => {
                                startTransition(async () => {
                                    try {
                                        const oldNameMap = new Map(
                                            tasks
                                                .filter((t) =>
                                                    checked.has(t.id),
                                                )
                                                .map((t) => [
                                                    t.id,
                                                    (
                                                        t.designer as {
                                                            name: string;
                                                        } | null
                                                    )?.name ?? null,
                                                ]),
                                        );
                                        await clientBulkUpdateDesigner(
                                            Array.from(checked),
                                            designerId,
                                            designerName,
                                            oldNameMap,
                                        );
                                        setChecked(new Set());
                                        onMutate?.();
                                    } catch (err) {
                                        showToast(
                                            "일괄 변경 실패: " +
                                                (err as Error).message,
                                        );
                                    }
                                });
                            }}
                        />
                    )}
                    {hasChecked && (
                        <span style={{ color: "#6b7280", fontWeight: 600 }}>
                            {checked.size}건 선택됨
                        </span>
                    )}
                </div>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        flexWrap: "wrap",
                    }}
                >
                    {writeButton}
                    {hasChecked && (
                        <button
                            className="bo-btn"
                            disabled={isPending}
                            onClick={() => setBulkCompleteConfirm(true)}
                            style={{
                                background: "#f0fdf4",
                                color: "#15803d",
                                border: "1px solid #bbf7d0",
                            }}
                        >
                            선택 완료
                        </button>
                    )}
                </div>
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
                                width: 50,
                                textAlign: "center",
                                cursor: "pointer",
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
                            />
                        </th>
                        <th
                            scope="col"
                            style={{
                                ...styles.th,
                                width: 52,
                                textAlign: "center",
                                color: "#9ca3af",
                                fontSize: 12,
                            }}
                        >
                            순번
                        </th>
                        <th
                            scope="col"
                            style={{
                                ...styles.th,
                                textAlign: "left",
                                paddingLeft: 15,
                            }}
                        >
                            내용
                        </th>
                        <th
                            scope="col"
                            style={{
                                ...styles.th,
                                width: 90,
                                textAlign: "center",
                            }}
                        >
                            날짜 / 담당
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
                    {tasks.map((task, i) => {
                        const hasAlert = !!task.special_details;
                        const isChecked = checked.has(task.id);
                        const currDate = fmtDate(task.created_at);
                        const prevDate =
                            i > 0 ? fmtDate(tasks[i - 1].created_at) : null;
                        const showDateDivider =
                            prevDate !== null && prevDate !== currDate;

                        return (
                            <Fragment key={task.id}>
                                {showDateDivider && (
                                    <tr>
                                        <td
                                            colSpan={4}
                                            style={{
                                                padding: 0,
                                                height: 0,
                                                borderTop: "2px solid #fca5a5",
                                            }}
                                        />
                                    </tr>
                                )}
                                <tr
                                    style={{
                                        ...styles.row,
                                        borderLeft: task.is_priority
                                            ? "3px solid #ef4444"
                                            : "3px solid transparent",
                                        background: isChecked
                                            ? "#f0fdf4"
                                            : highlightPriorityRows &&
                                                task.is_priority
                                              ? "#fff7f7"
                                              : "#fff",
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
                                            : highlightPriorityRows &&
                                                task.is_priority
                                              ? "#fff7f7"
                                              : "#fff";
                                    }}
                                >
                                    {/* 체크박스 */}
                                    <td
                                        onClick={() => toggleCheck(task.id)}
                                        style={{
                                            ...styles.td,
                                            width: 36,
                                            textAlign: "center",
                                            cursor: "pointer",
                                            background: isChecked
                                                ? "#dcfce7"
                                                : "#f9fafb",
                                        }}
                                    >
                                        <input
                                            type="checkbox"
                                            checked={isChecked}
                                            onChange={() =>
                                                toggleCheck(task.id)
                                            }
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                                cursor: "pointer",
                                                width: 14,
                                                height: 14,
                                            }}
                                        />
                                    </td>

                                    {/* 순번 */}
                                    <td
                                        onClick={() => toggleCheck(task.id)}
                                        style={{
                                            ...styles.td,
                                            width: 52,
                                            textAlign: "center",
                                            cursor: "pointer",
                                            color: "#9ca3af",
                                            fontSize: 12,
                                            background: isChecked
                                                ? "#dcfce7"
                                                : "#f9fafb",
                                        }}
                                    >
                                        {total - from - i}
                                    </td>

                                    {/* 내용 */}
                                    <td
                                        style={{
                                            ...styles.td,
                                            paddingLeft: 15,
                                        }}
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 6,
                                                flexWrap: "wrap",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontWeight: 700,
                                                    color: task.is_priority
                                                        ? "#dc2626"
                                                        : "#111827",
                                                    cursor: "pointer",
                                                }}
                                                onClick={() => openModal(task)}
                                            >
                                                {task.customer_name}
                                            </span>
                                            {hasAlert && (
                                                <span
                                                    style={baseBadge(
                                                        "#fef2f2",
                                                        "#ef4444",
                                                        "#fecaca",
                                                    )}
                                                >
                                                    ⚠
                                                </span>
                                            )}
                                            {task.order_method &&
                                                (() => {
                                                    const isPrintOnly =
                                                        task.order_method ===
                                                            "인쇄만 의뢰" ||
                                                        task.order_method ===
                                                            "재주문(수정없는)";
                                                    return (
                                                        <span
                                                            style={{
                                                                fontSize: 12,
                                                                color: isPrintOnly
                                                                    ? "#1d4ed8"
                                                                    : "#374151",
                                                                background:
                                                                    isPrintOnly
                                                                        ? "#eff6ff"
                                                                        : "#f3f4f6",
                                                                border: `1px solid ${isPrintOnly ? "#bfdbfe" : "#e5e7eb"}`,
                                                                padding:
                                                                    "2px 7px",
                                                                borderRadius: 4,
                                                                whiteSpace:
                                                                    "nowrap",
                                                                flexShrink: 0,
                                                                fontWeight: 600,
                                                            }}
                                                        >
                                                            {task.order_method}
                                                        </span>
                                                    );
                                                })()}
                                            <span
                                                style={{
                                                    color: "#9ca3af",
                                                    cursor: "pointer",
                                                }}
                                                onClick={() => openModal(task)}
                                            >
                                                {task.print_items}
                                            </span>
                                            {task.post_processing &&
                                                task.post_processing !==
                                                    "없음" && (
                                                    <span
                                                        style={baseBadge(
                                                            "#faf5ff",
                                                            "#7c3aed",
                                                            "#e9d5ff",
                                                        )}
                                                    >
                                                        후가공
                                                    </span>
                                                )}
                                            {task.print_items &&
                                                task.print_items.includes(
                                                    "약도",
                                                ) && (
                                                    <span
                                                        style={baseBadge(
                                                            "#fff7ed",
                                                            "#ea580c",
                                                            "#fed7aa",
                                                        )}
                                                    >
                                                        약도
                                                    </span>
                                                )}
                                            {task.status === "완료" && (
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        padding: "1px 7px",
                                                        borderRadius: 99,
                                                        background: "#f0fdf4",
                                                        color: "#15803d",
                                                        border: "1px solid #bbf7d0",
                                                        fontWeight: 700,
                                                        whiteSpace: "nowrap",
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    완료
                                                </span>
                                            )}
                                            {task.designer?.name ? (
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        padding: "1px 7px",
                                                        borderRadius: 99,
                                                        background: "#eff6ff",
                                                        color: "#1d4ed8",
                                                        border: "1px solid #bfdbfe",
                                                        fontWeight: 600,
                                                        whiteSpace: "nowrap",
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    {task.designer.name}
                                                </span>
                                            ) : (
                                                <span
                                                    style={{
                                                        fontSize: 11,
                                                        color: "#d1d5db",
                                                        whiteSpace: "nowrap",
                                                        flexShrink: 0,
                                                    }}
                                                >
                                                    미배정
                                                </span>
                                            )}
                                            <button
                                                type="button"
                                                onClick={() => openModal(task)}
                                                title="자세히 보기"
                                                style={{
                                                    marginLeft: "auto",
                                                    background: "none",
                                                    border: "none",
                                                    cursor: "pointer",
                                                    color: "#9ca3af",
                                                    padding: "0 2px",
                                                    lineHeight: 1,
                                                    display: "flex",
                                                    alignItems: "center",
                                                }}
                                            >
                                                ↗
                                            </button>
                                        </div>
                                    </td>

                                    {/* 날짜 / 담당 */}
                                    <td
                                        onClick={() => openModal(task)}
                                        style={{
                                            ...styles.td,
                                            width: 90,
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
                            </Fragment>
                        );
                    })}
                </tbody>
            </table>

            {modalTask && (
                <TaskDetailModal
                    task={modalTask}
                    onClose={closeModal}
                    onDeleted={closeModal}
                    designers={designers}
                    canEditDesigner={canEditDesigner}
                    onMutate={onMutate}
                />
            )}
            <FloatingNav from={from} total={total} />
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// 플로팅 네비게이션
// ─────────────────────────────────────────────────────────────

const PAGE_SIZE = 15;

function FloatingNav({ from, total }: { from: number; total: number }) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const page = Math.floor(from / PAGE_SIZE) + 1;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const pageUrl = (p: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", String(p));
        return `${pathname}?${params.toString()}`;
    };

    const btnStyle: React.CSSProperties = {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 32,
        height: 32,
        borderRadius: 8,
        background: "#fff",
        border: "1px solid #e5e7eb",
        color: "#374151",
        fontSize: 15,
        cursor: "pointer",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        textDecoration: "none",
        lineHeight: 1,
    };

    return (
        <div
            style={{
                position: "fixed",
                right: 18,
                top: "50%",
                transform: "translateY(-50%)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 6,
                zIndex: 200,
            }}
        >
            <button
                style={btnStyle}
                title="맨 위로"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            >
                ↑
            </button>
            {totalPages > 1 && page > 1 && (
                <Link
                    href={pageUrl(page - 1)}
                    style={btnStyle}
                    title="이전 페이지"
                >
                    ‹
                </Link>
            )}
            {totalPages > 1 && (
                <span
                    style={{
                        ...btnStyle,
                        cursor: "default",
                        flexDirection: "column",
                        fontSize: 11,
                        lineHeight: 1.3,
                        gap: 0,
                        height: "auto",
                        padding: "4px 0",
                    }}
                >
                    <span style={{ fontWeight: 700 }}>{page}</span>
                    <span style={{ color: "#9ca3af" }}>/{totalPages}</span>
                </span>
            )}
            {totalPages > 1 && page < totalPages && (
                <Link
                    href={pageUrl(page + 1)}
                    style={btnStyle}
                    title="다음 페이지"
                >
                    ›
                </Link>
            )}
            <button
                style={btnStyle}
                title="맨 아래로"
                onClick={() =>
                    window.scrollTo({
                        top: document.body.scrollHeight,
                        behavior: "smooth",
                    })
                }
            >
                ↓
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 스타일 헬퍼
// ─────────────────────────────────────────────────────────────

function applyOrder(
    designers: { id: string; name: string }[],
    order: string[],
): { id: string; name: string }[] {
    if (!order.length) return designers;
    const map = new Map(designers.map((d) => [d.id, d]));
    const result: { id: string; name: string }[] = [];
    order.forEach((id) => {
        const d = map.get(id);
        if (d) result.push(d);
    });
    designers.forEach((d) => {
        if (!order.includes(d.id)) result.push(d);
    });
    return result;
}

function BulkDesignerSelect({
    designers,
    count,
    onAssign,
}: {
    designers: { id: string; name: string }[];
    count: number;
    onAssign: (id: string | null, name: string | null) => void;
}) {
    const [order, setOrder] = useState<string[]>([]);
    const [sorted, setSorted] =
        useState<{ id: string; name: string }[]>(designers);

    useEffect(() => {
        const supabase = createClient();
        supabase
            .from("app_settings")
            .select("value")
            .eq("key", "designer_tab_order")
            .single()
            .then(({ data }) => {
                const o: string[] = Array.isArray(data?.value)
                    ? data.value
                    : [];
                setOrder(o);
            });
    }, []);

    useEffect(() => {
        setSorted(applyOrder(designers, order));
    }, [designers, order]);

    return (
        <select
            defaultValue=""
            onChange={(e) => {
                const val = e.target.value;
                if (!val) return;
                const name =
                    val === "unassigned"
                        ? null
                        : (sorted.find((d) => d.id === val)?.name ?? null);
                const id = val === "unassigned" ? null : val;
                if (
                    confirm(
                        `선택한 ${count}건의 담당 디자이너를 "${name ?? "미배정"}"으로 변경할까요?`,
                    )
                ) {
                    onAssign(id, name);
                }
                e.target.value = "";
            }}
            style={{
                padding: "5px 24px 5px 10px",
                border: "1px solid #d1d5db",
                borderRadius: 6,
                background: "#fff",
                cursor: "pointer",
                outline: "none",
                fontFamily: "inherit",
                appearance: "none",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 6px center",
            }}
        >
            <option value="">담당 일괄변경…</option>
            <option value="unassigned">미배정</option>
            {sorted.map((d) => (
                <option key={d.id} value={d.id}>
                    {d.name}
                </option>
            ))}
        </select>
    );
}

function baseBadge(
    bg: string,
    color: string,
    border: string,
): React.CSSProperties {
    return {
        display: "inline-block",
        fontWeight: 700,
        padding: "2px 6px",
        borderRadius: 5,
        background: bg,
        color,
        border: `1px solid ${border}`,
        fontSize: 12,
    };
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
        padding: "4px 12px",
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
function overlay(zIndex: number): React.CSSProperties {
    return {
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex,
        padding: 16,
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

const styles = {
    headRow: {
        borderTop: "2px solid #111827",
        borderBottom: "1px solid #e5e7eb",
        background: "#f9fafb",
    } as React.CSSProperties,
    th: {
        padding: "10px 12px",
        fontWeight: 700,
        color: "#6b7280",
        whiteSpace: "nowrap",
    } as React.CSSProperties,
    row: {
        borderBottom: "1px solid #e5e7eb",
        verticalAlign: "middle",
    } as React.CSSProperties,
    td: { padding: "8px 8px", verticalAlign: "middle" } as React.CSSProperties,
};

export default memo(BoardTable);
