// src/lib/presence/OnlinePresence.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useOnlineUsers as usePresenceCtx } from "./PresenceProvider";
import { useChatOptional } from "@/lib/chat/ChatProvider";

// 편의 재export — 이 파일에서 함께 import 하고 싶을 때
export { usePresenceCtx as useOnlineUsers };


/**
 * 접속 상태 표시 조각들.
 *
 * ★ designers.status ('여유'/'바쁨') 와 헷갈리지 않게 그린다.
 *   status  = 본인이 고르는 업무 상태
 *   초록불  = 실제 접속 여부
 *   '여유'인데 회색불(퇴근), '바쁨'인데 초록불(작업 중) 둘 다 정상이다.
 */

const GREEN = "#22c55e";
const GRAY = "#d1d5db";
const ACCENT = "#a21caf";

/** 이름 앞의 [CS] [외주] 접두어를 벗긴다 */
function stripTag(name: string) {
    return name.replace(/^\[[^\]]*\]\s*/, "");
}

function Circle({
                    name, url, on, size,
                }: { name: string; url?: string | null; on: boolean; size: number }) {
    return (
        <span style={{ position: "relative", display: "inline-block", flexShrink: 0 }}>
            <span style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: size, height: size, borderRadius: 99, overflow: "hidden",
                background: "#f3f4f6", color: "#6b7280",
                fontSize: Math.round(size * .42), fontWeight: 700,
                boxShadow: `0 0 0 2px ${on ? GREEN : GRAY}`,
                opacity: on ? 1 : .55,
                transition: "box-shadow .2s, opacity .2s",
            }}>
                {url ? (
                    // next/image 를 안 쓴다 — 외부 도메인이 next.config 에
                    // 등록돼 있지 않으면 런타임에 터진다
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : (stripTag(name).charAt(0) || "?")}
            </span>
            <span style={{
                position: "absolute", right: -1, bottom: -1,
                width: Math.max(7, Math.round(size * .28)),
                height: Math.max(7, Math.round(size * .28)),
                borderRadius: 99, background: on ? GREEN : GRAY,
                border: "2px solid #fff", boxSizing: "content-box",
            }} />
        </span>
    );
}

/** 이름 옆에 붙이는 작은 점만. 목록·테이블용. */
export function OnlineDot({ userId }: { userId: string }) {
    const { isOnline } = usePresenceCtx();
    if (!isOnline(userId)) return null;
    return (
        <span title="접속 중" style={{
            display: "inline-block", width: 7, height: 7,
            borderRadius: 99, background: GREEN, flexShrink: 0,
        }} />
    );
}

/**
 * 헤더의 접속자 줄. 아바타 + 이름 칩으로 보여준다.
 * 칩을 누르면 짧은 프로필이 뜨고 거기서 대화를 걸 수 있다.
 */
export function OnlineUsersBar({ max = 4 }: { max?: number }) {
    const { online, me } = usePresenceCtx();
    const [openId, setOpenId] = useState<string | null>(null);
    const [moreOpen, setMoreOpen] = useState(false);
    const wrapRef = useRef<HTMLDivElement>(null);

    // 바깥을 누르면 팝오버를 닫는다
    useEffect(() => {
        if (!openId && !moreOpen) return;
        const onDown = (e: MouseEvent) => {
            if (!wrapRef.current?.contains(e.target as Node))
            {
                setOpenId(null);
                setMoreOpen(false);
            }
        };
        document.addEventListener("mousedown", onDown);
        return () => document.removeEventListener("mousedown", onDown);
    }, [openId, moreOpen]);

    const others = Object.values(online).filter((u) => u.userId !== me?.userId);
    if (others.length === 0) return null;

    const shown = others.slice(0, max);
    const rest = others.length - shown.length;

    return (
        <div ref={wrapRef} style={{
            position: "relative", zIndex: 1760,
            display: "flex", alignItems: "center", gap: 6, flexShrink: 0,
        }}>
            {shown.map((u) => (
                <div key={u.userId} style={{ position: "relative" }}>
                    <button
                        type="button"
                        onClick={() => setOpenId((p) => (p === u.userId ? null : u.userId))}
                        title={`${u.name} · 접속 중`}
                        style={{
                            display: "flex", alignItems: "center", gap: 6,
                            padding: "3px 10px 3px 3px", borderRadius: 99,
                            border: `1px solid ${openId === u.userId ? ACCENT : "#e5e7eb"}`,
                            background: openId === u.userId ? "#fdf4ff" : "#fff",
                            cursor: "pointer", fontFamily: "inherit",
                            maxWidth: 150,
                        }}
                    >
                        <Circle name={u.name} url={u.avatarUrl} on size={24} />
                        <span style={{
                            fontSize: 12, fontWeight: 600, color: "#374151",
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                            {stripTag(u.name)}
                        </span>
                    </button>

                    {openId === u.userId && (
                        <ProfileCard
                            userId={u.userId}
                            name={u.name}
                            avatarUrl={u.avatarUrl}
                            onClose={() => setOpenId(null)}
                        />
                    )}
                </div>
            ))}
            {rest > 0 && (
                <div style={{ position: "relative" }}>
                    <button
                        type="button"
                        onClick={() => { setMoreOpen((o) => !o); setOpenId(null); }}
                        title={`접속자 ${rest}명 더 보기`}
                        style={{
                            padding: "5px 10px", borderRadius: 99,
                            border: `1px solid ${moreOpen ? ACCENT : "#e5e7eb"}`,
                            background: moreOpen ? "#fdf4ff" : "#fff",
                            fontSize: 12, fontWeight: 700, color: "#6b7280",
                            cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap",
                        }}
                    >
                        +{rest}
                    </button>
                    {moreOpen && (
                        <MoreList
                            users={others.slice(max)}
                            onClose={() => setMoreOpen(false)}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

/**
 * +N 을 눌렀을 때 뜨는 나머지 접속자 목록.
 * 줄을 누르면 프로필을 거치지 않고 바로 대화를 연다.
 */
function MoreList({
                      users, onClose,
                  }: {
    users: { userId: string; name: string; avatarUrl?: string | null }[];
    onClose: () => void;
}) {
    // ChatProvider 밖에서도 터지지 않게 optional 로 받는다
    const chat = useChatOptional();
    const [pendingId, setPendingId] = useState<string | null>(null);

    const talk = async (id: string) => {
        if (!chat) return;
        setPendingId(id);
        try {
            // 거절 사유는 ChatProvider 가 서랍의 ErrorBar 로 띄운다
            await chat.openDmWith(id);
            onClose();
        } finally {
            setPendingId(null);
        }
    };

    return (
        <div style={{
            position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 1850,
            width: 220, maxHeight: 280, overflowY: "auto",
            padding: 6, borderRadius: 10,
            background: "#fff", border: "1px solid #e5e7eb",
            boxShadow: "0 8px 24px rgba(0,0,0,.12)", fontFamily: "inherit",
        }}>
            {users.map((u) => (
                <button
                    key={u.userId}
                    type="button"
                    disabled={pendingId !== null || !chat}
                    onClick={() => { void talk(u.userId); }}
                    style={{
                        display: "flex", alignItems: "center", gap: 9, width: "100%",
                        padding: "7px 8px", border: "none", borderRadius: 7,
                        background: pendingId === u.userId ? "#fdf4ff" : "transparent",
                        cursor: pendingId ? "wait" : "pointer",
                        textAlign: "left", fontFamily: "inherit",
                    }}
                >
                    <Circle name={u.name} url={u.avatarUrl} on size={26} />
                    <span style={{
                        flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, color: "#374151",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                        {stripTag(u.name)}
                    </span>
                    <span style={{ fontSize: 11, color: "#9ca3af", flexShrink: 0 }}>
                        {pendingId === u.userId ? "여는 중" : "대화"}
                    </span>
                </button>
            ))}
        </div>
    );
}

/** 칩을 눌렀을 때 뜨는 짧은 프로필. */
function ProfileCard({
                         userId, name, avatarUrl, onClose,
                     }: {
    userId: string;
    name: string;
    avatarUrl?: string | null;
    onClose: () => void;
}) {
    // ChatProvider 밖(예: 로그인 화면)에서도 터지지 않게 optional 로 받는다
    const chat = useChatOptional();
    const [pending, setPending] = useState(false);
    const [err, setErr] = useState("");

    const talk = async () => {
        if (!chat) return;
        setErr("");
        setPending(true);
        try {
            await chat.openDmWith(userId);
            onClose();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setPending(false);
        }
    };

    return (
        <div
            style={{
                position: "absolute", top: "calc(100% + 8px)", right: 0, zIndex: 1850,
                width: 220, padding: 14, borderRadius: 10,
                background: "#fff", border: "1px solid #e5e7eb",
                boxShadow: "0 8px 24px rgba(0,0,0,.12)",
                fontFamily: "inherit",
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <Circle name={name} url={avatarUrl} on size={40} />
                <div style={{ minWidth: 0 }}>
                    <p style={{
                        margin: 0, fontWeight: 700, fontSize: 14, color: "#111827",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                        {stripTag(name)}
                    </p>
                    <p style={{
                        margin: "2px 0 0", fontSize: 11, color: GREEN, fontWeight: 700,
                    }}>
                        접속 중
                    </p>
                </div>
            </div>

            {err && (
                <p style={{ margin: "0 0 8px", fontSize: 11, color: "#dc2626", fontWeight: 600 }}>
                    {err}
                </p>
            )}

            <button
                type="button"
                onClick={talk}
                disabled={pending || !chat}
                style={{
                    width: "100%", padding: "8px", borderRadius: 8,
                    border: "none", background: pending ? "#e5e7eb" : ACCENT,
                    color: pending ? "#9ca3af" : "#fff",
                    fontWeight: 700, fontSize: 13,
                    cursor: pending ? "wait" : "pointer", fontFamily: "inherit",
                }}
            >
                {pending ? "여는 중..." : "대화하기"}
            </button>
        </div>
    );
}
