// src/app/(worker)/outsourcing/NotifyContact.tsx
// ★v16 Ch4 — 외주 작업자 본인의 카톡 알림 번호 · 동의 (문서 13-7-9)
//
// 헤더 버튼 · 미등록 배너 · 설정 모달 셋이 같은 상태를 본다 → useNotifyContact 한 곳에서 관리.
// 번호는 서버 액션으로만 읽고 쓴다 (designer_contacts 는 브라우저 권한이 없다, 4-10).
"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import {
    fetchMyNotifyContact,
    removeMyNotifyContact,
    saveMyNotifyContact,
    type NotifyContactState,
} from "./actions";

const BANNER_KEY = "os-notify-banner-dismissed";

/** "01012345678" → "010-1234-5678" (화면 표시용) */
function formatPhone(d: string | null): string {
    if (!d) return "";
    if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
    return d;
}

export function useNotifyContact() {
    // undefined = 아직 모름 (버튼 · 배너를 그리지 않는다)
    const [state, setState] = useState<NotifyContactState | undefined>(undefined);
    const [open, setOpen] = useState(false);
    const [bannerDismissed, setBannerDismissed] = useState(true);

    useEffect(() => {
        let alive = true;
        fetchMyNotifyContact()
            .then((s) => { if (alive) setState(s); })
            .catch((e) => {
                // 조회 실패가 작업 화면을 막으면 안 된다
                console.error("[notify] 알림 설정 조회 실패:", e);
            });
        try {
            setBannerDismissed(localStorage.getItem(BANNER_KEY) === "1");
        } catch {
            setBannerDismissed(false);
        }
        return () => { alive = false; };
    }, []);

    const dismissBanner = useCallback(() => {
        setBannerDismissed(true);
        try { localStorage.setItem(BANNER_KEY, "1"); } catch { /* 무시 */ }
    }, []);

    const registered = !!state?.phone && !!state?.consentAt;

    return {
        state,
        registered,
        open,
        setOpen,
        setState,
        showBanner: state !== undefined && !registered && !bannerDismissed,
        dismissBanner,
    };
}

// ─────────────────────────────────────────────────────────────
// 헤더 버튼
// ─────────────────────────────────────────────────────────────

export function NotifyHeaderButton({
                                       state,
                                       registered,
                                       onClick,
                                   }: {
    state: NotifyContactState | undefined;
    registered: boolean;
    onClick: () => void;
}) {
    if (state === undefined) return null;
    return (
        <button
            type="button"
            onClick={onClick}
            title={registered ? "카톡 알림 설정" : "카톡 알림 번호 등록"}
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 12px",
                borderRadius: 8,
                border: `1px solid ${registered ? "#bbf7d0" : "#fde68a"}`,
                background: registered ? "#f0fdf4" : "#fffbeb",
                color: registered ? "#15803d" : "#b45309",
                fontWeight: 700,
                fontSize: 13,
                cursor: "pointer",
                fontFamily: "inherit",
                whiteSpace: "nowrap",
            }}
        >
            <span
                style={{
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: registered ? "#22c55e" : "#f59e0b",
                    display: "inline-block",
                }}
            />
            {registered ? "카톡 알림 켜짐" : "카톡 알림 등록"}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────
// 미등록 배너
// ─────────────────────────────────────────────────────────────

export function NotifyBanner({
                                 onOpen,
                                 onDismiss,
                             }: {
    onOpen: () => void;
    onDismiss: () => void;
}) {
    return (
        <div
            style={{
                margin: "12px 16px 0",
                padding: "10px 14px",
                borderRadius: 10,
                border: "1px solid #fde68a",
                background: "#fffbeb",
                color: "#92400e",
                fontSize: 13,
                display: "flex",
                flexWrap: "wrap",
                alignItems: "center",
                gap: 10,
            }}
        >
            <span style={{ flex: "1 1 240px" }}>
                {/*휴대폰 번호를 등록하면 작업 배정 · 수정 요청 · 승인 · 정산 소식을 카카오톡으로 받을 수 있습니다.*/}
                휴대폰 번호를 등록하면 수정 요청 · 정산 소식을 카카오톡으로 받을 수 있습니다.
            </span>
            <button type="button" onClick={onOpen} style={smallBtn(true)}>
                등록하기
            </button>
            <button type="button" onClick={onDismiss} style={smallBtn(false)}>
                닫기
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 설정 모달
// ─────────────────────────────────────────────────────────────

export function NotifyContactModal({
                                       state,
                                       onClose,
                                       onSaved,
                                   }: {
    state: NotifyContactState;
    onClose: () => void;
    onSaved: (s: NotifyContactState) => void;
}) {
    const registered = !!state.phone && !!state.consentAt;
    const [phone, setPhone] = useState(formatPhone(state.phone));
    const [consent, setConsent] = useState(registered);
    const [showDetail, setShowDetail] = useState(false);
    const [message, setMessage] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
    const [pending, startTransition] = useTransition();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && !pending) onClose(); };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onClose, pending]);

    const save = () => {
        setMessage(null);
        startTransition(async () => {
            try {
                const res = await saveMyNotifyContact({ phone, consent });
                if (!res.ok) {
                    setMessage({ kind: "err", text: res.message });
                    return;
                }
                setPhone(formatPhone(res.state.phone));
                onSaved(res.state);
                setMessage({ kind: "ok", text: "등록됐습니다. 이제 카톡으로 알림을 받습니다." });
            } catch (e) {
                setMessage({ kind: "err", text: (e as Error).message });
            }
        });
    };

    const remove = () => {
        if (!confirm("카톡 알림을 끄고 등록한 번호를 삭제할까요?")) return;
        setMessage(null);
        startTransition(async () => {
            try {
                const res = await removeMyNotifyContact();
                if (!res.ok) {
                    setMessage({ kind: "err", text: res.message });
                    return;
                }
                setPhone("");
                setConsent(false);
                onSaved(res.state);
                setMessage({ kind: "ok", text: "알림을 껐습니다. 번호도 삭제했습니다." });
            } catch (e) {
                setMessage({ kind: "err", text: (e as Error).message });
            }
        });
    };

    return (
        <div
            role="presentation"
            onClick={() => { if (!pending) onClose(); }}
            style={{
                position: "fixed",
                inset: 0,
                // 14절: 접속 바(1760) · 채팅 서랍(1800) 위, 라이트박스(2100) 아래
                zIndex: 2000,
                background: "rgba(17, 24, 39, 0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
            }}
        >
            <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="notify-modal-title"
                onClick={(e) => e.stopPropagation()}
                style={{
                    width: "100%",
                    maxWidth: 420,
                    maxHeight: "calc(100vh - 32px)",
                    overflowY: "auto",
                    background: "#fff",
                    borderRadius: 14,
                    padding: 22,
                    boxShadow: "0 20px 50px rgba(0,0,0,0.18)",
                    boxSizing: "border-box",
                }}
            >
                <h3 id="notify-modal-title" style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#111827" }}>
                    카카오톡 알림 설정
                </h3>
                <p style={{ margin: "8px 0 16px", fontSize: 13, lineHeight: 1.6, color: "#4b5563" }}>
                    {/*작업이 배정되거나, 수정 요청 · 승인 · 정산이 처리되면 아래 번호로 카카오톡 알림톡을 보냅니다.*/}
                    수정 요청 · 정산이 처리되면 아래 번호로 카카오톡 알림톡을 보냅니다.
                    카카오톡을 쓰지 않는 번호면 받지 못할 수 있습니다.
                </p>

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
                        width: "100%",
                        padding: "10px 12px",
                        border: "1px solid #d1d5db",
                        borderRadius: 8,
                        fontSize: 15,
                        fontFamily: "inherit",
                        boxSizing: "border-box",
                        outline: "none",
                    }}
                />

                <div
                    style={{
                        marginTop: 16,
                        padding: 12,
                        borderRadius: 10,
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                    }}
                >
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
                            marginTop: 6,
                            marginLeft: 22,
                            padding: 0,
                            border: "none",
                            background: "none",
                            color: "#6b7280",
                            fontSize: 12,
                            textDecoration: "underline",
                            cursor: "pointer",
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
                            {/*<dd style={{ margin: "0 0 6px" }}>외주 작업 배정 · 수정 요청 · 승인 · 정산 안내 발송</dd>*/}
                            <dd style={{ margin: "0 0 6px" }}>수정 요청 · 정산 안내 발송</dd>
                            <dt style={{ fontWeight: 700 }}>보유 기간</dt>
                            <dd style={{ margin: "0 0 6px" }}>알림을 끄거나 외주 계정이 삭제될 때까지 (즉시 삭제)</dd>
                            <dt style={{ fontWeight: 700 }}>처리 위탁</dt>
                            <dd style={{ margin: "0 0 6px" }}>
                                알림톡 발송 대행사(솔라피)에 번호와 알림 내용이 전달됩니다.
                                고객명은 가려서 보냅니다.
                            </dd>
                            <dd style={{ margin: 0 }}>
                                동의하지 않아도 외주 작업은 그대로 할 수 있으며, 카톡 알림만 받지 않습니다.
                            </dd>
                        </dl>
                    )}
                </div>

                {message && (
                    <div
                        style={{
                            marginTop: 12,
                            padding: "8px 12px",
                            borderRadius: 8,
                            fontSize: 13,
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
                            onClick={remove}
                            disabled={pending}
                            style={{
                                padding: "9px 12px",
                                border: "none",
                                background: "none",
                                color: "#dc2626",
                                fontWeight: 700,
                                fontSize: 13,
                                cursor: pending ? "default" : "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            알림 끄기
                        </button>
                    )}
                    <div style={{ flex: 1 }} />
                    <button type="button" onClick={onClose} disabled={pending} style={smallBtn(false)}>
                        닫기
                    </button>
                    <button
                        type="button"
                        onClick={save}
                        disabled={pending || !consent || phone.trim() === ""}
                        style={{
                            ...smallBtn(true),
                            opacity: pending || !consent || phone.trim() === "" ? 0.5 : 1,
                            cursor: pending || !consent || phone.trim() === "" ? "default" : "pointer",
                        }}
                    >
                        {pending ? "처리 중…" : registered ? "변경 저장" : "등록"}
                    </button>
                </div>
            </div>
        </div>
    );
}

function smallBtn(primary: boolean): React.CSSProperties {
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
