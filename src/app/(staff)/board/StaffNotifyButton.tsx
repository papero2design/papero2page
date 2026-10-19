// src/app/(staff)/board/StaffNotifyButton.tsx
// ★v16 Ch4-B — 사내 헤더의 "검수 알림" 버튼 + 설정 창 (문서 13-7-10)
// 외주의 NotifyContact.tsx 와 달리 배너가 없다 — 사내 직원 전원이 받을 필요는 없다.
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
    fetchMyStaffNotify,
    removeMyStaffNotify,
    saveMyStaffNotify,
    setMyStaffNotifyOn,
    type StaffNotifyState,
} from "./notifyActions";

const LEAVE_STATUS = "연차";

function formatPhone(d: string | null): string {
    if (!d) return "";
    if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return d;
}

type Look = { label: string; dot: string; bg: string; border: string; color: string };

function lookOf(s: StaffNotifyState): Look {
    if (!s.phone) return { label: "검수 알림", dot: "#d1d5db", bg: "#f9fafb", border: "#e5e7eb", color: "#6b7280" };
    if (!s.on) return { label: "검수 알림 꺼짐", dot: "#9ca3af", bg: "#f9fafb", border: "#e5e7eb", color: "#6b7280" };
    if (s.memberStatus === LEAVE_STATUS) {
        return { label: "검수 알림 · 연차", dot: "#94a3b8", bg: "#f8fafc", border: "#cbd5e1", color: "#475569" };
    }
    return { label: "검수 알림 켜짐", dot: "#22c55e", bg: "#f0fdf4", border: "#bbf7d0", color: "#15803d" };
}

export default function StaffNotifyButton() {
    const [state, setState] = useState<StaffNotifyState | undefined>(undefined);
    const [open, setOpen] = useState(false);

    const load = useCallback(() => {
        fetchMyStaffNotify()
            .then(setState)
            .catch((e) => console.error("[notify] 사내 알림 설정 조회 실패:", e));
    }, []);

    useEffect(() => { load(); }, [load]);

    if (state === undefined) return null;
    const look = lookOf(state);

    return (
        <>
            <button
                type="button"
                onClick={() => { load(); setOpen(true); }}  // 연차 상태를 방금 바꿨을 수 있다 → 다시 읽는다
                title="검수요청 카톡 알림 설정"
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "8px 12px",
                    borderRadius: 8,
                    border: `1px solid ${look.border}`,
                    background: look.bg,
                    color: look.color,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                }}
            >
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: look.dot, display: "inline-block" }} />
                {look.label}
            </button>
            {open && (
                <StaffNotifyModal state={state} onClose={() => setOpen(false)} onChange={setState} />
            )}
        </>
    );
}

function StaffNotifyModal({
    state,
    onClose,
    onChange,
}: {
    state: StaffNotifyState;
    onClose: () => void;
    onChange: (s: StaffNotifyState) => void;
}) {
    const registered = !!state.phone;
    const [phone, setPhone] = useState(formatPhone(state.phone));
    const [consent, setConsent] = useState(registered);
    const [showDetail, setShowDetail] = useState(false);
    const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
    const [pending, startTransition] = useTransition();

    // 모달이 열린 뒤 다시 읽은 번호가 도착하면 입력칸도 맞춘다
    useEffect(() => { setPhone(formatPhone(state.phone)); }, [state.phone]);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, pending]);

    const run = (fn: () => Promise<{ ok: true; state: StaffNotifyState } | { ok: false; message: string }>, okText: string) => {
        setMessage(null);
        startTransition(async () => {
            try {
                const res = await fn();
                if (!res.ok) { setMessage({ kind: "err", text: res.message }); return; }
                onChange(res.state);
                setMessage({ kind: "ok", text: okText });
            } catch (e) {
                setMessage({ kind: "err", text: (e as Error).message });
            }
        });
    };

    const onLeave = state.memberStatus === LEAVE_STATUS;
    const phoneChanged = phone.replace(/\D/g, "") !== (state.phone ?? "");
    const canSave = !pending && consent && phone.trim() !== "" && (!registered || phoneChanged);

    return (
        <div
            role="presentation"
            onClick={() => { if (!pending) onClose(); }}
            style={{
                position: "fixed", inset: 0, zIndex: 2000,   // 14절: 접속 바(1760) · 채팅 서랍(1800) 위
                background: "rgba(17, 24, 39, 0.45)",
                display: "flex", alignItems: "center", justifyContent: "center", padding: 16,
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="staff-notify-title"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "100%", maxWidth: 420, maxHeight: "calc(100vh - 32px)", overflowY: "auto",
                    background: "#fff", borderRadius: 14, padding: 22, boxSizing: "border-box",
                    boxShadow: "0 20px 50px rgba(0,0,0,0.18)", textAlign: "left",
                }}
            >
                <h3 id="staff-notify-title" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#111827" }}>
                    검수요청 카톡 알림
                </h3>
                <p style={{ margin: "8px 0 14px", fontSize: 13, lineHeight: 1.6, color: "#4b5563" }}>
                    외주 작업자가 검수요청을 하면, 알림을 켜둔 사내 직원 <b>모두</b>에게 카카오톡 알람이 갑니다.
                    알림 전달이 필요한 직원만 키시면 되고, 끝나면 끄면 됩니다.
                </p>

                {/* 연차 안내 */}
                <div
                    style={{
                        marginBottom: 14, padding: "8px 12px", borderRadius: 8, fontSize: 12, lineHeight: 1.6,
                        background: onLeave ? "#f8fafc" : "#f9fafb",
                        border: `1px solid ${onLeave ? "#cbd5e1" : "#e5e7eb"}`,
                        color: onLeave ? "#334155" : "#6b7280",
                    }}
                >
                    {state.memberStatus === null
                        ? "관리자 계정은 멤버 상태가 없어 연차 건너뛰기가 적용되지 않습니다. 쉴 때는 알림을 꺼주세요."
                        : onLeave
                            ? "지금 상태가 '연차'라서 켜져 있어도 보내지 않습니다. 상태를 바꾸면 바로 다시 받습니다."
                            : "멤버 상태가 '연차'인 동안은 켜져 있어도 보내지 않습니다."}
                </div>

                {/* 켜기 · 끄기 — 등록한 뒤에만 */}
                {registered && (
                    <label
                        style={{
                            display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12,
                            padding: "12px 14px", borderRadius: 10, border: "1px solid #e5e7eb", marginBottom: 16,
                            cursor: pending ? "default" : "pointer",
                        }}
                    >
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#111827" }}>검수요청 알림 받기</span>
                        <input
                            type="checkbox"
                            role="switch"
                            checked={state.on}
                            disabled={pending}
                            onChange={(e) => {
                                const next = e.target.checked;
                                run(() => setMyStaffNotifyOn(next), next ? "알림을 켰습니다." : "알림을 껐습니다. 번호는 남아 있습니다.");
                            }}
                            style={{ width: 18, height: 18, cursor: "inherit" }}
                        />
                    </label>
                )}

                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>
                    휴대폰 번호
                </label>
                <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="010-1234-5678"
                    disabled={pending}
                    style={{
                        width: "100%", padding: "10px 12px", border: "1px solid #d1d5db", borderRadius: 8,
                        fontSize: 15, fontFamily: "inherit", boxSizing: "border-box", outline: "none",
                    }}
                />

                {!registered && (
                    <div style={{ marginTop: 14, padding: 12, borderRadius: 10, background: "#f9fafb", border: "1px solid #e5e7eb" }}>
                        <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                            <input
                                type="checkbox"
                                checked={consent}
                                onChange={(e) => setConsent(e.target.checked)}
                                disabled={pending}
                                style={{ marginTop: 3 }}
                            />
                            <span style={{ fontSize: 13, color: "#111827", lineHeight: 1.5 }}>
                                <b>(필수)</b> 업무 알림 수신 및 휴대폰 번호 수집 · 이용에 동의합니다.
                            </span>
                        </label>
                        <button
                            type="button"
                            onClick={() => setShowDetail((v) => !v)}
                            style={{
                                marginTop: 6, marginLeft: 22, padding: 0, border: "none", background: "none",
                                color: "#6b7280", fontSize: 12, textDecoration: "underline", cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            {showDetail ? "내용 접기" : "내용 보기"}
                        </button>
                        {showDetail && (
                            <dl style={{ margin: "8px 0 0 22px", fontSize: 12, color: "#4b5563", lineHeight: 1.6 }}>
                                <dt style={{ fontWeight: 700 }}>수집 항목</dt>
                                <dd style={{ margin: "0 0 6px" }}>휴대폰 번호</dd>
                                <dt style={{ fontWeight: 700 }}>이용 목적</dt>
                                <dd style={{ margin: "0 0 6px" }}>외주 작업 검수요청 안내 발송</dd>
                                <dt style={{ fontWeight: 700 }}>보유 기간</dt>
                                <dd style={{ margin: "0 0 6px" }}>번호를 삭제하거나 계정이 삭제될 때까지 (즉시 삭제)</dd>
                                <dt style={{ fontWeight: 700 }}>처리 위탁</dt>
                                <dd style={{ margin: 0 }}>알림톡 발송 대행사(솔라피)에 번호와 알림 내용이 전달됩니다.</dd>
                            </dl>
                        )}
                    </div>
                )}

                {message && (
                    <div
                        style={{
                            marginTop: 12, padding: "8px 12px", borderRadius: 8, fontSize: 13,
                            background: message.kind === "ok" ? "#f0fdf4" : "#fef2f2",
                            color: message.kind === "ok" ? "#15803d" : "#dc2626",
                            border: `1px solid ${message.kind === "ok" ? "#bbf7d0" : "#fecaca"}`,
                        }}
                    >
                        {message.text}
                    </div>
                )}

                <div style={{ display: "flex", gap: 8, marginTop: 18, alignItems: "center" }}>
                    {registered && (
                        <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                                if (!confirm("등록한 번호를 삭제할까요? 다시 받으려면 새로 등록해야 합니다.")) return;
                                run(removeMyStaffNotify, "번호를 삭제했습니다.");
                                setConsent(false);
                            }}
                            style={{
                                padding: "9px 4px", border: "none", background: "none", color: "#dc2626",
                                fontWeight: 700, fontSize: 13, cursor: pending ? "default" : "pointer", fontFamily: "inherit",
                            }}
                        >
                            번호 삭제
                        </button>
                    )}
                    <div style={{ flex: 1 }} />
                    <button type="button" onClick={onClose} disabled={pending} style={btn(false)}>
                        닫기
                    </button>
                    <button
                        type="button"
                        disabled={!canSave}
                        onClick={() => run(
                            () => saveMyStaffNotify({ phone, consent }),
                            registered ? "번호를 바꿨습니다." : "등록했습니다. 검수요청 알림이 켜졌습니다.",
                        )}
                        style={{ ...btn(true), opacity: canSave ? 1 : 0.5, cursor: canSave ? "pointer" : "default" }}
                    >
                        {pending ? "처리 중…" : registered ? "번호 변경" : "등록"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function btn(primary: boolean): React.CSSProperties {
    return {
        padding: "8px 14px",
        borderRadius: 8,
        border: primary ? "1px solid #111827" : "1px solid #e5e7eb",
        background: primary ? "#111827" : "#fff",
        color: primary ? "#fff" : "#374151",
        fontWeight: 700,
        fontSize: 13,
        cursor: "pointer",
        fontFamily: "inherit",
        whiteSpace: "nowrap",
    };
}
