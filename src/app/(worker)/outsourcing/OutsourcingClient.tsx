// src/app/(worker)/outsourcing/OutsourcingClient.tsx
"use client";

import { useTaskStream } from "@/lib/hooks/useTaskStream";
import { OnlineUsersBar } from "@/lib/presence/OnlinePresence";
import { useOutsourcingMessageStream} from "@/lib/hooks/useOutsourcingMessageStream";
import {Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition} from "react";
import { CardListSkeleton, SkeletonLines, ChatLinesSkeleton } from "@/lib/ui/Skeleton";
import { Feed, type FeedResult } from "@/lib/ui/Feed";
import {useUnreadPolling, NewMessageBanner} from "@/lib/hooks/useUnreadPolling";
import Link from "next/link";
import Image from "next/image";
import { uploadToR2 } from "@/lib/r2/upload";
// import { MESSAGE_KIND_LABEL } from "@/types/database";
import { messageLabel } from "@/types/database";
import {
    attachOutsourcingFiles,
    claimOutsourcingTask,
    deleteOutsourcingFile,
    fetchAvailableOutsourcingTasks,
    fetchDoneOutsourcingTasks,
    fetchMessages,
    fetchMyOutsourcingTasks,
    fetchTaskFiles,
    fetchOpenTaskFileNames,
    fetchIncomingMessageCount,
    postWorkerMessage,
    requestReviewTask,
    signOutAction,
    type Message,
    type OutsourcingTask,
    type TaskFile,
} from "./actions";
import {downloadHref} from "@/lib/tasks/files";
import { withholding33 } from "@/lib/tasks/withholding";
import {
    NotifyBanner,
    NotifyContactModal,
    NotifyHeaderButton,
    useNotifyContact,
} from "./NotifyContact";

// ─────────────────────────────────────────────────────────────
// 상태 라벨
// ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<
    string,
    { label: string; bg: string; color: string; border: string }
> = {
    open: { label: "작업 대기", bg: "#f9fafb", color: "#6b7280", border: "#e5e7eb" },
    claimed: { label: "작업 중", bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
    review: { label: "검수 대기", bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
    // ★v16 사내가 고객에게 최종 확인을 받는 중 (13-8)
    customer_review: { label: "고객 확인 중", bg: "#eef2ff", color: "#4338ca", border: "#c7d2fe" },
    rework: { label: "수정 요청", bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
    done: { label: "완료", bg: "#faf5ff", color: "#a21caf", border: "#e9d5ff" },
};

function orderMethodStyle(method: string): React.CSSProperties {
    const isPrintOnly = method === "인쇄만 의뢰" || method === "재주문(수정없는)";
    const isDesign =
        method === "디자인 복원" || method === "신규 디자인" || method === "디자인 수정";

    return {
        fontSize: 12,
        color: isPrintOnly ? "#1d4ed8" : isDesign ? "#dc2626" : "#374151",
        background: isPrintOnly ? "#eff6ff" : isDesign ? "#fef2f2" : "#f3f4f6",
        border: `1px solid ${isPrintOnly ? "#bfdbfe" : isDesign ? "#fca5a5" : "#e5e7eb"}`,
        padding: "2px 7px",
        borderRadius: 4,
        whiteSpace: "nowrap",
        fontWeight: 600,
    };
}

function InfoRow({
                     label,
                     value,
                     alert,
                 }: {
    label: string;
    value: string;
    alert?: boolean;
}) {
    return (
        <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
            <th
                style={{
                    padding: "7px 10px",
                    fontWeight: 600,
                    color: "#6b7280",
                    background: "#f9fafb",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    width: "30%",
                    verticalAlign: "top",
                    fontSize: 13,
                }}
            >
                {label}
            </th>
            <td
                style={{
                    padding: "7px 10px",
                    color: alert ? "#ef4444" : "#111827",
                    fontWeight: alert ? 700 : 500,
                    verticalAlign: "top",
                    fontSize: 13,
                    whiteSpace: "pre-line",
                }}
            >
                {value}
            </td>
        </tr>
    );
}

function fmtFullDate(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function matchesQuery(task: OutsourcingTask, query: string) {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
        task.customer_name.toLowerCase().includes(q) ||
        task.order_method?.toLowerCase().includes(q)
    );
}

function fmtWon(v: number | null) {
    return v != null ? `${v.toLocaleString("ko-KR")}원` : "단가 미정";
}

function fmtSize(bytes: number | null) {
    if (!bytes) return "";
    return bytes >= 1024 * 1024
        ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
        : `${Math.round(bytes / 1024)}KB`;
}

function fmtShortDate(iso: string) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}

function fmtDateTime(iso: string) {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function badge(bg: string, color: string, border?: string): React.CSSProperties {
    return {
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 99,
        background: bg,
        color,
        border: border ? `1px solid ${border}` : "none",
        fontWeight: 700,
        fontSize: 11,
        whiteSpace: "nowrap",
    };
}

/**
 * 인라인 style 로는 미디어쿼리를 못 쓴다. 헤더 반응형만 여기 두고
 * os- 접두어로 격리한다. ChatWidget 의 cw- 와 같은 방식.
 */
const HEAD_CSS = `
.os-head {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
  padding: 12px 16px; background: #fff; border-bottom: 1px solid #e5e7eb;
}
.os-head-search { order: 3; flex: 1 1 100%; }
.os-head-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.os-body { display: grid; grid-template-columns: 1fr; gap: 16px; padding: 16px 16px 96px; align-items: start; }
@media (min-width: 768px) {
  .os-head {
    display: grid; grid-template-columns: 1fr minmax(0, 28rem) 1fr;
    padding: 14px 24px;
  }
  .os-head-search { order: 0; flex: none; }
  .os-head-right { margin-left: 0; justify-self: end; }
  .os-body { grid-template-columns: 1fr 1fr; gap: 24px; padding: 24px 24px 104px; }
}
`;

// ─────────────────────────────────────────────────────────────
// 작업 풀 카드 (왼쪽)
// ─────────────────────────────────────────────────────────────

function AvailableCard({
                           task,
                           onClaim,
                           pending,
                       }: {
    task: OutsourcingTask;
    onClaim: () => void;
    pending: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [fileNames, setFileNames] = useState<{ name: string; size: number | null }[]>([]);
    const [filesLoaded, setFilesLoaded] = useState(false);

    useEffect(() => {
        if (!open || filesLoaded) return;
        fetchOpenTaskFileNames(task.id)
            .then((f) => {
                setFileNames(f);
                setFilesLoaded(true);
            })
            .catch(() => setFilesLoaded(true));
    }, [open, filesLoaded, task.id]);

    return (
        <div
            style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                overflow: "hidden",
            }}
        >
            <div
                onClick={() => setOpen((p) => !p)}
                style={{
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                }}
            >
                <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, color: "#111827" }}>{task.customer_name}</span>
                        {task.is_priority && <span style={badge("#fef2f2", "#dc2626", "#fecaca")}>우선</span>}
                        {task.special_details && <span style={badge("#fef2f2", "#ef4444", "#fecaca")}>⚠</span>}
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {task.order_method && (
                            <span style={orderMethodStyle(task.order_method)}>{task.order_method}</span>
                        )}
                    </div>
                    <div style={{ marginTop: 6, fontWeight: 800, fontSize: 15, color: "#a21caf" }}>
                        {fmtWon(task.outsourcing_price)}
                    </div>
                </div>
                <span style={{ color: "#9ca3af", flexShrink: 0, fontSize: 13 }}>{open ? "▲" : "▼"}</span>
            </div>

            {open && (
                <div style={{ padding: "0 16px 12px", borderTop: "1px solid #f3f4f6" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 10 }}>
                        <tbody>
                        <InfoRow label="고객이름" value={task.customer_name} />
                        <InfoRow label="주문방법" value={task.order_method ?? "—"} />
                        <InfoRow label="인쇄항목" value={task.print_items} />
                        {/*<InfoRow label="후가공" value={task.post_processing ?? "없음"} />*/}
                        <InfoRow
                            label="처리특이사항"
                            value={task.special_details ?? "없음"}
                            alert={!!task.special_details}
                        />
                        <InfoRow label="등록일자" value={task.created_at ? fmtFullDate(task.created_at) : "—"} />
                        </tbody>
                    </table>

                    <div style={{ marginTop: 10 }}>
                        <p style={{ margin: "0 0 6px", fontWeight: 700, color: "#6b7280", fontSize: 12 }}>
                            첨부파일 {filesLoaded ? `${fileNames.length}개` : "확인 중..."}
                        </p>
                        {filesLoaded && fileNames.length === 0 && (
                            <p style={{ margin: 0, fontSize: 12, color: "#d1d5db" }}>첨부된 파일이 없습니다.</p>
                        )}
                        {fileNames.map((f, i) => (
                            <div
                                key={i}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "4px 10px",
                                    marginBottom: 4,
                                    borderRadius: 6,
                                    background: "#f9fafb",
                                    border: "1px solid #e5e7eb",
                                    fontSize: 13,
                                    color: "#6b7280",
                                }}
                            >
                                <span>📄</span>
                                <span style={{ flex: 1, wordBreak: "break-all" }}>{f.name}</span>
                                {f.size != null && (
                                    <span style={{ fontSize: 12, color: "#9ca3af", flexShrink: 0 }}>
                                        {fmtSize(f.size)}
                                    </span>
                                )}
                            </div>
                        ))}
                        {filesLoaded && fileNames.length > 0 && (
                            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#9ca3af" }}>
                                작업을 가져가면 파일을 내려받을 수 있습니다.
                            </p>
                        )}
                    </div>
                </div>
            )}

            <div style={{ padding: "0 16px 14px" }}>
                <button
                    onClick={onClaim}
                    disabled={pending}
                    style={{
                        width: "100%",
                        padding: "9px",
                        borderRadius: 8,
                        border: "1px solid #111827",
                        background: "#111827",
                        color: "#fff",
                        fontWeight: 700,
                        cursor: pending ? "not-allowed" : "pointer",
                        fontFamily: "inherit",
                        fontSize: 14,
                        opacity: pending ? 0.6 : 1,
                    }}
                >
                    {pending ? "처리 중..." : "작업하기"}
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 스레드 조각
// ─────────────────────────────────────────────────────────────

/**
 * 메시지 한 건. 사내는 왼쪽 정렬 회색/빨강, 외주(나)는 오른쪽 정렬 보라.
 * 계층 구분이 목적이므로 색과 정렬을 둘 다 쓴다.
 */
function MessageBubble({ msg }: { msg: Message }) {
    const isMine = msg.side === "outsourcing";
    const isRework = msg.kind === "rework";

    const tone = isRework
        ? { bg: "#fef2f2", border: "#fecaca", label: "#dc2626", text: "#7f1d1d" }
        : isMine
            ? { bg: "#faf5ff", border: "#e9d5ff", label: "#a21caf", text: "#4a044e" }
            : { bg: "#f9fafb", border: "#e5e7eb", label: "#6b7280", text: "#374151" };

    return (
        <div
            style={{
                display: "flex",
                justifyContent: isMine ? "flex-end" : "flex-start",
                marginBottom: 8,
            }}
        >
            <div
                style={{
                    maxWidth: "85%",
                    padding: "8px 12px",
                    background: tone.bg,
                    border: `1px solid ${tone.border}`,
                    borderRadius: 8,
                }}
            >

                <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: msg.body.trim() ? 4 : 0, flexWrap: "wrap" }}>
                    <span style={{ fontWeight: 800, color: tone.label, fontSize: 12 }}>
                        {messageLabel(msg.kind, msg.side)}
                    </span>
                    <span style={{ fontSize: 11, color: "#9ca3af" }}>
                        {msg.author_name ?? (isMine ? "나" : "담당자")} · {fmtDateTime(msg.created_at)}
                    </span>
                </div>
                {msg.body.trim() && (
                    <p style={{ margin: 0, color: tone.text, fontSize: 13, whiteSpace: "pre-line", wordBreak: "break-word" }}>
                        {msg.body}
                    </p>
                )}
            </div>
        </div>
    );
}

function FileRow({
                     file,
                     onDelete,
                 }: {
    file: TaskFile;
    onDelete?: () => void;
}) {
    const role = file.file_role ?? "source";
    const tone =
        role === "deliverable"
            ? { bg: "#faf5ff", border: "#e9d5ff" }
            : role === "feedback"
                ? { bg: "#fef2f2", border: "#fecaca" }
                : { bg: "#f9fafb", border: "#e5e7eb" };

    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 10px",
                marginBottom: 4,
                borderRadius: 6,
                background: tone.bg,
                border: `1px solid ${tone.border}`,
            }}
        >
            <span style={{ fontSize: 14 }}>📄</span>
            <a
                href={downloadHref(file.id, file.file_url)}
                style={{
                    flex: 1,
                    wordBreak: "break-all",
                    color: "#374151",
                    fontSize: 13,
                    textDecoration: "none",
                    fontWeight: 500,
                }}
            >
                {file.file_name}
            </a>
            {file.uploaded_by_name && (
                <span style={{ color: "#9ca3af", fontSize: 11, flexShrink: 0 }}>
                    {file.uploaded_by_name}
                </span>
            )}
            {file.file_size != null && (
                <span style={{ color: "#9ca3af", fontSize: 12, flexShrink: 0 }}>
                    {fmtSize(file.file_size)}
                </span>
            )}
            {onDelete && (
                <button
                    type="button"
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
                >
                    ✕
                </button>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 나의 작업 카드 (오른쪽)
// ─────────────────────────────────────────────────────────────

function MyTaskCard({
                        task,
                        bump,
                        onDone,
                        onError,
                    }: {
    task: OutsourcingTask;
    bump: number;
    onDone: () => void;
    onError: (msg: string) => void;
}) {

    const os = task.outsourcing_status ?? "claimed";
    const st = STATUS_STYLE[os] ?? STATUS_STYLE.claimed;
    const editable = os === "claimed" || os === "rework";
    const round = task.outsourcing_round;

    const [unread, setUnread] = useState(task.outsourcing_unread_worker);
    const [expanded, setExpanded] = useState(os === "rework" || task.outsourcing_unread_worker);
    const [files, setFiles] = useState<TaskFile[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [reviewBody, setReviewBody] = useState("");
    const [noteBody, setNoteBody] = useState("");
    const threadRef = useRef<HTMLDivElement>(null);   // 진행 내역 스크롤 박스
    const firstScrollDone = useRef(false);
    const stickToBottom = useRef(true);
    const [isPending, startTransition] = useTransition();

    const loadDetail = useCallback(async () => {
        try {
            const [f, m] = await Promise.all([fetchTaskFiles(task.id), fetchMessages(task.id)]);
            setFiles(f);
            setMessages(m);
            setLoaded(true);
            setUnread(false); // 서버에서도 내려감
        } catch (err) {
            onError((err as Error).message);
        }
    }, [task.id, onError]);

    useEffect(() => {
        if (!expanded) return;
        loadDetail();
    }, [
        expanded,
        task.outsourcing_unread_worker,
        task.outsourcing_round,
        task.outsourcing_status,
        bump,
        loadDetail,
    ]);

    // 접혀 있을 때 실시간으로 도착하면 뱃지만 켠다
    useEffect(() => {
        if (bump > 0 && !expanded) setUnread(true);
    }, [bump, expanded]);

    // 진행 내역은 맨 아래(최신)에서 시작한다.
    // 이후 새 메시지·파일이 오면, 아래를 보고 있던 경우에만 따라 내려간다
    useLayoutEffect(() => {
        const el = threadRef.current;
        if (!loaded || !el) return;
        if (!firstScrollDone.current || stickToBottom.current) {
            el.scrollTop = el.scrollHeight;
            firstScrollDone.current = true;
        }
    }, [loaded, messages, files, expanded]);

    const sourceFiles = useMemo(
        () => files.filter((f) => (f.file_role ?? "source") === "source"),
        [files],
    );

    /** 라운드별로 묶는다. 회차가 없는 옛 데이터는 1차로 취급. */
    const rounds = useMemo(() => {
        const set = new Set<number>();
        messages.forEach((m) => set.add(m.round));
        files.forEach((f) => {
            const r = f.file_role;
            if (r === "deliverable" || r === "feedback") set.add(f.outsourcing_round ?? 1);
        });
        return Array.from(set).sort((a, b) => a - b);
    }, [messages, files]);

    const currentDeliverables = useMemo(
        () =>
            files.filter(
                (f) => f.file_role === "deliverable" && (f.outsourcing_round ?? 1) === round,
            ),
        [files, round],
    );

    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(e.target.files ?? []);
        e.target.value = "";
        if (picked.length === 0) return;

        setUploading(true);
        try {
            const uploaded: { url: string; name: string; size: number }[] = [];
            for (const file of picked) {
                const {publicUrl} = await uploadToR2("task-files", file);
                uploaded.push({url: publicUrl, name: file.name, size: file.size});
            }
            await attachOutsourcingFiles(task.id, uploaded);
            setFiles(await fetchTaskFiles(task.id));
        } catch (err) {
            onError((err as Error).message);
        } finally {
            setUploading(false);
        }
    };

    const handleDeleteFile = (fileId: string) => {
        startTransition(async () => {
            try {
                await deleteOutsourcingFile(fileId);
                setFiles((prev) => prev.filter((f) => f.id !== fileId));
            } catch (err) {
                onError((err as Error).message);
            }
        });
    };

    const handleReview = () => {
        // if (!reviewBody.trim()) {
        //     onError("검수 요청 내용을 적어주세요.");
        //     return;
        // }
        if (!confirm(`"${task.customer_name}" 작업의 검수를 요청할까요?\n요청 후에는 이번 회차 파일을 수정할 수 없습니다.`))
            return;

        startTransition(async () => {
            try {
                const res = await requestReviewTask(task.id, reviewBody);
                if (!res.ok) {
                    onError(res.message);
                    onDone();          // 상태가 어긋났을 수 있다. 목록 갱신
                    return;
                }
                setReviewBody("");
                onDone();
            } catch (err) {
                onError((err as Error).message);
            }
        });
    };

    const handleNote = () => {
        if (!noteBody.trim()) return;
        stickToBottom.current = true;   // 내가 보낸 건 항상 보이게
        startTransition(async () => {
            try {
                const res = await postWorkerMessage(task.id, noteBody);
                if (!res.ok) {
                    onError(res.message);
                    return;             // noteBody 를 지우지 않는다
                }
                setNoteBody("");
                setMessages(await fetchMessages(task.id));
            } catch (err) {
                onError((err as Error).message);
            }
        });
    };

    return (
        <div
            style={{
                background: "#fff",
                border: `1px solid ${os === "rework" ? "#fecaca" : unread ? "#bfdbfe" : "#e5e7eb"}`,
                borderRadius: 10,
                overflow: "hidden",
            }}
        >
            {/* 헤더 */}
            <div
                onClick={() => setExpanded((p) => !p)}
                style={{
                    padding: "14px 16px",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 12,
                    cursor: "pointer",
                }}
            >
                <div style={{minWidth: 0, flex: 1}}>
                    <div style={{display: "flex", alignItems: "center", gap: 6, marginBottom: 4, flexWrap: "wrap"}}>
                        <span style={{fontWeight: 700, color: "#111827"}}>{task.customer_name}</span>
                        <span style={badge(st.bg, st.color, st.border)}>{st.label}</span>
                        {round > 1 && <span style={badge("#f3f4f6", "#6b7280", "#e5e7eb")}>{round}차</span>}
                        {unread && <span style={badge("#eff6ff", "#1d4ed8", "#bfdbfe")}>새 메시지</span>}
                        {task.is_priority && <span style={badge("#fef2f2", "#dc2626", "#fecaca")}>우선</span>}
                    </div>
                    {task.order_method && (
                        <div style={{display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap"}}>
                            <span style={orderMethodStyle(task.order_method)}>{task.order_method}</span>
                        </div>
                    )}
                    <div style={{marginTop: 6, fontWeight: 700, fontSize: 14, color: "#6b7280"}}>
                        {fmtWon(task.outsourcing_price)}
                        <span style={{fontSize: 12, color: "#9ca3af", fontWeight: 500}}> (예정)</span>
                    </div>
                </div>
                <span style={{color: "#9ca3af", flexShrink: 0, fontSize: 13}}>{expanded ? "▲" : "▼"}</span>
            </div>

            {expanded && (
                <div style={{padding: "0 16px 16px", borderTop: "1px solid #f3f4f6"}}>
                    {/* 작업 정보 */}
                    <table style={{width: "100%", borderCollapse: "collapse", marginTop: 12}}>
                        <tbody>
                        <InfoRow label="고객이름" value={task.customer_name}/>
                        <InfoRow label="주문방법" value={task.order_method ?? "—"}/>
                        <InfoRow label="인쇄항목" value={task.print_items}/>
                        {/*<InfoRow label="후가공" value={task.post_processing ?? "없음"}/>*/}
                        <InfoRow
                            label="처리특이사항"
                            value={task.special_details ?? "없음"}
                            alert={!!task.special_details}
                        />
                        <InfoRow label="등록일자" value={task.created_at ? fmtFullDate(task.created_at) : "—"}/>
                        </tbody>
                    </table>

                    {!loaded && (
                        <div style={{marginTop: 14}} aria-busy="true">
                            <SkeletonLines lines={2} h={28} gap={4} lastWidth="100%" />
                            <div style={{height: 14}} />
                            <ChatLinesSkeleton count={2} />
                        </div>
                    )}

                    {/* ① 전달받은 자료 — 회차와 무관 */}
                    {loaded && sourceFiles.length > 0 && (
                        <div style={{marginTop: 14}}>
                            <p style={sectionLabel}>전달받은 자료</p>
                            {sourceFiles.map((f) => (
                                <FileRow key={f.id} file={f}/>
                            ))}
                        </div>
                    )}

                    {/* ② 회차별 진행 내역 */}
                    {loaded && rounds.length > 0 && (
                        <div style={{marginTop: 16}}>
                            <p style={sectionLabel}>진행 내역</p>
                            <div
                                ref={threadRef}
                                onScroll={(e) => {
                                    const el = e.currentTarget;
                                    // 맨 아래에서 60px 안쪽이면 "아래를 보는 중"
                                    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                                }}
                                style={{
                                    maxHeight: 340,
                                    overflowY: "auto",
                                    paddingRight: 4,
                                    border: "1px solid #f3f4f6",
                                    borderRadius: 8,
                                    padding: 10,
                                    background: "#fcfcfd",
                                }}
                            >
                                {rounds.map((r) => {
                                    const rMsgs = messages.filter((m) => m.round === r);
                                    const rDeliver = files.filter(
                                        (f) => f.file_role === "deliverable" && (f.outsourcing_round ?? 1) === r,
                                    );
                                    const rFeedback = files.filter(
                                        (f) => f.file_role === "feedback" && (f.outsourcing_round ?? 1) === r,
                                    );
                                    const isCurrent = r === round;

                                    return (
                                        <div
                                            key={r}
                                            style={{
                                                marginBottom: 12,
                                                padding: "10px 12px",
                                                borderRadius: 8,
                                                border: `1px solid ${isCurrent ? "#e5e7eb" : "#f3f4f6"}`,
                                                background: isCurrent ? "#fff" : "#fcfcfd",
                                            }}
                                        >
                                            <div style={{marginBottom: 8}}>
                                                <span style={badge("#f3f4f6", "#374151", "#e5e7eb")}>{r}차</span>
                                            </div>

                                            {rDeliver.length > 0 && (
                                                <div style={{marginBottom: 8}}>
                                                    <p style={{...sectionLabel, fontSize: 11}}>
                                                        제출한 결과물 ({rDeliver.length})
                                                    </p>
                                                    {rDeliver.map((f) => (
                                                        <FileRow
                                                            key={f.id}
                                                            file={f}
                                                            onDelete={
                                                                isCurrent && editable
                                                                    ? () => handleDeleteFile(f.id)
                                                                    : undefined
                                                            }
                                                        />
                                                    ))}
                                                </div>
                                            )}

                                            {rMsgs.map((m) => (
                                                <MessageBubble key={m.id} msg={m}/>
                                            ))}

                                            {rFeedback.length > 0 && (
                                                <div style={{marginTop: 4}}>
                                                    <p style={{...sectionLabel, fontSize: 11, color: "#dc2626"}}>
                                                        수정 참고 파일
                                                    </p>
                                                    {rFeedback.map((f) => (
                                                        <FileRow key={f.id} file={f}/>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* ③ 이번 회차 작업 영역 */}
                    {loaded && editable && (
                        <div
                            style={{
                                marginTop: 8,
                                padding: "12px",
                                borderRadius: 8,
                                border: "1px solid #e9d5ff",
                                background: "#fefcff",
                            }}
                        >
                            <p style={{...sectionLabel, color: "#a21caf"}}>
                                {round}차 제출 {currentDeliverables.length > 0 && `(파일 ${currentDeliverables.length}개)`}
                            </p>

                            <label
                                style={{
                                    position: "relative",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    marginBottom: 10,
                                    padding: "7px 14px",
                                    border: "1px dashed #d1d5db",
                                    borderRadius: 6,
                                    background: "#fff",
                                    cursor: uploading ? "wait" : "pointer",
                                    color: "#6b7280",
                                    fontSize: 13,
                                    userSelect: "none",
                                    width: "fit-content",
                                }}
                            >
                                {uploading ? "올리는 중..." : "+ 결과물 올리기"}
                                <input
                                    type="file"
                                    multiple
                                    disabled={uploading}
                                    onChange={handleUpload}
                                    style={{
                                        position: "absolute",
                                        inset: 0,
                                        opacity: 0,
                                        width: "100%",
                                        height: "100%",
                                        cursor: "pointer",
                                    }}
                                />
                            </label>

                            <textarea
                                value={reviewBody}
                                onChange={(e) => setReviewBody(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key !== "Enter" || e.shiftKey) return;
                                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                                    e.preventDefault();
                                    // 결과물이 없으면 버튼과 같은 이유로 막는다
                                    if (isPending || uploading || currentDeliverables.length === 0) return;
                                    handleReview();
                                }}
                                placeholder={
                                    round > 1
                                        ? "(선택) 어떤 부분을 어떻게 수정했는지 적어주세요."
                                        : "(선택) 작업한 내용, 확인이 필요한 부분이 있다면 적어주세요."
                                }
                                rows={3}
                                style={textareaStyle}
                            />

                            <button
                                onClick={handleReview}
                                disabled={
                                    isPending ||
                                    uploading ||
                                    currentDeliverables.length === 0
                                }
                                style={{
                                    width: "100%",
                                    marginTop: 8,
                                    padding: "10px",
                                    borderRadius: 8,
                                    border: "1px solid",
                                    background:
                                        currentDeliverables.length === 0 ? "#f3f4f6" : "#a21caf",
                                    color:
                                        currentDeliverables.length === 0 ? "#9ca3af" : "#fff",
                                    borderColor:
                                        currentDeliverables.length === 0 ? "#e5e7eb" : "#a21caf",
                                    fontWeight: 800,
                                    cursor:
                                        isPending || uploading || currentDeliverables.length === 0
                                            ? "not-allowed"
                                            : "pointer",
                                    fontFamily: "inherit",
                                    fontSize: 14,
                                }}
                            >
                                {isPending
                                    ? "요청 중..."
                                    : currentDeliverables.length === 0
                                        ? "결과물을 먼저 올려주세요"
                                        : round > 1
                                            ? "수정 완료 / 재검수 요청"
                                            : "검수 요청"}
                            </button>
                        </div>
                    )}

                    {loaded && !editable && (
                        <div
                            style={{
                                marginTop: 8,
                                padding: "10px",
                                borderRadius: 8,
                                background: os === "customer_review" ? "#eef2ff" : "#fffbeb",
                                border: `1px solid ${os === "customer_review" ? "#c7d2fe" : "#fde68a"}`,
                                color: os === "customer_review" ? "#4338ca" : "#b45309",
                                fontWeight: 700,
                                fontSize: 13,
                                textAlign: "center",
                            }}
                        >
                            {os === "customer_review"
                                ? "고객에게 최종 확인을 받고 있습니다"
                                : "검수 결과를 기다리는 중입니다"}
                        </div>
                    )}

                    {/* ④ 문의 — 상태와 무관하게 항상 가능 */}
                    {loaded && (
                        <div style={{marginTop: 12}}>
                            <p style={sectionLabel}>문의하기</p>
                            <textarea
                                value={noteBody}
                                onChange={(e) => setNoteBody(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key !== "Enter" || e.shiftKey) return;
                                    // 한글 조합 중 Enter 는 글자 확정용 — 여기서 보내면 마지막 글자가 두 번 간다
                                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                                    e.preventDefault();
                                    handleNote();
                                }}
                                placeholder="이해가 안 되는 부분이나 확인할 내용을 물어보세요."
                                rows={2}
                                style={textareaStyle}
                            />
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 완료 카드
// ─────────────────────────────────────────────────────────────

/**
 * 완료 카드. 지급이 끝난 건은 회색으로 남긴다.
 *
 * ★ 지급됐다고 목록에서 지우지 않는다. 여기가 작업자에게는
 *   "내가 한 일과 받은 돈"의 유일한 기록이다.
 */
function DoneCard({ task }: { task: OutsourcingTask }) {
    const settled = !!task.outsourcing_settled_at;

    return (
        <div
            style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: 12,
                padding: "10px 14px",
                background: settled ? "#fcfcfd" : "#fff",
                border: `1px solid ${settled ? "#f3f4f6" : "#e9d5ff"}`,
                borderRadius: 8,
            }}
        >
            <div style={{ minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                    <span style={{
                        fontWeight: 600, fontSize: 13,
                        color: settled ? "#9ca3af" : "#374151",
                    }}>
                        {task.customer_name}
                    </span>
                    {settled && (
                        <span style={badge("#f0fdf4", "#15803d", "#bbf7d0")}>
                            {fmtShortDate(task.outsourcing_settled_at!)} 지급 완료
                        </span>
                    )}
                </div>
                {task.order_method && (
                    <div style={{ marginTop: 3, opacity: settled ? 0.5 : 1 }}>
                        <span style={orderMethodStyle(task.order_method)}>{task.order_method}</span>
                    </div>
                )}
            </div>
            {task.outsourcing_price == null ? (
                <span style={{ fontWeight: 800, flexShrink: 0, color: settled ? "#d1d5db" : "#a21caf" }}>
                    {fmtWon(null)}
                </span>
            ) : (
                <div style={{ flexShrink: 0, textAlign: "right", lineHeight: 1.3 }}>
                    <div style={{ fontWeight: 800, color: settled ? "#d1d5db" : "#a21caf" }}>
                        {fmtWon(withholding33(task.outsourcing_price).net)}
                    </div>
                    <div style={{ fontSize: 11, color: settled ? "#e5e7eb" : "#9ca3af" }}>
                        세전 {fmtWon(task.outsourcing_price)}
                    </div>
                </div>
            )}
        </div>
    );
}

/** 지급월 키 ("2026-09"). 미정산은 null → 별도 그룹 */
function settledMonthKey(task: OutsourcingTask): string | null {
    if (!task.outsourcing_settled_at) return null;
    const d = new Date(task.outsourcing_settled_at);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtMonthLabel(key: string) {
    const [y, m] = key.split("-");
    return `${y}년 ${Number(m)}월`;
}

type DoneGroup = {
    key: string;             // "unsettled" | "YYYY-MM"
    label: string;
    tasks: OutsourcingTask[];
    gross: number;
    net: number;
};

/**
 * 완료 목록을 [미정산] + [지급월별] 로 묶는다. 최신 달이 먼저.
 * 금액 계산 규칙은 기존과 동일 — 미정산은 한 번에 공제, 지급된 건은
 * settled_at 이 같은 정산 묶음마다 따로 공제.
 */
function groupDoneTasks(tasks: OutsourcingTask[]): DoneGroup[] {
    const unsettled: OutsourcingTask[] = [];
    const byMonth = new Map<string, OutsourcingTask[]>();

    for (const t of tasks) {
        const key = settledMonthKey(t);
        if (key === null) unsettled.push(t);
        else byMonth.set(key, [...(byMonth.get(key) ?? []), t]);
    }

    const groups: DoneGroup[] = [];

    if (unsettled.length > 0) {
        const gross = unsettled.reduce((s, t) => s + (t.outsourcing_price ?? 0), 0);
        groups.push({ key: "unsettled", label: "미정산", tasks: unsettled, gross, net: withholding33(gross).net });
    }

    const monthKeys = [...byMonth.keys()].sort((a, b) => (a < b ? 1 : -1));
    for (const key of monthKeys) {
        const list = byMonth.get(key)!;
        const batches = new Map<string, number>();
        for (const t of list) {
            batches.set(
                t.outsourcing_settled_at!,
                (batches.get(t.outsourcing_settled_at!) ?? 0) + (t.outsourcing_price ?? 0),
            );
        }
        let gross = 0;
        let net = 0;
        for (const g of batches.values()) {
            gross += g;
            net += withholding33(g).net;
        }
        groups.push({ key, label: fmtMonthLabel(key), tasks: list, gross, net });
    }

    return groups;
}

/** 완료 그룹 (미정산 / 지급월). 헤더를 누르면 접고 펼친다 */
function DoneGroupSection({
                              group,
                              open,
                              onToggle,
                          }: {
    group: DoneGroup;
    open: boolean;
    onToggle: () => void;
}) {
    const isUnsettled = group.key === "unsettled";
    const accent = isUnsettled ? "#a21caf" : "#6b7280";

    return (
        <div>
            <button
                onClick={onToggle}
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    width: "100%",
                    padding: "8px 12px",
                    background: isUnsettled ? "#faf5ff" : "#f9fafb",
                    border: `1px solid ${isUnsettled ? "#e9d5ff" : "#f3f4f6"}`,
                    borderRadius: 8,
                    cursor: "pointer",
                    fontFamily: "inherit",
                }}
            >
                <span style={{ color: accent, fontSize: 11 }}>{open ? "▾" : "▸"}</span>
                <span style={{ fontWeight: 700, fontSize: 13, color: isUnsettled ? "#a21caf" : "#374151" }}>
                    {group.label}
                </span>
                <span style={{ fontSize: 12, color: "#9ca3af" }}>{group.tasks.length}건</span>
                <span style={{ marginLeft: "auto", textAlign: "right", lineHeight: 1.3 }}>
                    <span style={{ display: "block", fontWeight: 700, fontSize: 13, color: accent }}>
                        {isUnsettled ? "예정" : "지급"} {group.net.toLocaleString("ko-KR")}원
                    </span>
                    <span style={{ display: "block", fontSize: 11, color: "#9ca3af" }}>
                        세전 {group.gross.toLocaleString("ko-KR")}원
                    </span>
                </span>
            </button>
            {open && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, paddingLeft: 8 }}>
                    {group.tasks.map((task) => (
                        <DoneCard key={task.id} task={task} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────

export default function OutsourcingClient({
                                              availablePromise,
                                              minePromise,
                                              donePromise,
                                          }: {
    availablePromise: Promise<FeedResult<OutsourcingTask[]>>;
    minePromise: Promise<FeedResult<OutsourcingTask[]>>;
    donePromise: Promise<FeedResult<OutsourcingTask[]>>;
}) {
    // null = 아직 서버에서 안 왔다 → 그 자리에 스켈레톤.
    // 이름을 Raw 로 두고 아래에서 `?? []` 로 풀어서, memo 와 집계 코드는 손대지 않는다
    const [availableRaw, setAvailable] = useState<OutsourcingTask[] | null>(null);
    const [mineRaw, setMine] = useState<OutsourcingTask[] | null>(null);
    const [doneRaw, setDone] = useState<OutsourcingTask[] | null>(null);
    const available = availableRaw ?? [];
    const mine = mineRaw ?? [];
    const done = doneRaw ?? [];

    // 초기값은 "아직 없을 때만" 넣는다. refresh() 가 먼저 끝났으면 낡은 초기값이 덮지 못한다 (v12 6-3 의 틈)
    const feedAvailable = useCallback((v: OutsourcingTask[]) => setAvailable((p) => p ?? v), []);
    const feedMine = useCallback((v: OutsourcingTask[]) => setMine((p) => p ?? v), []);
    const feedDone = useCallback((v: OutsourcingTask[]) => setDone((p) => p ?? v), []);

    const [query, setQuery] = useState("");
    const [claimingId, setClaimingId] = useState<string | null>(null);
    const [showDone, setShowDone] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState("");
    // ★v16 Ch4 카톡 알림 번호 · 동의 (13-7-9)
    const notify = useNotifyContact();

    // Feed 실패 → 배너. 해당 목록은 빈 배열로 확정해서 스켈레톤이 영원히 돌지 않게 한다
    const feedError = useCallback((m: string) => {
        setError(m);
        setAvailable((p) => p ?? []);
        setMine((p) => p ?? []);
        setDone((p) => p ?? []);
    }, []);

    const refresh = async () => {
        const [a, m, d] = await Promise.all([
            fetchAvailableOutsourcingTasks(),
            fetchMyOutsourcingTasks(),
            fetchDoneOutsourcingTasks(),
        ]);
        setAvailable(a);
        setMine(m);
        setDone(d);
    };

    // 작업별 "새 메시지 도착" 신호. 값이 바뀌면 해당 카드가 다시 불러온다.
    const [msgBump, setMsgBump] = useState<Record<string, number>>({});
    const [rtNew, setRtNew] = useState(false);

    // 주기 폴링은 끄고 탭 복귀 확인만 남긴다 (실시간이 끊긴 동안의 구멍 메우기)
    const { hasNew, check, dismiss, suppress } = useUnreadPolling(
        fetchIncomingMessageCount,
        { intervalMs: 0 },
    );

    useOutsourcingMessageStream({
        from: "staff",                    // 사내가 보낸 것만. 내가 보낸 건 안 온다
        onMessage: (m) => {
            setMsgBump((prev) => ({ ...prev, [m.task_id]: (prev[m.task_id] ?? 0) + 1 }));
            if(m.kind === "approve" || m.kind === "rework"){
                startTransition(async () => {
                    await refresh();})
                return;
            }
            setRtNew(true);
        },
        onReconnect: () => { check(); },  // 끊긴 동안 놓친 것 확인
    });

    useTaskStream({
        onChange: () => {
            startTransition(async () => {
                await refresh();
            });
        },
        onReconnect: () => {
            startTransition(async () => {
                await refresh();
            });
        },
    });

    const showBanner = hasNew || rtNew;

    const handleClaim = (taskId: string) => {
        setError("");
        suppress();
        setClaimingId(taskId);
        startTransition(async () => {
            try {
                const res = await claimOutsourcingTask(taskId);
                if (!res.ok) setError(res.message);   // 예상된 거절 → 안내
                await refresh();                       // 성공·실패 모두 목록 정정
            } catch (err) {
                // 여기 오면 진짜 사고. 프로덕션에선 digest 만 남는다
                setError((err as Error).message);
                await refresh();
            } finally {
                setClaimingId(null);
            }
        });
    };

    const handleReviewDone = () => {
        setError("");
        suppress();
        startTransition(async () => {
            await refresh();
        });
    };

    const filteredAvailable = useMemo(
        () => available.filter((t) => matchesQuery(t, query)),
        [available, query],
    );
    const filteredMine = useMemo(() => mine.filter((t) => matchesQuery(t, query)), [mine, query]);
    const filteredDone = useMemo(() => done.filter((t) => matchesQuery(t, query)), [done, query]);

    // 완료 목록 그룹: [미정산] + [지급월별]
    const doneGroups = useMemo(() => groupDoneTasks(filteredDone), [filteredDone]);

    // 사용자가 직접 토글한 그룹만 기록. 기본값은 미정산·최근 지급월만 펼침, 검색 중엔 전부 펼침
    const [groupToggles, setGroupToggles] = useState<Record<string, boolean>>({});
    const latestMonthKey = useMemo(
        () => doneGroups.find((g) => g.key !== "unsettled")?.key ?? null,
        [doneGroups],
    );
    const isGroupOpen = (key: string) => {
        if (query.trim()) return true;
        return groupToggles[key] ?? (key === "unsettled" || key === latestMonthKey);
    };
    const toggleGroup = (key: string) =>
        setGroupToggles((p) => ({ ...p, [key]: !isGroupOpen(key) }));

    const unsettledTotal = useMemo(
        () => done
            .filter((t) => !t.outsourcing_settled_at)
            .reduce((s, t) => s + (t.outsourcing_price ?? 0), 0),
        [done],
    );

    // 미정산은 다음 정산 때 한 번에 지급된다 → 합계에서 한 번 공제
    const unsettledPay = useMemo(() => withholding33(unsettledTotal), [unsettledTotal]);

    const settledTotal = useMemo(
        () => done
            .filter((t) => !!t.outsourcing_settled_at)
            .reduce((s, t) => s + (t.outsourcing_price ?? 0), 0),
        [done],
    );

    // 이미 지급된 건은 정산 묶음마다 따로 공제됐다.
    // settleDesignerTasks 가 한 번에 같은 시각을 찍으므로 settled_at 으로 묶는다
    const settledNet = useMemo(() => {
        const batches = new Map<string, number>();
        for (const t of done) {
            if (!t.outsourcing_settled_at) continue;
            batches.set(
                t.outsourcing_settled_at,
                (batches.get(t.outsourcing_settled_at) ?? 0) + (t.outsourcing_price ?? 0),
            );
        }
        let net = 0;
        for (const gross of batches.values()) net += withholding33(gross).net;
        return net;
    }, [done]);

    const settledCount = done.filter((t) => !!t.outsourcing_settled_at).length;

    const pendingTotal = useMemo(
        () => mine.reduce((s, t) => s + (t.outsourcing_price ?? 0), 0),
        [mine],
    );
    const reworkCount = mine.filter((t) => t.outsourcing_status === "rework").length;
    const unreadCount = mine.filter(
        (t) => t.outsourcing_unread_worker && t.outsourcing_status !== "rework",
    ).length;


    return (
        <div style={{ minHeight: "100vh", background: "#f9fafb" }}>
            <style>{HEAD_CSS}</style>
            <div className="os-head">
                <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
                    <Link href="/outsourcing" style={{ cursor: "pointer", display: "inline-block" }}>
                        <Image
                            src="/logo.png"
                            alt="우리 디자인을 부탁해 로고"
                            width={300}
                            height={40}
                            style={{ objectFit: "contain", width: "auto", height: 36 }}
                            priority
                        />
                    </Link>
                </div>
                <input
                    className="os-head-search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="작업 검색 (고객명, 작업명)"
                    style={{
                        width: "100%",
                        padding: "8px 14px",
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        outline: "none",
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                    }}
                />
                <div className="os-head-right">
                    <NotifyHeaderButton
                        state={notify.state}
                        registered={notify.registered}
                        onClick={() => notify.setOpen(true)}
                    />
                    <OnlineUsersBar />
                    <form action={signOutAction}>
                        <button
                            type="submit"
                            style={{
                                padding: "8px 16px",
                                borderRadius: 8,
                                border: "1px solid #e5e7eb",
                                background: "#f3f4f6",
                                color: "#374151",
                                fontWeight: 700,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            로그아웃
                        </button>
                    </form>
                </div>
            </div>

            {/*{hasNew && (*/}
            {/*    <NewMessageBanner*/}
            {/*        style={{ margin: "16px 24px 0" }}*/}
            {/*        text="사내에서 새 메시지를 보냈습니다."*/}
            {/*        onRefresh={() => {*/}
            {/*            dismiss();*/}
            {/*            startTransition(async () => { await refresh(); });*/}
            {/*        }}*/}
            {/*    />*/}
            {/*)}*/}

            {showBanner ? (
                <NewMessageBanner
                    style={{ margin: "12px 16px 0" }}
                    text="사내에서 새 메시지를 보냈습니다."
                    onRefresh={() => {
                        dismiss();
                        setRtNew(false);
                        startTransition(async () => { await refresh(); });
                    }}/>
            ): (
                <>
                    {reworkCount > 0 && (
                        <div style={bannerStyle("#fef2f2", "#fecaca", "#dc2626")}>
                            수정 요청이 {reworkCount}건 있습니다. 나의 작업에서 요청 내용을 확인해주세요.
                        </div>
                    )}
                    {unreadCount > 0 && (
                        <div style={bannerStyle("#eff6ff", "#bfdbfe", "#1d4ed8")}>
                            확인하지 않은 메시지가 {unreadCount}건 있습니다.
                        </div>
                    )}
                </>
            )}


            {/*{reworkCount > 0 && (*/}
            {/*    <div style={bannerStyle("#fef2f2", "#fecaca", "#dc2626")}>*/}
            {/*        수정 요청이 {reworkCount}건 있습니다. 나의 작업에서 요청 내용을 확인해주세요.*/}
            {/*    </div>*/}
            {/*)}*/}

            {/*{unreadCount > 0 && (*/}
            {/*    <div style={bannerStyle("#eff6ff", "#bfdbfe", "#1d4ed8")}>*/}
            {/*        확인하지 않은 메시지가 {unreadCount}건 있습니다.*/}
            {/*    </div>*/}
            {/*)}*/}

            {notify.showBanner && (
                <NotifyBanner
                    onOpen={() => notify.setOpen(true)}
                    onDismiss={notify.dismissBanner}
                />
            )}

            {error && (
                <div style={bannerStyle("#fef2f2", "#fecaca", "#dc2626")}>⚠ {error}</div>
            )}

            <div className="os-body">
                <div>
                    <div style={sectionHead}>
                        <h2 style={sectionTitle}>등록된 작업목록</h2>
                        <span style={{ fontSize: 13, color: "#9ca3af" }}>
                            {availableRaw === null ? "…" : `${filteredAvailable.length}건`}
                        </span>
                    </div>
                    {availableRaw === null ? (
                        <CardListSkeleton count={3} lines={2} />
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {filteredAvailable.length === 0 && (
                                <EmptyBox text="지금 가져갈 수 있는 작업이 없습니다." />
                            )}
                            {filteredAvailable.map((task) => (
                                <AvailableCard
                                    key={task.id}
                                    task={task}
                                    onClaim={() => handleClaim(task.id)}
                                    pending={isPending && claimingId === task.id}
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <div style={sectionHead}>
                        <h2 style={sectionTitle}>나의 작업</h2>
                        <span style={{ fontSize: 13, color: "#9ca3af" }}>
                            {mineRaw === null ? "…" : `${filteredMine.length}건`}
                        </span>
                        {pendingTotal > 0 && (
                            <span style={{ marginLeft: "auto", fontSize: 13, color: "#6b7280", fontWeight: 700 }}>
                                진행 중 {pendingTotal.toLocaleString("ko-KR")}원
                            </span>
                        )}
                    </div>
                    {mineRaw === null ? (
                        <CardListSkeleton count={2} lines={3} />
                    ) : (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                            {filteredMine.length === 0 && <EmptyBox text="진행 중인 작업이 없습니다." />}
                            {filteredMine.map((task) => (
                                <MyTaskCard
                                    key={`${task.id}-${task.outsourcing_round}-${task.outsourcing_status}`}
                                    task={task}
                                    bump={msgBump[task.id] ?? 0}
                                    onDone={handleReviewDone}
                                    onError={setError}
                                />
                            ))}
                        </div>
                    )}

                    <div style={{ marginTop: 24 }}>
                        <button
                            onClick={() => setShowDone((p) => !p)}
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                width: "100%",
                                padding: "10px 14px",
                                background: "#fff",
                                border: "1px solid #e9d5ff",
                                borderRadius: 8,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            <span style={{ color: "#a21caf", fontSize: 12 }}>{showDone ? "▾" : "▸"}</span>
                            <span style={{ fontWeight: 800, color: "#111827", fontSize: 14 }}>완료</span>
                            <span style={{ fontSize: 13, color: "#9ca3af" }}>
                                {doneRaw === null ? "…" : `${done.length}건`}
                            </span>
                            {unsettledTotal > 0 ? (
                                <span style={{ marginLeft: "auto", textAlign: "right", lineHeight: 1.3 }}>
                                    <span style={{ display: "block", fontWeight: 800, color: "#a21caf" }}>
                                        미정산 {unsettledPay.net.toLocaleString("ko-KR")}원
                                    </span>
                                    <span style={{ display: "block", fontSize: 11, fontWeight: 500, color: "#9ca3af" }}>
                                        세전 {unsettledPay.gross.toLocaleString("ko-KR")}원 · 3.3% {unsettledPay.tax.toLocaleString("ko-KR")}원 공제
                                    </span>
                                </span>
                            ) : (
                                <span style={{ marginLeft: "auto", fontWeight: 800, color: "#a21caf" }}>
                                    미정산 없음
                                </span>
                            )}
                        </button>

                        {showDone && doneRaw === null && (
                            <div style={{ marginTop: 10 }}>
                                <CardListSkeleton count={1} lines={1} />
                            </div>
                        )}
                        {showDone && doneRaw !== null && (
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
                                {filteredDone.length === 0 && <EmptyBox text="완료된 작업이 없습니다." />}
                                {doneGroups.map((g) => (
                                    <DoneGroupSection
                                        key={g.key}
                                        group={g}
                                        open={isGroupOpen(g.key)}
                                        onToggle={() => toggleGroup(g.key)}
                                    />
                                ))}
                                {settledCount > 0 && (
                                    <div style={{
                                        display: "flex", alignItems: "center",
                                        padding: "9px 14px", marginTop: 2,
                                        background: "#f9fafb", border: "1px solid #f3f4f6",
                                        borderRadius: 8, fontSize: 12, color: "#9ca3af",
                                    }}>
                                        <span>지금까지 지급받은 금액 ({settledCount}건)</span>
                                        <span style={{ marginLeft: "auto", textAlign: "right", lineHeight: 1.3 }}>
                                            <span style={{ display: "block", fontWeight: 700, color: "#6b7280" }}>
                                                {settledNet.toLocaleString("ko-KR")}원
                                            </span>
                                            <span style={{ display: "block", fontSize: 11 }}>
                                                세전 {settledTotal.toLocaleString("ko-KR")}원
                                            </span>
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* 급수관 — 화면을 안 그린다. 각 Promise 가 도착하는 대로 위의 상태에 흘러 들어간다.
                Suspense 경계가 셋이 따로인 게 핵심 — 하나로 묶으면 셋 다 올 때까지 아무것도 안 흐른다 */}
            <Suspense fallback={null}>
                <Feed promise={availablePromise} onReady={feedAvailable} onError={feedError} />
            </Suspense>
            <Suspense fallback={null}>
                <Feed promise={minePromise} onReady={feedMine} onError={feedError} />
            </Suspense>
            <Suspense fallback={null}>
                <Feed promise={donePromise} onReady={feedDone} onError={feedError} />
            </Suspense>

            {notify.open && notify.state && (
                <NotifyContactModal
                    state={notify.state}
                    onClose={() => notify.setOpen(false)}
                    onSaved={notify.setState}
                />
            )}
        </div>
    );
}

function EmptyBox({ text }: { text: string }) {
    return (
        <div
            style={{
                textAlign: "center",
                padding: "40px 0",
                color: "#9ca3af",
                border: "1px dashed #e5e7eb",
                borderRadius: 8,
                background: "#fff",
            }}
        >
            {text}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 스타일
// ─────────────────────────────────────────────────────────────

function bannerStyle(bg: string, border: string, color: string): React.CSSProperties {
    return {
        margin: "12px 16px 0",
        padding: "10px 16px",
        background: bg,
        border: `1px solid ${border}`,
        borderRadius: 8,
        color,
        fontWeight: 700,
        fontSize: 13,
    };
}

const ellipsis: React.CSSProperties = {
    margin: 0,
    color: "#6b7280",
    fontSize: 13,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
};

const sectionHead: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
};

const sectionTitle: React.CSSProperties = {
    margin: 0,
    fontWeight: 800,
    fontSize: 16,
    color: "#111827",
};

const sectionLabel: React.CSSProperties = {
    margin: "0 0 6px",
    fontWeight: 700,
    color: "#6b7280",
    fontSize: 12,
};

const textareaStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    fontFamily: "inherit",
    fontSize: 13,
    resize: "vertical",
    outline: "none",
    boxSizing: "border-box",
};