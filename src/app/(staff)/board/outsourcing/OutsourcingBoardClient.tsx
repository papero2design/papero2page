// src/app/(staff)/board/outsourcing/OutsourcingBoardClient.tsx
"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useState, useTransition, useRef } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { TaskWithDesigner, OutsourcingStatus } from "@/types/database";
import {
    messageLabel,
    OUTSOURCING_STATUS_LABEL,
    OUTSOURCING_STATUS_STYLE,
} from "@/types/database";
import { uploadToR2 } from "@/lib/r2/upload";
import { TaskDetailModal } from "../BoardTable";
import { useToast } from "../Toast";
import { useUnreadPolling, NewMessageBanner } from "@/lib/hooks/useUnreadPolling";
import { useOutsourcingAlert } from "@/lib/alerts/OutsourcingAlertProvider";
// import { useOutsourcingMessageStream } from "@/lib/hooks/useOutsourcingMessageStream";
// import { useTaskStream } from "@/lib/hooks/useTaskStream";
import {
    approveOutsourcingTask,
    attachStaffFiles,
    markCustomerReview,
    revertToReview,
    deleteStaffFile,
    fetchMessagesForStaff,
    fetchTaskFilesForStaff,
    postStaffMessage,
    fetchIncomingMessageCountForStaff,
    releaseOutsourcingTask,
    requestReworkTask,
    setPrintReceived,
    settleDesignerTasks,
    updateOutsourcingPrice,
    type Message,
    type StaffTaskFile,
} from "./actions";
import { SkeletonLines, ChatLinesSkeleton } from "@/lib/ui/Skeleton";
import {downloadHref} from "@/lib/tasks/files";

// ─────────────────────────────────────────────────────────────
// 서브탭 정의
// ─────────────────────────────────────────────────────────────

type SubTab = "review" | "customer" | "progress" | "open" | "done";

const SUB_TABS: { key: SubTab; label: string; match: OutsourcingStatus[] }[] = [
    { key: "review", label: "검수요청", match: ["review"] },
    { key: "customer", label: "고객확인", match: ["customer_review"] },   // ★v16 13-8
    { key: "progress", label: "진행중", match: ["claimed", "rework"] },
    { key: "open", label: "작업대기", match: ["open"] },
    { key: "done", label: "완료", match: ["done"] },
];

function fmtDate(iso: string) {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDateTime(iso: string) {
    const d = new Date(iso);
    return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/**
 * 완료(= 승인) 시각을 날짜 한 칸으로 접는다.
 * completed_at 은 timestamptz 이고 new Date() 는 브라우저 로컬로 푼다 —
 * 같은 화면의 fmtDate 와 같은 기준이라 하루가 어긋나지 않는다.
 * 완료일이 비어 있는 건(과거 데이터)은 "unknown" 한 칸에 몰아 맨 아래로 보낸다
 */
function doneDateKey(iso: string | null | undefined): string {
    if (!iso) return "unknown";
    const d = new Date(iso);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fmtDoneDate(key: string): string {
    if (key === "unknown") return "완료일 없음";
    const [y, m, dd] = key.split("-");
    const d = new Date(Number(y), Number(m) - 1, Number(dd));
    return `${y}.${m}.${dd} (${WEEKDAY[d.getDay()]})`;
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

/** 브라우저에서 R2 로 올린 뒤 서버 액션에 넘길 형태로 변환 */
async function uploadAll(picked: File[]) {
    const out: { file_name: string; file_url: string; file_size: number }[] = [];
    for (const file of picked) {
        const { publicUrl } = await uploadToR2("task-files", file);
        out.push({ file_name: file.name, file_url: publicUrl, file_size: file.size });
    }
    return out;
}

// ─────────────────────────────────────────────────────────────
// 공용 조각
// ─────────────────────────────────────────────────────────────

function FileRow({
                     file,
                     onDelete,
                 }: {
    file: StaffTaskFile;
    onDelete?: () => void;
}) {
    const role = file.file_role ?? "source";
    const tone =
        role === "deliverable"
            ? { bg: "#faf5ff", border: "#e9d5ff" }
            : role === "feedback"
                ? { bg: "#fef2f2", border: "#fecaca" }
                : role === "internal"
                    ? { bg: "#eff6ff", border: "#bfdbfe" }
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

/** 외주는 왼쪽 회색/보라, 사내(우리)는 오른쪽. 수정 요청은 빨강. */
function MessageBubble({ msg }: { msg: Message }) {
    const isMine = msg.side === "staff";
    const isRework = msg.kind === "rework";

    const tone = isRework
        ? { bg: "#fef2f2", border: "#fecaca", label: "#dc2626", text: "#7f1d1d" }
        : isMine
            ? { bg: "#f0f9ff", border: "#bae6fd", label: "#0369a1", text: "#0c4a6e" }
            : { bg: "#faf5ff", border: "#e9d5ff", label: "#a21caf", text: "#4a044e" };

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
                        {msg.author_name ?? (isMine ? "담당자" : "외주")} · {fmtDateTime(msg.created_at)}
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

// ─────────────────────────────────────────────────────────────
// 정산 확인 모달 — 무엇에 얼마를 지급하는지 보여주고 누른다
// ─────────────────────────────────────────────────────────────

function SettleModal({
                         designerName,
                         tasks,
                         onConfirm,
                         onCancel,
                         pending,
                     }: {
    designerName: string;
    tasks: TaskWithDesigner[];
    onConfirm: () => void;
    onCancel: () => void;
    pending: boolean;
}) {
    const [checked, setChecked] = useState(false);
    const total = tasks.reduce((s, t) => s + (t.outsourcing_price ?? 0), 0);

    return (
        <div
            style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                zIndex: 2000, padding: 16,
            }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    background: "#fff", borderRadius: 8, padding: 20, width: 480,
                    maxHeight: "80vh", display: "flex", flexDirection: "column",
                    boxShadow: "0 8px 32px rgba(0,0,0,0.2)", fontFamily: "inherit",
                }}
            >
                <p style={{ margin: "0 0 4px", fontWeight: 800, color: "#111827", fontSize: 16 }}>
                    정산 완료 처리
                </p>
                <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 13 }}>
                    {designerName} · 아래 {tasks.length}건이 정산 완료로 기록됩니다.
                </p>

                {/* 무엇에 대해 얼마인지 — 모르고 누르는 버튼이 되면 안 된다 */}
                <div style={{
                    flex: 1, overflowY: "auto", marginBottom: 12,
                    border: "1px solid #e5e7eb", borderRadius: 6,
                }}>
                    {tasks.map((t) => (
                        <div key={t.id} style={{
                            display: "flex", alignItems: "center", gap: 8,
                            padding: "8px 12px", borderBottom: "1px solid #f3f4f6", fontSize: 13,
                        }}>
                            <span style={{ fontWeight: 600, color: "#374151" }}>{t.customer_name}</span>
                            {t.order_method && (
                                <span style={badge("#f3f4f6", "#6b7280", "#e5e7eb")}>{t.order_method}</span>
                            )}
                            <span style={{ marginLeft: "auto", fontWeight: 700, color: "#a21caf" }}>
                                {fmtWon(t.outsourcing_price)}
                            </span>
                        </div>
                    ))}
                </div>

                <div style={{
                    display: "flex", alignItems: "center",
                    padding: "10px 12px", marginBottom: 12,
                    background: "#faf5ff", border: "1px solid #e9d5ff", borderRadius: 6,
                }}>
                    <span style={{ fontWeight: 700, color: "#6b7280", fontSize: 13 }}>지급 합계</span>
                    <span style={{ marginLeft: "auto", fontWeight: 800, color: "#a21caf", fontSize: 17 }}>
                        {total.toLocaleString("ko-KR")}원
                    </span>
                </div>

                {/* 되돌리는 기능이 없으므로 한 번 더 묻는다 */}
                <label style={{
                    display: "flex", alignItems: "center", gap: 8, marginBottom: 14,
                    fontSize: 13, color: "#374151", cursor: "pointer", userSelect: "none",
                }}>
                    <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => setChecked(e.target.checked)}
                        style={{ width: 16, height: 16, cursor: "pointer" }}
                    />
                    <span style={{ fontWeight: 700 }}>입금이 완료되었음을 확인했습니다.</span>
                </label>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={onCancel} style={btn(false)}>취소</button>
                    <button
                        onClick={onConfirm}
                        disabled={!checked || pending || tasks.length === 0}
                        style={{
                            ...btn(true),
                            background: "#a21caf", borderColor: "#a21caf",
                            opacity: !checked || pending ? 0.5 : 1,
                            cursor: !checked || pending ? "not-allowed" : "pointer",
                        }}
                    >
                        {pending ? "처리 중..." : "정산 완료로 기록"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 단가 수정 모달
// ─────────────────────────────────────────────────────────────

function PriceModal({
                        task,
                        onConfirm,
                        onCancel,
                        pending,
                    }: {
    task: TaskWithDesigner;
    onConfirm: (price: number | null) => void;
    onCancel: () => void;
    pending: boolean;
}) {
    const [raw, setRaw] = useState(
        task.outsourcing_price != null ? String(task.outsourcing_price) : "",
    );

    // 빈 값 = 단가 미정(null). 0 원과 구분된다
    const trimmed = raw.trim();
    const parsed = trimmed === "" ? null : Number(trimmed);
    const invalid =
        parsed !== null && (!Number.isInteger(parsed) || parsed < 0);

    const changed = parsed !== (task.outsourcing_price ?? null);

    return (
        <div
            style={{
                position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
                display: "flex", alignItems: "center", justifyContent: "center",
                zIndex: 2000, padding: 16,
            }}
            onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    background: "#fff", borderRadius: 8, padding: 20, width: 380,
                    boxShadow: "0 8px 32px rgba(0,0,0,0.2)", fontFamily: "inherit",
                }}
            >
                <p style={{ margin: "0 0 4px", fontWeight: 800, color: "#111827", fontSize: 16 }}>
                    단가 수정
                </p>
                <p style={{ margin: "0 0 14px", color: "#6b7280", fontSize: 13 }}>
                    {task.customer_name} · 현재 {fmtWon(task.outsourcing_price)}
                </p>

                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <input
                        autoFocus
                        inputMode="numeric"
                        value={raw}
                        onChange={(e) => setRaw(e.target.value.replace(/[^0-9]/g, ""))}
                        onKeyDown={(e) => {
                            if (e.key === "Enter" && !invalid && changed && !pending) {
                                onConfirm(parsed);
                            }
                        }}
                        placeholder="비우면 단가 미정"
                        style={{
                            flex: 1, padding: "9px 11px",
                            border: `1px solid ${invalid ? "#fecaca" : "#d1d5db"}`,
                            borderRadius: 6, outline: "none",
                            fontFamily: "inherit", fontSize: 15, fontWeight: 700,
                            textAlign: "right", boxSizing: "border-box",
                        }}
                    />
                    <span style={{ color: "#6b7280", fontWeight: 700 }}>원</span>
                </div>

                <p style={{ margin: "0 0 14px", fontSize: 12, color: "#9ca3af" }}>
                    {task.designer?.name
                        ? `변경 내용이 ${task.designer.name} 님에게 알림으로 전달됩니다.`
                        : "작업자가 배정되면 이 금액이 표시됩니다."}
                </p>

                <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={onCancel} style={btn(false)}>취소</button>
                    <button
                        onClick={() => onConfirm(parsed)}
                        disabled={invalid || !changed || pending}
                        style={{
                            ...btn(true),
                            background: "#a21caf", borderColor: "#a21caf",
                            opacity: invalid || !changed || pending ? 0.5 : 1,
                            cursor: invalid || !changed || pending ? "not-allowed" : "pointer",
                        }}
                    >
                        {pending ? "저장 중..." : "저장"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 완료 탭 — 작업자별 묶음
// ─────────────────────────────────────────────────────────────

/** 인쇄 접수완료 칩. 눌러서 켜고, 다시 눌러서 끈다 */
function PrintReceiptChip({
                              task,
                              pending,
                              onToggle,
                          }: {
    task: TaskWithDesigner;
    pending: boolean;
    onToggle: (t: TaskWithDesigner, next: boolean) => void;
}) {
    const received = !!task.print_received_at;

    return (
        <button
            type="button"
            disabled={pending}
            title={received ? "누르면 접수완료를 해제합니다" : "인쇄 접수완료로 표시합니다"}
            onClick={(e) => {
                e.stopPropagation();
                onToggle(task, !received);
            }}
            style={{
                ...badge(
                    received ? "#eff6ff" : "#fff",
                    received ? "#1d4ed8" : "#9ca3af",
                    received ? "#bfdbfe" : "#e5e7eb",
                ),
                flexShrink: 0,
                fontFamily: "inherit",
                lineHeight: 1.45,
                cursor: pending ? "not-allowed" : "pointer",
                opacity: pending ? 0.5 : 1,
            }}
        >
            {received ? `인쇄 접수 완료 ${fmtDate(task.print_received_at!)}` : "인쇄 접수 대기"}
        </button>
    );
}

function DesignerSettleCard({
                                name,
                                unsettled,
                                settled,
                                showSettled,
                                pending,
                                onSettle,
                                onOpenTask,
                                onTogglePrint,
                            }: {
    name: string;
    unsettled: TaskWithDesigner[];
    settled: TaskWithDesigner[];
    showSettled: boolean;
    pending: boolean;
    onSettle: () => void;
    onOpenTask: (t: TaskWithDesigner) => void;
    onTogglePrint: (t: TaskWithDesigner, next: boolean) => void;
}) {
    const [open, setOpen] = useState(false);
    /** 날짜 묶음은 기본이 펼침. 닫은 것만 기억한다 */
    const [closedDates, setClosedDates] = useState<Set<string>>(new Set());
    const unsettledTotal = unsettled.reduce((s, t) => s + (t.outsourcing_price ?? 0), 0);
    const settledTotal = settled.reduce((s, t) => s + (t.outsourcing_price ?? 0), 0);

    /**
     * 작업자 → 완료날짜 → 작업. 최근 날짜가 위.
     * 정렬은 여기서 한다 — 서버 쿼리는 created_at 순이고 다른 탭이 그걸 쓴다
     */
    const byDate = useMemo(() => {
        const src = showSettled ? [...unsettled, ...settled] : unsettled;
        const m = new Map<string, TaskWithDesigner[]>();
        for (const t of src) {
            const k = doneDateKey(t.completed_at);
            if (!m.has(k)) m.set(k, []);
            m.get(k)!.push(t);
        }
        return Array.from(m.entries())
            .sort(([a], [b]) => {
                if (a === "unknown") return 1;
                if (b === "unknown") return -1;
                return a < b ? 1 : -1;
            })
            .map(([key, tasks]) => ({
                key,
                tasks: [...tasks].sort((x, y) =>
                    (y.completed_at ?? "").localeCompare(x.completed_at ?? ""),
                ),
                total: tasks.reduce((s, t) => s + (t.outsourcing_price ?? 0), 0),
                printPending: tasks.filter((t) => !t.print_received_at).length,
            }));
    }, [unsettled, settled, showSettled]);

    const shownCount = byDate.reduce((s, g) => s + g.tasks.length, 0);
    const printPending = byDate.reduce((s, g) => s + g.printPending, 0);

    return (
        <div style={{
            border: "1px solid #e5e7eb", borderRadius: 8,
            marginBottom: 10, overflow: "hidden", background: "#fff",
        }}>
            <div style={{
                display: "flex", alignItems: "center", gap: 10,
                padding: "12px 14px", cursor: "pointer",
            }} onClick={() => setOpen((p) => !p)}>
                <span style={{ color: "#9ca3af", fontSize: 12 }}>{open ? "▾" : "▸"}</span>
                <span style={{ fontWeight: 800, color: "#111827", fontSize: 15 }}>{name}</span>

                {unsettled.length > 0 ? (
                    <span style={badge("#fffbeb", "#b45309", "#fde68a")}>
                        미정산 {unsettled.length}건
                    </span>
                ) : (
                    <span style={badge("#f0fdf4", "#15803d", "#bbf7d0")}>정산 완료</span>
                )}

                {printPending > 0 && (
                    <span style={badge("#f9fafb", "#6b7280", "#e5e7eb")}>
                        인쇄 미접수 {printPending}건
                    </span>
                )}

                {settled.length > 0 && (
                    <span style={{ fontSize: 12, color: "#9ca3af" }}>
                        지급 완료 {settled.length}건 · {settledTotal.toLocaleString("ko-KR")}원
                    </span>
                )}

                <span style={{
                    marginLeft: "auto", fontWeight: 800, fontSize: 16,
                    color: unsettled.length > 0 ? "#a21caf" : "#d1d5db",
                }}>
                    {unsettledTotal.toLocaleString("ko-KR")}원
                </span>

                {unsettled.length > 0 && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onSettle(); }}
                        style={{
                            padding: "6px 14px", borderRadius: 6,
                            border: "1px solid #a21caf", background: "#a21caf", color: "#fff",
                            fontWeight: 700, fontSize: 13, cursor: "pointer",
                            fontFamily: "inherit", whiteSpace: "nowrap",
                        }}
                    >
                        정산 완료
                    </button>
                )}
            </div>

            {open && (
                <div style={{ borderTop: "1px solid #f3f4f6" }}>
                    {shownCount === 0 && (
                        <p style={{ margin: 0, padding: "16px 14px", fontSize: 13, color: "#9ca3af" }}>
                            표시할 작업이 없습니다.
                        </p>
                    )}

                    {byDate.map((g) => {
                        const dateOpen = !closedDates.has(g.key);
                        return (
                            <div key={g.key}>
                                {/* 날짜 머리 — 작업자 아래 두 번째 층 */}
                                <div
                                    onClick={() =>
                                        setClosedDates((prev) => {
                                            const next = new Set(prev);
                                            if (next.has(g.key)) next.delete(g.key);
                                            else next.add(g.key);
                                            return next;
                                        })
                                    }
                                    style={{
                                        display: "flex", alignItems: "center", gap: 8,
                                        padding: "7px 14px 7px 30px",
                                        background: "#fafafa",
                                        borderBottom: "1px solid #f3f4f6",
                                        cursor: "pointer", userSelect: "none",
                                    }}
                                >
                                    <span style={{ color: "#9ca3af", fontSize: 11 }}>
                                        {dateOpen ? "▾" : "▸"}
                                    </span>
                                    <span style={{ fontWeight: 700, fontSize: 13, color: "#374151" }}>
                                        {fmtDoneDate(g.key)}
                                    </span>
                                    <span style={{ fontSize: 12, color: "#9ca3af" }}>
                                        {g.tasks.length}건
                                    </span>
                                    {g.printPending > 0 && (
                                        <span style={{ fontSize: 12, color: "#9ca3af" }}>
                                            · 인쇄 미접수 {g.printPending}
                                        </span>
                                    )}
                                    <span style={{
                                        marginLeft: "auto", fontWeight: 700,
                                        fontSize: 13, color: "#6b7280",
                                    }}>
                                        {g.total.toLocaleString("ko-KR")}원
                                    </span>
                                </div>

                                {dateOpen && g.tasks.map((t) => {
                                    const isSettled = !!t.outsourcing_settled_at;
                                    return (
                                        <div key={t.id} style={{
                                            display: "flex", alignItems: "center", gap: 8,
                                            padding: "9px 14px 9px 48px",
                                            borderBottom: "1px solid #f9fafb", fontSize: 13,
                                            background: isSettled ? "#fcfcfd" : "#fff",
                                        }}>
                                            <span
                                                onClick={() => onOpenTask(t)}
                                                style={{
                                                    fontWeight: 600,
                                                    color: isSettled ? "#9ca3af" : "#374151",
                                                    cursor: "pointer",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {t.customer_name}
                                            </span>
                                            {t.order_method && (
                                                <span style={badge("#f3f4f6", "#9ca3af", "#e5e7eb")}>{t.order_method}</span>
                                            )}
                                            {t.print_items && (
                                                <span
                                                    title={t.print_items}
                                                    onClick={() => onOpenTask(t)}
                                                    style={{
                                                        color: "#9ca3af", cursor: "pointer",
                                                        minWidth: 0, overflow: "hidden",
                                                        textOverflow: "ellipsis", whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    {t.print_items}
                                                </span>
                                            )}
                                            <PrintReceiptChip
                                                task={t}
                                                pending={pending}
                                                onToggle={onTogglePrint}
                                            />
                                            {isSettled && (
                                                <span style={badge("#f0fdf4", "#15803d", "#bbf7d0")}>
                                                    {fmtDate(t.outsourcing_settled_at!)} 지급
                                                </span>
                                            )}
                                            <span style={{
                                                marginLeft: "auto", fontWeight: 700, flexShrink: 0,
                                                color: isSettled ? "#d1d5db" : "#a21caf",
                                            }}>
                                                {fmtWon(t.outsourcing_price)}
                                            </span>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 검수 패널 — 스레드 + 파일 계층 + 사내 결과물
// ─────────────────────────────────────────────────────────────

function ReviewPanel({
                         task,
                         bump,
                         onClose,
                         onApprove,
                         onRework,
                         onCustomerReview,
                         onRevertReview,
                         onError,
                         onToast,
                     }: {
    task: TaskWithDesigner;
    /** 실시간으로 이 작업에 메시지가 도착하면 값이 올라간다 → 스레드 다시 로드 */
    bump: number;
    onClose: () => void;
    onApprove: () => void;
    onRework: () => void;
    /** ★v16 검수요청 → 고객 확인중 */
    onCustomerReview: () => void;
    /** ★v16 고객 확인중 → 검수요청 (잘못 눌렀을 때) */
    onRevertReview: () => void;
    onError: (msg: string) => void;
    onToast: (msg: string) => void;
}) {
    const os = task.outsourcing_status as OutsourcingStatus;
    const round = task.outsourcing_round;

    const [files, setFiles] = useState<StaffTaskFile[]>([]);
    const [messages, setMessages] = useState<Message[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [note, setNote] = useState("");
    const [uploading, setUploading] = useState(false);
    const [dragging, setDragging] = useState(false);
    const dragDepth = useRef(0);   // 자식 요소를 지날 때마다 dragleave 가 튀는 것 방지
    const bodyRef = useRef<HTMLDivElement>(null);   // 스크롤되는 본문
    const firstScrollDone = useRef(false);
    const stickToBottom = useRef(true);
    const [isPending, startTransition] = useTransition();
    const onErrorRef = useRef(onError);
    onErrorRef.current = onError;

    const reload = useCallback(async () => {
        try {
            const [f, m] = await Promise.all([
                fetchTaskFilesForStaff(task.id),
                fetchMessagesForStaff(task.id),
            ]);
            setFiles(f);
            setMessages(m);
            setLoaded(true);
        } catch (err) {
            onErrorRef.current((err as Error).message);
            setLoaded(true);
        }
    }, [task.id]);

    useEffect(() => {
        reload();
    }, [reload, bump]);

    // 열 때는 맨 아래(최신)에서 시작한다.
    // 이후 새 메시지·파일이 오면, 아래를 보고 있던 경우에만 따라 내려간다 (위로 올려 읽는 중이면 그대로)
    useLayoutEffect(() => {
        const el = bodyRef.current;
        if (!loaded || !el) return;
        if (!firstScrollDone.current || stickToBottom.current) {
            el.scrollTop = el.scrollHeight;
            firstScrollDone.current = true;
        }
    }, [loaded, messages, files]);

    const sourceFiles = useMemo(
        () => files.filter((f) => (f.file_role ?? "source") === "source"),
        [files],
    );
    const internalFiles = useMemo(
        () => files.filter((f) => f.file_role === "internal"),
        [files],
    );

    /** 회차 목록. 회차가 없는 옛 데이터는 1차로 취급. */
    const rounds = useMemo(() => {
        const set = new Set<number>();
        messages.forEach((m) => set.add(m.round));
        files.forEach((f) => {
            if (f.file_role === "deliverable" || f.file_role === "feedback")
                set.add(f.outsourcing_round ?? 1);
        });
        return Array.from(set).sort((a, b) => a - b);
    }, [messages, files]);

    const handleInternalUpload = async (picked: File[]) => {
        stickToBottom.current = true;
        setUploading(true);
        try {
            await attachStaffFiles(task.id, await uploadAll(picked), "internal");
            await reload();
        } catch (err) {
            onError((err as Error).message);
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = (fileId: string) => {
        startTransition(async () => {
            try {
                await deleteStaffFile(fileId);
                setFiles((prev) => prev.filter((f) => f.id !== fileId));
            } catch (err) {
                onError((err as Error).message);
            }
        });
    };

    /** 채팅 입력이 열려 있는 상태에서만 파일을 받는다 */
    const canChat = os !== "done" && os !== "open";

    const dragHandlers = {
        onDragEnter: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            dragDepth.current += 1;
            if (canChat) setDragging(true);
        },
        onDragOver: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();   // 안 막으면 브라우저가 파일을 새 탭으로 연다
            e.dataTransfer.dropEffect = canChat ? "copy" : "none";
        },
        onDragLeave: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
        },
        onDrop: (e: React.DragEvent) => {
            if (!e.dataTransfer.types.includes("Files")) return;
            e.preventDefault();
            dragDepth.current = 0;
            setDragging(false);
            if (!canChat || uploading) return;
            handleAttach(Array.from(e.dataTransfer.files));
        },
    };

    const handleNote = () => {
        if (!note.trim() || isPending) return;
        stickToBottom.current = true;   // 내가 보낸 건 항상 보이게
        startTransition(async () => {
            try {
                await postStaffMessage(task.id, note);
                setNote("");
                await reload();
                onToast("답변을 보냈습니다.");
            } catch (err) {
                onError((err as Error).message);
            }
        });
    };

    /** 파일 전달 — 이번 회차의 참고 파일(feedback)로 올린다. 외주 화면에도 같은 회차에 보인다 */
    const handleAttach = async (picked: File[]) => {
        if (picked.length === 0) return;
        setUploading(true);
        try {
            await attachStaffFiles(task.id, await uploadAll(picked), "feedback");
            await reload();
            onToast(`파일 ${picked.length}개를 보냈습니다.`);
        } catch (err) {
            onError((err as Error).message);
        } finally {
            setUploading(false);
        }
    };

    // body 직속으로 뺀다. 접속 바(OnlinePresence)가 레이아웃에서
    // position:relative + zIndex 로 스태킹 컨텍스트를 만들어, 이 안에
    // 두면 zIndex 를 아무리 올려도 그 위로 못 간다
    return createPortal(
        <div
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.5)",
                display: "flex",
                justifyContent: "flex-end",
                zIndex: 1950,
            }}
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
        >
            <div
                onMouseDown={(e) => e.stopPropagation()}
                {...dragHandlers}
                style={{
                    width: 520,
                    maxWidth: "100%",
                    height: "100%",
                    background: "#fff",
                    display: "flex",
                    flexDirection: "column",
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
                        gap: 8,
                        flexWrap: "wrap",
                    }}
                >
                    <span style={{ fontWeight: 800, fontSize: 15, color: "#111827" }}>
                        {task.customer_name}
                    </span>
                    <span style={badge(
                        OUTSOURCING_STATUS_STYLE[os].bg,
                        OUTSOURCING_STATUS_STYLE[os].color,
                        OUTSOURCING_STATUS_STYLE[os].border,
                    )}>
                        {OUTSOURCING_STATUS_LABEL[os]}
                    </span>
                    {round > 1 && <span style={badge("#f3f4f6", "#6b7280", "#e5e7eb")}>{round}차</span>}
                    {task.designer?.name && (
                        <span style={badge("#fdf4ff", "#a21caf", "#f5d0fe")}>{task.designer.name}</span>
                    )}
                    {/* ★v16 검수요청 → 고객 확인만 · 고객 확인중 → 수정 요청만. 고객을 반드시 거친다 (13-8) */}
                    {os === "review" && (
                        <button
                            type="button"
                            onClick={onCustomerReview}
                            style={{
                                marginLeft: "auto",
                                padding: "5px 12px",
                                borderRadius: 6,
                                border: "1px solid #c7d2fe",
                                background: "#eef2ff",
                                color: "#4338ca",
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                whiteSpace: "nowrap",
                            }}
                        >
                            고객 확인
                        </button>
                    )}
                    {os === "customer_review" && (
                        <button
                            type="button"
                            onClick={onRework}
                            style={{
                                marginLeft: "auto",
                                padding: "5px 12px",
                                borderRadius: 6,
                                border: "1px solid #fecaca",
                                background: "#fff",
                                color: "#dc2626",
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                whiteSpace: "nowrap",
                            }}
                        >
                            수정 요청
                        </button>
                    )}
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            marginLeft: os === "review" || os === "customer_review" ? 4 : "auto",
                            background: "none",
                            border: "none",
                            fontSize: 20,
                            color: "#9ca3af",
                            cursor: "pointer",
                            lineHeight: 1,
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* 본문 */}
                <div
                    ref={bodyRef}
                    onScroll={(e) => {
                        const el = e.currentTarget;
                        // 맨 아래에서 80px 안쪽이면 "아래를 보는 중"
                        stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
                    }}
                    style={{ flex: 1, overflowY: "auto", padding: "16px 18px" }}
                >
                    {!loaded && (
                        <div aria-busy="true">
                            <SkeletonLines lines={3} h={28} gap={4} lastWidth="100%" />
                            <div style={{ height: 18 }} />
                            <ChatLinesSkeleton count={3} />
                        </div>
                    )}

                    {/* ① 전달 자료 */}
                    {loaded && sourceFiles.length > 0 && (
                        <div style={{ marginBottom: 18 }}>
                            <p style={sectionLabel}>전달 자료</p>
                            {sourceFiles.map((f) => (
                                <FileRow key={f.id} file={f} onDelete={() => handleDelete(f.id)} />
                            ))}
                        </div>
                    )}

                    {/* ② 회차별 진행 내역 */}
                    {loaded && rounds.length === 0 && (
                        <p style={{ margin: "0 0 18px", fontSize: 13, color: "#9ca3af" }}>
                            아직 주고받은 내역이 없습니다.
                        </p>
                    )}
                    {loaded &&
                        rounds.map((r) => {
                            const rMsgs = messages.filter((m) => m.round === r);
                            const rDeliver = files.filter(
                                (f) => f.file_role === "deliverable" && (f.outsourcing_round ?? 1) === r,
                            );
                            const rFeedback = files.filter(
                                (f) => f.file_role === "feedback" && (f.outsourcing_round ?? 1) === r,
                            );

                            return (
                                <div
                                    key={r}
                                    style={{
                                        marginBottom: 12,
                                        padding: "10px 12px",
                                        borderRadius: 8,
                                        border: `1px solid ${r === round ? "#e5e7eb" : "#f3f4f6"}`,
                                        background: r === round ? "#fff" : "#fcfcfd",
                                    }}
                                >
                                    <div style={{ marginBottom: 8 }}>
                                        <span style={badge("#f3f4f6", "#374151", "#e5e7eb")}>{r}차</span>
                                    </div>

                                    {rDeliver.length > 0 && (
                                        <div style={{ marginBottom: 8 }}>
                                            <p style={{ ...sectionLabel, fontSize: 11, color: "#a21caf" }}>
                                                외주 결과물 ({rDeliver.length})
                                            </p>
                                            {rDeliver.map((f) => (
                                                <FileRow key={f.id} file={f} />
                                            ))}
                                        </div>
                                    )}

                                    {rMsgs.map((m) => (
                                        <MessageBubble key={m.id} msg={m} />
                                    ))}

                                    {rFeedback.length > 0 && (
                                        <div style={{ marginTop: 4 }}>
                                            <p style={{ ...sectionLabel, fontSize: 11, color: "#dc2626" }}>
                                                참고 파일
                                            </p>
                                            {rFeedback.map((f) => (
                                                <FileRow
                                                    key={f.id}
                                                    file={f}
                                                    onDelete={() => handleDelete(f.id)}
                                                />
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                    {/* ③ 사내 작업물 — 외주 결과물과 분리된 계층 */}
                    {/*{loaded && (*/}
                    {/*    <div*/}
                    {/*        style={{*/}
                    {/*            marginTop: 18,*/}
                    {/*            padding: "12px",*/}
                    {/*            borderRadius: 8,*/}
                    {/*            border: "1px solid #bfdbfe",*/}
                    {/*            background: "#f8fbff",*/}
                    {/*        }}*/}
                    {/*    >*/}
                    {/*        <p style={{ ...sectionLabel, color: "#1d4ed8" }}>*/}
                    {/*            사내 작업물 {internalFiles.length > 0 && `(${internalFiles.length})`}*/}
                    {/*        </p>*/}
                    {/*        <p style={{ margin: "0 0 8px", fontSize: 11, color: "#9ca3af" }}>*/}
                    {/*            디자이너·CS가 직접 작업한 파일입니다. 외주 작업자에게는 보이지 않습니다.*/}
                    {/*        </p>*/}
                    {/*        {internalFiles.map((f) => (*/}
                    {/*            <FileRow key={f.id} file={f} onDelete={() => handleDelete(f.id)} />*/}
                    {/*        ))}*/}
                    {/*        <UploadButton*/}
                    {/*            label="+ 사내 작업물 올리기"*/}
                    {/*            uploading={uploading}*/}
                    {/*            onPick={handleInternalUpload}*/}
                    {/*        />*/}
                    {/*    </div>*/}
                    {/*)}*/}
                </div>

                {/* 하단 액션 */}
                {loaded && (
                    <div style={{ borderTop: "1px solid #e5e7eb", padding: "12px 18px" }}>
                        {canChat && (
                            <textarea
                                value={note}
                                onChange={(e) => setNote(e.target.value)}
                                onKeyDown={(e) => {
                                    if (e.key !== "Enter" || e.shiftKey) return;
                                    // 한글 조합 중 Enter 는 글자 확정용 — 여기서 보내면 마지막 글자가 두 번 간다
                                    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
                                    e.preventDefault();
                                    handleNote();
                                }}
                                onPaste={(e) => {
                                    const files = Array.from(e.clipboardData.files);
                                    if (files.length === 0) return;   // 글자 붙여넣기는 그대로
                                    e.preventDefault();
                                    handleAttach(files);
                                }}
                                placeholder={uploading ? "파일 올리는 중..." : "메시지 입력"}
                                rows={2}
                                disabled={uploading}
                                style={{
                                    width: "100%",
                                    padding: "8px 10px",
                                    border: `1px ${dragging ? "dashed #a21caf" : "solid #d1d5db"}`,
                                    background: dragging ? "#faf5ff" : "#fff",
                                    borderRadius: 6,
                                    outline: "none",
                                    resize: "vertical",
                                    fontFamily: "inherit",
                                    fontSize: 13,
                                    boxSizing: "border-box",
                                }}
                            />
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}

// ─────────────────────────────────────────────────────────────
// 메인
// ─────────────────────────────────────────────────────────────

export default function OutsourcingBoardClient({
                                                   initialTasks,
                                                   designers,
                                                   canEditDesigner,
                                               }: {
    initialTasks: TaskWithDesigner[];
    designers: { id: string; name: string }[];
    canEditDesigner: boolean;
}) {
    const router = useRouter();
    const [tab, setTab] = useState<SubTab>("review");
    const [modalTask, setModalTask] = useState<TaskWithDesigner | null>(null);
    // ★v16 id 로 들고 목록에서 찾는다. 고객 확인 · 되돌리기 후 refresh 되면 열린 패널의 뱃지·버튼도 따라 바뀐다
    const [panelTaskId, setPanelTaskId] = useState<string | null>(null);
    const panelTask = useMemo(
        () => (panelTaskId ? initialTasks.find((t) => t.id === panelTaskId) ?? null : null),
        [panelTaskId, initialTasks],
    );
    const [isPending, startTransition] = useTransition();
    const { showToast, ToastUI } = useToast();

    /** 열려 있는 패널에 실시간 메시지가 오면 올린다 → ReviewPanel 이 다시 로드 */
    const [msgBump, setMsgBump] = useState(0);
    /** 실시간으로 감지한 새 메시지 (닫혀 있는 작업) */
    const [rtNew, setRtNew] = useState(false);

    // 주기 폴링은 끄고 탭 복귀 확인만 남긴다.
    // 실시간이 끊긴 동안 놓친 것을 메꾸는 안전망 역할.
    const { hasNew, check, dismiss, suppress } = useUnreadPolling(
        fetchIncomingMessageCountForStaff,
        { intervalMs: 0 },
    );

    const refresh = () => router.refresh();

    // onMessage 는 훅 내부에서 ref 에 담기므로, panelTask 도 ref 로 읽어야
    // 항상 최신 값을 본다 (state 를 직접 읽으면 낡은 값을 붙잡을 수 있음)
    const panelTaskRef = useRef<TaskWithDesigner | null>(null);
    panelTaskRef.current = panelTask;

    const { last, bump: alertBump, reconnectBump } = useOutsourcingAlert();

    // Provider 는 레이아웃에 있어 이 화면보다 오래 산다.
    // 마운트 시점의 bump 를 기준선으로 잡지 않으면, 다른 페이지에 있는 동안
    // 쌓인 옛 메시지에 effect 가 반응해 들어올 때마다 배너가 뜬다
    const seenBumpRef = useRef(alertBump);

    useEffect(() => {
        if (alertBump === seenBumpRef.current) return;
        seenBumpRef.current = alertBump;
        if (!last) return;

        const open = panelTaskRef.current;
        if (open && last.task_id === open.id) {
            setMsgBump((n) => n + 1);   // 열려 있는 패널이면 그것만 다시 불러온다
            return;
        }
        setRtNew(true);                 // 아니면 배너
    }, [alertBump, last]);

    const seenReconnectRef = useRef(reconnectBump);

    useEffect(() => {
        if (reconnectBump === seenReconnectRef.current) return;
        seenReconnectRef.current = reconnectBump;
        check();                        // 끊긴 동안 놓친 것 확인
    }, [reconnectBump, check]);

    const showBanner = hasNew || rtNew;

    const byTab = useMemo(() => {
        const m = new Map<SubTab, TaskWithDesigner[]>();
        SUB_TABS.forEach((t) => {
            m.set(
                t.key,
                initialTasks.filter((task) =>
                    t.match.includes(task.outsourcing_status as OutsourcingStatus),
                ),
            );
        });
        return m;
    }, [initialTasks]);

    const rows = byTab.get(tab) ?? [];

    // 완료 탭 — 정산
    const [showSettled, setShowSettled] = useState(false);
    const [settleTarget, setSettleTarget] = useState<{
        designerId: string; name: string; tasks: TaskWithDesigner[];
    } | null>(null);

    // 단가 수정
    const [priceTarget, setPriceTarget] = useState<TaskWithDesigner | null>(null);

    const handlePrice = (price: number | null) => {
        const task = priceTarget;
        if (!task) return;
        startTransition(async () => {
            try {
                const res = await updateOutsourcingPrice(task.id, price);
                if (!res.ok) { showToast(res.message); return; }
                setPriceTarget(null);
                showToast(
                    price == null
                        ? "단가를 미정으로 바꿨습니다."
                        : `단가를 ${price.toLocaleString("ko-KR")}원으로 수정했습니다.`,
                    "success",
                );
                refresh();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    /** 작업자별로 묶고 미정산/정산완료로 가른다 */
    const doneByDesigner = useMemo(() => {
        const m = new Map<string, {
            designerId: string; name: string;
            unsettled: TaskWithDesigner[]; settled: TaskWithDesigner[];
        }>();

        for (const t of byTab.get("done") ?? []) {
            // 배정이 풀린 채 완료된 건은 묶을 대상이 없다
            const id = t.designer?.id;
            if (!id) continue;

            if (!m.has(id)) {
                m.set(id, {
                    designerId: id,
                    name: t.designer?.name ?? "(이름 없음)",
                    unsettled: [], settled: [],
                });
            }
            const g = m.get(id)!;
            if (t.outsourcing_settled_at) g.settled.push(t);
            else g.unsettled.push(t);
        }

        // 미정산이 남은 사람 먼저, 그다음 금액 큰 순
        return Array.from(m.values()).sort((a, b) => {
            if ((a.unsettled.length > 0) !== (b.unsettled.length > 0)) {
                return a.unsettled.length > 0 ? -1 : 1;
            }
            const sum = (xs: TaskWithDesigner[]) =>
                xs.reduce((s, t) => s + (t.outsourcing_price ?? 0), 0);
            return sum(b.unsettled) - sum(a.unsettled);
        });
    }, [byTab]);

    /** 완료됐지만 인쇄 접수가 안 된 건. 정산과는 무관하다 */
    const printPendingTotal = useMemo(
        () => (byTab.get("done") ?? []).filter((t) => !t.print_received_at).length,
        [byTab],
    );

    /** 전체 미정산 합계. "확정 합계"가 아니라 "아직 줄 돈"이다 */
    const unsettledTotal = useMemo(
        () => doneByDesigner.reduce(
            (s, g) => s + g.unsettled.reduce((x, t) => x + (t.outsourcing_price ?? 0), 0), 0,
        ),
        [doneByDesigner],
    );

    const handleApprove = (task: TaskWithDesigner) => {
        if (
            !confirm(
                `"${task.customer_name}" 작업을 승인하고 완료 처리할까요?\n단가 ${fmtWon(task.outsourcing_price)}이 확정됩니다.`,
            )
        )
            return;
        suppress();
        startTransition(async () => {
            try {
                await approveOutsourcingTask(task.id, null);
                setPanelTaskId(null);
                showToast("승인했습니다.", "success");
                refresh();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    /** 사유 없이 바로 수정 요청 → 트리거가 알림톡(T3)을 쌓는다 */
    const handleRework = (task: TaskWithDesigner) => {
        // if (!confirm(`"${task.customer_name}" 작업에 수정 요청을 보낼까요?\n외주 작업자에게 카카오톡 알림이 갑니다.`))
        //     return;
        suppress();
        startTransition(async () => {
            try {
                await requestReworkTask(task.id, "", []);
                setPanelTaskId(null);
                showToast("수정 요청을 보냈습니다.", "success");
                refresh();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    /** ★v16 검수요청 ⇄ 고객 확인중. 알림 없음 · 되돌리기 가능이라 확인창 없이 바로 */
    const handleCustomerReview = (task: TaskWithDesigner, revert: boolean) => {
        startTransition(async () => {
            try {
                const res = revert ? await revertToReview(task.id) : await markCustomerReview(task.id);
                if (!res.ok) { showToast(res.message); refresh(); return; }
                showToast(
                    revert ? "검수 요청으로 되돌렸습니다." : "고객 확인중으로 바꿨습니다.",
                    "success",
                );
                refresh();   // 패널은 열린 채로 — 뱃지와 헤더 버튼이 새 상태로 바뀐다
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    const handleRelease = (task: TaskWithDesigner) => {
        if (
            !confirm(
                `"${task.customer_name}" 작업의 외주 배정을 해제할까요?\n다시 작업대기 목록으로 돌아가 다른 작업자가 가져갈 수 있습니다.`,
            )
        )
            return;
        suppress();
        startTransition(async () => {
            try {
                await releaseOutsourcingTask(task.id, null);
                showToast("배정을 해제했습니다.", "success");
                refresh();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    /** 인쇄 접수완료 켜기/끄기. 끄는 쪽만 확인을 받는다 */
    const handleTogglePrint = (task: TaskWithDesigner, next: boolean) => {
        if (
            !next &&
            !confirm(`"${task.customer_name}" 의 인쇄 접수완료 표시를 해제할까요?`)
        )
            return;

        startTransition(async () => {
            try {
                const res = await setPrintReceived(task.id, next);
                if (!res.ok) { showToast(res.message); return; }
                showToast(
                    next ? "인쇄 접수완료로 표시했습니다." : "인쇄 접수완료를 해제했습니다.",
                    "success",
                );
                refresh();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    const handleSettle = () => {
        const target = settleTarget;
        if (!target) return;
        const expected = target.tasks.reduce((s, t) => s + (t.outsourcing_price ?? 0), 0);

        startTransition(async () => {
            try {
                const res = await settleDesignerTasks(target.designerId, expected);
                if (!res.ok) { showToast(res.message); return; }
                setSettleTarget(null);
                showToast(
                    `${target.name} · ${res.count}건 ${res.total.toLocaleString("ko-KR")}원을 정산 완료로 기록했습니다.`,
                    "success",
                );
                refresh();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    return (
        <>
            {ToastUI}

            {settleTarget && (
                <SettleModal
                    designerName={settleTarget.name}
                    tasks={settleTarget.tasks}
                    onConfirm={handleSettle}
                    onCancel={() => setSettleTarget(null)}
                    pending={isPending}
                />
            )}

            {priceTarget && (
                <PriceModal
                    task={priceTarget}
                    onConfirm={handlePrice}
                    onCancel={() => setPriceTarget(null)}
                    pending={isPending}
                />
            )}

            {panelTask && (
                <ReviewPanel
                    task={panelTask}
                    bump={msgBump}
                    onClose={() => {
                        setPanelTaskId(null);
                        refresh(); // 읽음 처리 반영
                    }}
                    onApprove={() => handleApprove(panelTask)}
                    onRework={() => handleRework(panelTask)}
                    onCustomerReview={() => handleCustomerReview(panelTask, false)}
                    onRevertReview={() => handleCustomerReview(panelTask, true)}
                    onError={(m) => showToast(m)}
                    onToast={(m) => showToast(m, "success")}
                />
            )}
            {modalTask && (
                <TaskDetailModal
                    task={modalTask}
                    onClose={() => setModalTask(null)}
                    onDeleted={() => {
                        setModalTask(null);
                        refresh();
                    }}
                    designers={designers}
                    canEditDesigner={canEditDesigner}
                    onMutate={refresh}
                />
            )}

            {showBanner && (
                <NewMessageBanner
                    style={{ marginBottom: 12 }}
                    text="외주 작업자가 새 메시지를 보냈습니다."
                    onRefresh={() => { dismiss(); setRtNew(false); refresh(); }}
                />
            )}

            {/* 서브탭 */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 16,
                    borderBottom: "1px solid #e5e7eb",
                    paddingBottom: 0,
                }}
            >
                {SUB_TABS.map((t) => {
                    const list = byTab.get(t.key) ?? [];
                    const count = list.length;
                    const unread = list.filter((x) => x.outsourcing_unread_staff).length;
                    const active = tab === t.key;
                    return (
                        <button
                            key={t.key}
                            type="button"
                            onClick={() => setTab(t.key)}
                            style={{
                                padding: "8px 16px",
                                border: "none",
                                background: "none",
                                borderBottom: `2px solid ${active ? "#a21caf" : "transparent"}`,
                                color: active ? "#a21caf" : "#9ca3af",
                                fontWeight: active ? 800 : 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                                marginBottom: -1,
                            }}
                        >
                            {t.label}
                            {count > 0 && (
                                <span
                                    style={{
                                        marginLeft: 6,
                                        padding: "1px 7px",
                                        borderRadius: 99,
                                        background: active ? "#a21caf" : "#e5e7eb",
                                        color: active ? "#fff" : "#6b7280",
                                        fontSize: 11,
                                        fontWeight: 800,
                                    }}
                                >
                                    {count}
                                </span>
                            )}
                            {unread > 0 && (
                                <span
                                    style={{
                                        marginLeft: 4,
                                        display: "inline-block",
                                        width: 7,
                                        height: 7,
                                        borderRadius: 99,
                                        background: "#ef4444",
                                        verticalAlign: "top",
                                    }}
                                />
                            )}
                        </button>
                    );
                })}

                {tab === "done" && (
                    <span style={{
                        marginLeft: "auto", paddingBottom: 8,
                        display: "flex", alignItems: "center", gap: 12,
                    }}>
                        <label style={{
                            display: "flex", alignItems: "center", gap: 5,
                            fontSize: 12, color: "#6b7280", cursor: "pointer", userSelect: "none",
                        }}>
                            <input
                                type="checkbox"
                                checked={showSettled}
                                onChange={(e) => setShowSettled(e.target.checked)}
                                style={{ cursor: "pointer" }}
                            />
                            지급 완료 건도 보기
                        </label>
                        {printPendingTotal > 0 && (
                            <span style={{ fontSize: 12, color: "#6b7280" }}>
                                인쇄 미접수 {printPendingTotal}건
                            </span>
                        )}
                        <span style={{ fontWeight: 800, color: "#a21caf" }}>
                            미정산 {unsettledTotal.toLocaleString("ko-KR")}원
                        </span>
                    </span>
                )}
            </div>

            {tab === "review" && rows.length > 0 && (
                <div
                    style={{
                        padding: "10px 14px",
                        marginBottom: 12,
                        background: "#fffbeb",
                        border: "1px solid #fde68a",
                        borderRadius: 8,
                        color: "#b45309",
                        fontSize: 13,
                        fontWeight: 600,
                    }}
                >
                    "검수 내역"에서 결과물을 확인하고 고객에게 보낸 뒤 "고객 확인"으로 넘기세요.
                </div>
            )}

            {/* 완료 탭은 작업자별 묶음. 나머지는 테이블 */}
            {tab === "done" ? (
                <div>
                    {doneByDesigner.length === 0 && (
                        <p style={{
                            textAlign: "center", padding: "40px 0", color: "#9ca3af",
                            border: "1px dashed #e5e7eb", borderRadius: 8,
                        }}>
                            완료된 외주 작업이 없습니다.
                        </p>
                    )}
                    {doneByDesigner.map((g) => (
                        <DesignerSettleCard
                            key={g.designerId}
                            name={g.name}
                            unsettled={g.unsettled}
                            settled={g.settled}
                            showSettled={showSettled}
                            pending={isPending}
                            onSettle={() => setSettleTarget({
                                designerId: g.designerId,
                                name: g.name,
                                tasks: g.unsettled,
                            })}
                            onOpenTask={setModalTask}
                            onTogglePrint={handleTogglePrint}
                        />
                    ))}
                </div>
            ) : (
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <caption className="sr-only">외주 작업 목록</caption>
                    <thead>
                    <tr style={headRow}>
                        <th scope="col" style={{ ...th, textAlign: "left", paddingLeft: 14 }}>
                            고객 / 작업
                        </th>
                        <th scope="col" style={{ ...th, width: 110 }}>외주 작업자</th>
                        <th scope="col" style={{ ...th, width: 110 }}>단가</th>
                        <th scope="col" style={{ ...th, width: 90 }}>상태</th>
                        <th scope="col" style={{ ...th, width: 64 }}>등록</th>
                        <th scope="col" style={{ ...th, width: 220 }}>처리</th>
                    </tr>
                    </thead>
                    <tbody>
                    {rows.length === 0 && (
                        <tr>
                            <td
                                colSpan={6}
                                style={{
                                    textAlign: "center",
                                    padding: "40px 0",
                                    color: "#9ca3af",
                                    borderBottom: "1px solid #f3f4f6",
                                }}
                            >
                                {tab === "review"
                                    ? "검수를 기다리는 작업이 없습니다."
                                    : tab === "customer"
                                        ? "고객 확인 중인 작업이 없습니다."
                                        : tab === "progress"
                                            ? "진행 중인 외주 작업이 없습니다."
                                            : tab === "open"
                                                ? "외주 작업자가 가져갈 수 있는 작업이 없습니다."
                                                : "완료된 외주 작업이 없습니다."}
                            </td>
                        </tr>
                    )}

                    {rows.map((task) => {
                        const os = task.outsourcing_status as OutsourcingStatus;
                        const sty = OUTSOURCING_STATUS_STYLE[os];
                        const hasThread = os !== "open";
                        return (
                            <tr key={task.id} style={row}>
                                <td style={{ ...td, paddingLeft: 14 }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                                        {task.outsourcing_unread_staff && (
                                            <span
                                                title="확인하지 않은 메시지"
                                                style={{
                                                    width: 7,
                                                    height: 7,
                                                    borderRadius: 99,
                                                    background: "#ef4444",
                                                    flexShrink: 0,
                                                }}
                                            />
                                        )}
                                        <span
                                            onClick={() => setModalTask(task)}
                                            style={{
                                                fontWeight: 700,
                                                color: task.is_priority ? "#dc2626" : "#111827",
                                                cursor: "pointer",
                                            }}
                                        >
                                        {task.customer_name}
                                    </span>
                                        {task.outsourcing_round > 1 && (
                                            <span style={badge("#f3f4f6", "#6b7280", "#e5e7eb")}>
                                            {task.outsourcing_round}차
                                        </span>
                                        )}
                                        {task.special_details && (
                                            <span style={badge("#fef2f2", "#ef4444", "#fecaca")}>⚠</span>
                                        )}
                                        {task.order_method && (
                                            <span style={badge("#f3f4f6", "#374151", "#e5e7eb")}>
                                            {task.order_method}
                                        </span>
                                        )}
                                        <span
                                            onClick={() => setModalTask(task)}
                                            style={{ color: "#9ca3af", cursor: "pointer" }}
                                        >
                                        {task.print_items}
                                    </span>
                                    </div>
                                </td>

                                <td style={{ ...td, textAlign: "center" }}>
                                    {task.designer?.name ? (
                                        <span style={badge("#fdf4ff", "#a21caf", "#f5d0fe")}>
                                        {task.designer.name}
                                    </span>
                                    ) : (
                                        <span style={{ color: "#d1d5db", fontSize: 12 }}>미배정</span>
                                    )}
                                </td>

                                <td
                                    style={{
                                        ...td,
                                        textAlign: "right",
                                        paddingRight: 14,
                                        fontWeight: 700,
                                        color:
                                            task.outsourcing_price == null
                                                ? "#d1d5db"
                                                : os === "done"
                                                    ? "#a21caf"
                                                    : "#6b7280",
                                    }}
                                >
                                    {os === "done" ? (
                                        fmtWon(task.outsourcing_price)
                                    ) : (
                                        <button
                                            type="button"
                                            onClick={() => setPriceTarget(task)}
                                            title="단가 수정"
                                            style={{
                                                background: "none",
                                                border: "none",
                                                borderBottom: "1px dashed #d1d5db",
                                                padding: "1px 0",
                                                color: "inherit",
                                                font: "inherit",
                                                cursor: "pointer",
                                            }}
                                        >
                                            {fmtWon(task.outsourcing_price)}
                                        </button>
                                    )}
                                </td>

                                <td style={{ ...td, textAlign: "center" }}>
                                <span style={badge(sty.bg, sty.color, sty.border)}>
                                    {OUTSOURCING_STATUS_LABEL[os]}
                                </span>
                                </td>

                                <td style={{ ...td, textAlign: "center", color: "#9ca3af", fontSize: 12 }}>
                                    {fmtDate(task.created_at)}
                                </td>

                                <td style={{ ...td, textAlign: "center" }}>
                                    <div style={{ display: "flex", gap: 6, justifyContent: "center" }}>
                                        {hasThread && (
                                            <button
                                                type="button"
                                                onClick={() => setPanelTaskId(task.id)}
                                                style={{
                                                    padding: "4px 12px",
                                                    borderRadius: 6,
                                                    border: "1px solid #e5e7eb",
                                                    background: task.outsourcing_unread_staff ? "#fef2f2" : "#fff",
                                                    color: task.outsourcing_unread_staff ? "#dc2626" : "#374151",
                                                    fontWeight: 700,
                                                    cursor: "pointer",
                                                    fontFamily: "inherit",
                                                    fontSize: 13,
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                검수 내역
                                            </button>
                                        )}

                                        {os === "customer_review" && (
                                            <>
                                                <button
                                                    type="button"
                                                    disabled={isPending}
                                                    onClick={() => handleApprove(task)}
                                                    style={{
                                                        padding: "4px 12px",
                                                        borderRadius: 6,
                                                        border: "1px solid #bbf7d0",
                                                        background: "#f0fdf4",
                                                        color: "#15803d",
                                                        fontWeight: 700,
                                                        cursor: isPending ? "not-allowed" : "pointer",
                                                        fontFamily: "inherit",
                                                        fontSize: 13,
                                                        opacity: isPending ? 0.5 : 1,
                                                        whiteSpace: "nowrap",
                                                    }}
                                                >
                                                    승인
                                                </button>
                                            </>
                                        )}

                                        {(os === "claimed" || os === "rework") && (
                                            <button
                                                type="button"
                                                disabled={isPending}
                                                onClick={() => handleRelease(task)}
                                                style={{
                                                    padding: "4px 12px",
                                                    borderRadius: 6,
                                                    border: "1px solid #e5e7eb",
                                                    background: "#fff",
                                                    color: "#6b7280",
                                                    fontWeight: 600,
                                                    cursor: isPending ? "not-allowed" : "pointer",
                                                    fontFamily: "inherit",
                                                    fontSize: 13,
                                                    opacity: isPending ? 0.5 : 1,
                                                    whiteSpace: "nowrap",
                                                }}
                                            >
                                                배정 해제
                                            </button>
                                        )}

                                        {os === "open" && (
                                            <span style={{ color: "#d1d5db", fontSize: 12 }}>—</span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        );
                    })}
                    </tbody>
                </table>
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// 스타일 헬퍼
// ─────────────────────────────────────────────────────────────

function badge(bg: string, color: string, border: string): React.CSSProperties {
    return {
        display: "inline-block",
        fontWeight: 700,
        padding: "2px 7px",
        borderRadius: 5,
        background: bg,
        color,
        border: `1px solid ${border}`,
        fontSize: 12,
        whiteSpace: "nowrap",
    };
}

function btn(primary: boolean): React.CSSProperties {
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

const sectionLabel: React.CSSProperties = {
    margin: "0 0 6px",
    fontWeight: 700,
    color: "#6b7280",
    fontSize: 12,
};

const headRow: React.CSSProperties = {
    borderTop: "2px solid #111827",
    borderBottom: "1px solid #e5e7eb",
    background: "#f9fafb",
};
const th: React.CSSProperties = {
    padding: "10px 12px",
    fontWeight: 700,
    color: "#6b7280",
    whiteSpace: "nowrap",
};
const row: React.CSSProperties = {
    borderBottom: "1px solid #e5e7eb",
    verticalAlign: "middle",
};
const td: React.CSSProperties = {
    padding: "10px 8px",
    verticalAlign: "middle",
};