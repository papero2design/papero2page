// src/lib/chat/ChatWidget.tsx
"use client";

import { uploadToR2 } from "@/lib/r2/upload";
import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "./ChatProvider";
import {
    fetchRoster,
    fetchRoomMembers,
    leaveRoom,
    type ChatMessage,
    type RosterUser,
    type RoomMember,
    type ChatAttachment,
} from "./actions";
import { useOnlineUsers } from "@/lib/presence/PresenceProvider";
import { ChatLinesSkeleton, PeopleRowsSkeleton } from "@/lib/ui/Skeleton";

/* ───────────────────────────────────────────────────────────
 * 디자인 — 교정지(proof sheet)
 *
 * 이 업장의 재료는 종이와 잉크다. 그래서 바탕은 비도공지,
 * 액센트는 임의의 보라가 아니라 CMYK 의 M 으로 읽는다.
 * 시안·옐로는 맨 위 컬러바 3px 안에서만 쓴다 — 밖으로 나오면 장난감이 된다.
 * ─────────────────────────────────────────────────────────── */

const PANEL_W = 380;
const EDGE = 16;

const PAPER = "#FCFCFA";   // 용지 — 살짝 따뜻한 비도공지
const INK = "#1C1C20";     // 잉크 — 순수 검정이 아닌 리치블랙
const MAGENTA = "#a21caf"; // 기존 액센트. 여기서는 CMYK 의 M
const RULE = "#E6E3DC";    // 괘선
const PENCIL = "#6B6B70";  // 연필
const FAINT = "#A3A29D";
const BUBBLE = "#EFEDE7";  // 상대 말풍선 — 따뜻한 회색
const GREEN = "#22c55e";

/** 시각·날짜·개수는 전부 이 활자로. 숫자가 흔들리지 않는다 */
const MONO = 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace';

/** 같은 사람이 이 간격 안에 연달아 보내면 한 덩어리로 본다 */
const GROUP_GAP_MS = 5 * 60 * 1000;

const MAX_ATTACHMENTS = 5;
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;   // 20MB

/** 이미지면 폭·높이를 재둔다. 로드 전 자리를 잡아 스크롤이 튀지 않게 */
function measureImage(file: File): Promise<{ w: number; h: number } | null> {
    if (!file.type.startsWith("image/")) return Promise.resolve(null);
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new window.Image();
        img.onload = () => {
            URL.revokeObjectURL(url);
            resolve({ w: img.naturalWidth, h: img.naturalHeight });
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

function isImage(a: ChatAttachment) {
    return a.mime?.startsWith("image/") ?? false;
}

function fmtBytes(n: number) {
    return n >= 1024 * 1024
        ? `${(n / 1024 / 1024).toFixed(1)}MB`
        : `${Math.round(n / 1024)}KB`;
}

/**
 * 인라인 style 로는 :hover / :focus 를 못 쓴다.
 * 규칙이 몇 개뿐이라 여기 두고 cw- 접두어로 격리한다.
 */
const CSS = `
.cw-row { transition: background .12s; }
.cw-row:hover { background: #F4F2EC !important; }
.cw-icon { transition: background .12s, color .12s; }
.cw-icon:hover { background: #EFEDE7; color: ${INK}; }
.cw-fab { transition: transform .2s cubic-bezier(.34,1.4,.64,1), box-shadow .2s, opacity .18s; }
.cw-fab:hover { transform: translateY(-2px); box-shadow: 0 12px 30px rgba(162,28,175,.34); }
.cw-fab:active { transform: translateY(0); }
.cw-field:focus-within { border-color: ${MAGENTA}; background: #fff; }
.cw-search:focus { border-color: ${MAGENTA}; background: #fff; outline: none; }
.cw-send:not(:disabled):hover { transform: scale(1.06); }
.cw-send { transition: transform .15s, background .15s; }
.cw-bar { transform-origin: left center; }
.cw-thumb { transition: opacity .12s; cursor: zoom-in; }
.cw-thumb:hover { opacity: .88; }
.cw-file { transition: background .12s; }
.cw-file:hover { background: #F4F2EC !important; }
@media (prefers-reduced-motion: reduce) {
  .cw-fab, .cw-send, .cw-row, .cw-icon, .cw-bar, .cw-thumb { transition: none !important; }
}
`;

/** 종이비행기 버튼 + 서랍. 레이아웃에 한 번만 놓는다. */
export default function ChatWidget() {
    const { open, setOpen, totalUnread, toggle } = useChat();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setOpen(false);
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [setOpen]);

    return (
        <>
            <style>{CSS}</style>

            {/* 버튼 — 서랍이 그 자리를 차지하므로 열리면 비켜준다.
                원이 아니라 모서리 둥근 사각. 종이와 판(plate)은 직사각이다 */}
            <button
                type="button"
                className="cw-fab"
                onClick={toggle}
                aria-label="메시지"
                aria-expanded={open}
                style={{
                    position: "fixed", right: 24, bottom: 24, zIndex: 1750,
                    width: 54, height: 54, borderRadius: 16,
                    border: "none", background: MAGENTA, color: "#fff",
                    boxShadow: "0 6px 22px rgba(162,28,175,.28)",
                    cursor: "pointer", display: "flex",
                    alignItems: "center", justifyContent: "center",
                    opacity: open ? 0 : 1,
                    transform: open ? "scale(.86)" : "scale(1)",
                    pointerEvents: open ? "none" : "auto",
                }}
            >
                <PaperPlane />
                {totalUnread > 0 && (
                    <span style={{
                        position: "absolute", top: -6, right: -6,
                        minWidth: 21, height: 21, padding: "0 6px",
                        borderRadius: 7, background: INK, color: "#fff",
                        fontFamily: MONO, fontSize: 11, fontWeight: 700,
                        fontVariantNumeric: "tabular-nums",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        border: "2.5px solid #fff", boxSizing: "content-box",
                    }}>
                        {totalUnread > 99 ? "99+" : totalUnread}
                    </span>
                )}
            </button>

            {/* 바깥 클릭 감지. 화면을 덮지 않는다 —
                채팅을 열어둔 채 작업 목록을 계속 볼 수 있어야 한다 */}
            {open && (
                <div
                    onMouseDown={() => setOpen(false)}
                    style={{ position: "fixed", inset: 0, zIndex: 1700, background: "transparent" }}
                />
            )}

            {/* 서랍 — 화면 끝에 붙이지 않고 한 장 얹는다 */}
            <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    position: "fixed", top: EDGE, right: EDGE, zIndex: 1800,
                    width: `min(${PANEL_W}px, calc(100vw - ${EDGE * 2}px))`,
                    height: `calc(100vh - ${EDGE * 2}px)`,
                    background: PAPER, borderRadius: 14,
                    border: `1px solid ${RULE}`,
                    boxShadow: open
                        ? "0 28px 64px rgba(28,28,32,.18), 0 2px 6px rgba(28,28,32,.06)"
                        : "none",
                    display: "flex", flexDirection: "column", overflow: "hidden",
                    transform: open
                        ? "translateX(0)"
                        : `translateX(${PANEL_W + EDGE * 2}px)`,
                    opacity: open ? 1 : 0,
                    transition: "transform .34s cubic-bezier(.32,.72,0,1), opacity .2s",
                    fontFamily: "inherit",
                }}
            >
                <PanelBody />
            </div>
        </>
    );
}

function PanelBody() {
    const { activeRoomId, canUseRoster } = useChat();
    const [picking, setPicking] = useState(false);

    // 방이 열리면 명단에서 빠져나온다. 이게 없으면 openDmWith 가 방을
    // 열어도 RosterView 가 위에 남는다
    useEffect(() => {
        if (activeRoomId) setPicking(false);
    }, [activeRoomId]);

    if (activeRoomId) return <RoomView />;
    if (picking) return <RosterView onBack={() => setPicking(false)} />;
    return <RoomListView onNew={canUseRoster ? () => setPicking(true) : null} />;
}

// ─────────────────────────────────────────────────────────────
// 방 목록
// ─────────────────────────────────────────────────────────────

function RoomListView({ onNew }: { onNew: (() => void) | null }) {
    const { rooms, openRoom, setOpen, error, clearError } = useChat();
    const { isOnline } = useOnlineUsers();

    return (
        <>
            <Header
                title="메시지"
                right={
                    <>
                        {onNew && <IconBtn label="새 대화" onClick={onNew}>＋</IconBtn>}
                        <IconBtn label="닫기" onClick={() => setOpen(false)}>✕</IconBtn>
                    </>
                }
            />
            {error && <ErrorBar text={error} onClose={clearError} />}

            <div style={{ flex: 1, overflowY: "auto" }}>
                {rooms.length === 0 && (
                    <Empty
                        title="아직 주고받은 대화가 없어요"
                        hint={onNew
                            ? "위의 ＋ 를 눌러 상대를 고르면 대화가 시작됩니다."
                            : "헤더의 접속 중인 담당자 이름을 누르면 대화를 걸 수 있습니다."}
                    />
                )}

                {rooms.map((r) => {
                    const unread = r.unread > 0;
                    return (
                        <button
                            key={r.id}
                            type="button"
                            className="cw-row"
                            onClick={() => openRoom(r.id)}
                            style={{
                                position: "relative",
                                display: "flex", alignItems: "center", gap: 11, width: "100%",
                                padding: "13px 15px 13px 17px", border: "none",
                                borderBottom: `1px solid ${RULE}`,
                                background: "transparent", cursor: "pointer",
                                textAlign: "left", fontFamily: "inherit",
                            }}
                        >
                            {/* 안 읽은 방은 행을 칠하지 않는다. 여백에 잉크 한 줄 */}
                            {unread && (
                                <span style={{
                                    position: "absolute", left: 0, top: 11, bottom: 11,
                                    width: 2, background: MAGENTA,
                                }} />
                            )}

                            <Avatar
                                name={r.title}
                                url={r.peer?.avatarUrl ?? null}
                                online={r.peer ? isOnline(r.peer.userId) : false}
                                channel={r.kind === "channel"}
                            />

                            <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                                    <span style={{
                                        fontWeight: unread ? 750 : 600, color: INK, fontSize: 14,
                                        letterSpacing: "-.015em",
                                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                    }}>
                                        {r.title}
                                    </span>
                                    <span style={{
                                        marginLeft: "auto", flexShrink: 0,
                                        fontFamily: MONO, fontSize: 10.5, color: FAINT,
                                        fontVariantNumeric: "tabular-nums",
                                    }}>
                                        {r.lastAt ? fmtWhen(r.lastAt) : ""}
                                    </span>
                                </span>
                                <span style={{
                                    display: "block", marginTop: 3, fontSize: 12.5,
                                    color: unread ? PENCIL : FAINT,
                                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                                }}>
                                    {r.lastBody ?? "대화를 시작해보세요"}
                                </span>
                            </span>

                            {unread && <Badge n={r.unread} />}
                        </button>
                    );
                })}
            </div>
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// 새 대화 — 명단 (사내만 조회 가능)
// ─────────────────────────────────────────────────────────────

function RosterView({ onBack }: { onBack: () => void }) {
    const { openDmWith, createGroup, busy } = useChat();
    const { isOnline } = useOnlineUsers();
    const [list, setList] = useState<RosterUser[]>([]);
    const [err, setErr] = useState("");
    const [q, setQ] = useState("");

    // 그룹 모드 — 켜면 다중 선택 + 이름 입력이 나타난다
    const [group, setGroup] = useState(false);
    const [picked, setPicked] = useState<Set<string>>(new Set());
    const [name, setName] = useState("");

    useEffect(() => {
        fetchRoster()
            .then((r) => {
                if (r.ok) setList(r.users);
                else setErr(r.message);
            })
            .catch((e) => setErr((e as Error).message));
    }, []);

    const shown = list.filter((u) =>
        u.name.toLowerCase().includes(q.trim().toLowerCase()),
    );

    const toggle = (id: string) => {
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const ready = !!name.trim() && picked.size > 0 && !busy;

    const submit = () => {
        if (!ready) return;
        // 성공하면 openRoom 이 화면을 갈아치우므로 여기서 정리하지 않는다.
        // 실패했을 때 이름과 선택을 지우면 처음부터 다시 골라야 한다
        void createGroup(name, Array.from(picked));
    };

    return (
        <>
            <Header
                title={group ? "그룹 채팅" : "새 대화"}
                left={<IconBtn label="뒤로" onClick={onBack}>‹</IconBtn>}
                right={
                    <button
                        type="button"
                        onClick={() => {
                            setGroup((p) => !p);
                            setPicked(new Set());
                            setName("");
                        }}
                        style={{
                            border: `1px solid ${group ? MAGENTA : RULE}`,
                            background: group ? "#F5E9F7" : "transparent",
                            color: group ? MAGENTA : PENCIL,
                            borderRadius: 8, padding: "5px 10px",
                            fontSize: 11.5, fontWeight: 700, cursor: "pointer",
                            fontFamily: "inherit", flexShrink: 0,
                        }}
                    >
                        그룹
                    </button>
                }
            />

            {err && <Empty title={err} hint="권한이 필요하면 관리자에게 문의하세요." />}

            {!err && (
                <>
                    {group && (
                        <div style={{ padding: "11px 14px 0" }}>
                            <input
                                className="cw-search"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="방 이름"
                                maxLength={40}
                                style={{
                                    width: "100%", padding: "9px 12px", fontSize: 13,
                                    border: `1px solid ${RULE}`, borderRadius: 8,
                                    background: "#F7F6F2", color: INK, fontWeight: 600,
                                    fontFamily: "inherit", boxSizing: "border-box",
                                    transition: "border-color .12s, background .12s",
                                }}
                            />
                        </div>
                    )}

                    <div style={{ padding: group ? "8px 14px 12px" : "11px 14px 12px" }}>
                        <input
                            className="cw-search"
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                            placeholder="이름으로 찾기"
                            style={{
                                width: "100%", padding: "9px 12px", fontSize: 13,
                                border: `1px solid ${RULE}`, borderRadius: 8,
                                background: "#F7F6F2", color: INK,
                                fontFamily: "inherit", boxSizing: "border-box",
                                transition: "border-color .12s, background .12s",
                            }}
                        />
                    </div>

                    <div style={{ flex: 1, overflowY: "auto" }}>
                        {shown.length === 0 && q.trim() && (
                            <Empty
                                title={`'${q.trim()}' 와 맞는 사람이 없어요`}
                                hint="이름 일부만 입력해보세요."
                            />
                        )}

                        {shown.map((u) => {
                            const on = picked.has(u.userId);
                            return (
                                <button
                                    key={u.userId}
                                    type="button"
                                    className="cw-row"
                                    disabled={busy}
                                    onClick={() => {
                                        if (group) toggle(u.userId);
                                        else void openDmWith(u.userId);
                                    }}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 11, width: "100%",
                                        padding: "10px 16px", border: "none",
                                        borderBottom: `1px solid ${RULE}`,
                                        background: "transparent",
                                        cursor: busy ? "wait" : "pointer",
                                        textAlign: "left", fontFamily: "inherit",
                                    }}
                                >
                                    <Avatar name={u.name} url={u.avatarUrl} online={isOnline(u.userId)} />
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{
                                            display: "block", fontWeight: 600, color: INK, fontSize: 14,
                                            letterSpacing: "-.015em",
                                        }}>
                                            {u.name}
                                        </span>
                                        <span style={{
                                            display: "block", marginTop: 2, fontSize: 11.5, color: FAINT,
                                            fontFamily: MONO, letterSpacing: "-.01em",
                                        }}>
                                            {roleLabel(u.role)}
                                            {u.workStatus ? ` · ${u.workStatus}` : ""}
                                        </span>
                                    </span>

                                    {group && (
                                        <span style={{
                                            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                                            border: `1.5px solid ${on ? MAGENTA : RULE}`,
                                            background: on ? MAGENTA : "transparent",
                                            color: "#fff", fontSize: 12, fontWeight: 800,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                        }}>
                                            {on ? "✓" : ""}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>

                    {group && (
                        <div style={{
                            padding: "10px 14px 12px",
                            borderTop: `1px solid ${RULE}`, flexShrink: 0,
                        }}>
                            <button
                                type="button"
                                onClick={submit}
                                disabled={!ready}
                                style={{
                                    width: "100%", padding: "11px", borderRadius: 10,
                                    border: "none",
                                    background: ready ? INK : "#DEDCD6",
                                    color: "#fff", fontWeight: 700, fontSize: 13,
                                    cursor: ready ? "pointer" : "default",
                                    fontFamily: "inherit",
                                }}
                            >
                                {busy ? "만드는 중..."
                                    : picked.size === 0 ? "함께할 사람을 골라주세요"
                                        : !name.trim() ? "방 이름을 입력해주세요"
                                            : `${picked.size}명과 방 만들기`}
                            </button>
                        </div>
                    )}
                </>
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// 대화창
// ─────────────────────────────────────────────────────────────

/** 연속 메시지를 묶기 위한 앞뒤 관계 */
interface Grouped {
    m: ChatMessage;
    newDay: boolean;
    /** 묶음의 첫 줄인가 — 이름을 여기만 붙인다 */
    head: boolean;
    /** 묶음의 마지막 줄인가 — 시각을 여기만 붙인다 */
    tail: boolean;
}

function RoomView() {
    const {
        activeRoom, messages, loadingMessages, myUserId,
        closeRoom, setOpen, send, busy, error, clearError,
    } = useChat();
    const [leaving, setLeaving] = useState(false);
    const [inviting, setInviting] = useState(false);
    const [showingMembers, setShowingMembers] = useState(false);
    /** 라이트박스 — 어느 메시지의 몇 번째 이미지인가 */
    const [lightbox, setLightbox] = useState<{ list: ChatAttachment[]; i: number } | null>(null);
    const isChannel = activeRoom?.kind === "channel";
    const endRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        endRef.current?.scrollIntoView({ block: "end" });
    }, [messages.length]);

    /**
     * 같은 사람이 짧은 간격으로 연달아 보낸 것을 한 덩어리로 본다.
     * 세 줄 보내면 이름이 세 번 뜨던 것을 한 번으로 줄인다.
     */
    const grouped = useMemo<Grouped[]>(() => messages.map((m, i) => {
        const prev = messages[i - 1];
        const next = messages[i + 1];
        const newDay = !prev || dayKey(prev.created_at) !== dayKey(m.created_at);

        const contPrev = !!prev && !newDay
            && prev.author_id === m.author_id
            && gap(prev.created_at, m.created_at) < GROUP_GAP_MS;

        const contNext = !!next
            && dayKey(next.created_at) === dayKey(m.created_at)
            && next.author_id === m.author_id
            && gap(m.created_at, next.created_at) < GROUP_GAP_MS;

        return { m, newDay, head: !contPrev, tail: !contNext };
    }), [messages]);

    return (
        <>
            <Header
                title={activeRoom?.title ?? "대화"}
                left={<IconBtn label="목록으로" onClick={closeRoom}>‹</IconBtn>}
                right={
                    <>
                        {isChannel && (
                            <>
                                <IconBtn label="대화 참여자" onClick={() => setShowingMembers(true)}>
                                    <PeopleIcon />
                                </IconBtn>
                                <IconBtn label="사람 추가" onClick={() => setInviting(true)}>＋</IconBtn>
                            </>
                        )}
                        <IconBtn
                            label={isChannel ? "나가기" : "대화 삭제"}
                            onClick={() => setLeaving(true)}
                        >
                            <ExitIcon />
                        </IconBtn>
                        <IconBtn label="닫기" onClick={() => setOpen(false)}>✕</IconBtn>
                    </>
                }
            />

            {leaving && (
                <LeaveConfirm
                    title={activeRoom?.title ?? "이 대화"}
                    onCancel={() => setLeaving(false)}
                />
            )}
            {inviting && <InviteSheet onClose={() => setInviting(false)} />}
            {showingMembers && (
                <MembersSheet
                    onClose={() => setShowingMembers(false)}
                    onInvite={() => {
                        setShowingMembers(false);
                        setInviting(true);
                    }}
                />
            )}
            {error && <ErrorBar text={error} onClose={clearError} />}

            <div style={{ flex: 1, overflowY: "auto", padding: "0 14px 8px" }}>
                {loadingMessages && <ChatLinesSkeleton count={5} />}
                {!loadingMessages && messages.length === 0 && (
                    <Empty title="여기서 대화가 시작됩니다" hint="아래에 메시지를 입력해 보세요." />
                )}

                {grouped.map(({ m, newDay, head, tail }) => {
                    const mine = m.author_id === myUserId;
                    const hasAtt = (m.attachments?.length ?? 0) > 0;
                    return (
                        <div key={m.id}>
                            {newDay && <DayDivider iso={m.created_at} />}

                            {/* 묶음의 첫 줄에만 이름 */}
                            {head && !mine && (
                                <p style={{
                                    margin: "10px 0 5px 2px", fontSize: 11.5,
                                    fontWeight: 700, color: PENCIL, letterSpacing: "-.01em",
                                }}>
                                    {m.author_name}
                                </p>
                            )}

                            <div style={{
                                display: "flex",
                                justifyContent: mine ? "flex-end" : "flex-start",
                                marginBottom: tail ? 10 : 3,
                                marginTop: head && mine ? 10 : 0,
                                minWidth: 0,
                            }}>
                                {/* ★ minWidth: 0 이 없으면 flex 아이템이 이미지 원본 폭을
                                    최소값으로 잡아 maxWidth 를 무시하고 부푼다 */}
                                <div style={{
                                    maxWidth: "82%", minWidth: 0,
                                    display: "flex", flexDirection: "column",
                                    alignItems: mine ? "flex-end" : "flex-start",
                                }}>
                                    {m.deleted_at ? (
                                        <div style={{
                                            padding: "8px 13px", borderRadius: 13,
                                            background: mine ? MAGENTA : BUBBLE,
                                            color: mine ? "#fff" : "#2A2A2E",
                                            fontSize: 13.5, opacity: .55, fontStyle: "italic",
                                        }}>
                                            삭제된 메시지
                                        </div>
                                    ) : (
                                        <>
                                            {/* 첨부가 먼저. 글은 그 아래 캡션처럼 붙는다 */}
                                            {hasAtt && (
                                                <Attachments
                                                    list={m.attachments!}
                                                    onOpen={(i) =>
                                                        setLightbox({
                                                            list: m.attachments!.filter(isImage),
                                                            i,
                                                        })
                                                    }
                                                />
                                            )}

                                            {!!m.body?.trim() && (
                                                <div style={{
                                                    padding: "8px 13px",
                                                    marginTop: hasAtt ? 4 : 0,
                                                    // 묶음 끝의 바깥쪽 모서리만 각지게 해서
                                                    // 어디까지가 한 덩어리인지 보이게 한다
                                                    borderRadius: 13,
                                                    borderBottomRightRadius: mine && tail ? 4 : 13,
                                                    borderBottomLeftRadius: !mine && tail ? 4 : 13,
                                                    background: mine ? MAGENTA : BUBBLE,
                                                    color: mine ? "#fff" : "#2A2A2E",
                                                    fontSize: 13.5, lineHeight: 1.6,
                                                    whiteSpace: "pre-wrap", wordBreak: "break-word",
                                                    maxWidth: "100%",
                                                }}>
                                                    {m.body}
                                                </div>
                                            )}
                                        </>
                                    )}

                                    {/* 묶음의 마지막 줄에만 시각 */}
                                    {tail && (
                                        <p style={{
                                            margin: "4px 3px 0", fontFamily: MONO,
                                            fontSize: 10, color: FAINT,
                                            fontVariantNumeric: "tabular-nums",
                                            textAlign: mine ? "right" : "left",
                                        }}>
                                            {fmtTime(m.created_at)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
                <div ref={endRef} />
            </div>

            {lightbox && (
                <Lightbox
                    list={lightbox.list}
                    index={lightbox.i}
                    onClose={() => setLightbox(null)}
                />
            )}

            <Composer send={send} busy={busy} />
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// 입력
// ─────────────────────────────────────────────────────────────

function Composer({
                      send, busy,
                  }: {
    send: (body: string, attachments?: ChatAttachment[]) => Promise<void>;
    busy: boolean;
}) {
    const [text, setText] = useState("");
    const [picked, setPicked] = useState<File[]>([]);
    const [uploading, setUploading] = useState(false);
    const [err, setErr] = useState("");

    const addFiles = (list: FileList | null) => {
        const incoming = Array.from(list ?? []);
        if (incoming.length === 0) return;
        setErr("");

        const tooBig = incoming.find((f) => f.size > MAX_ATTACHMENT_BYTES);
        if (tooBig) {
            setErr(`${tooBig.name} 은(는) 20MB 를 넘습니다.`);
            return;
        }
        if (picked.length + incoming.length > MAX_ATTACHMENTS) {
            setErr(`한 번에 ${MAX_ATTACHMENTS}개까지 보낼 수 있습니다.`);
        }
        setPicked([...picked, ...incoming].slice(0, MAX_ATTACHMENTS));
    };

    const submit = async () => {
        const t = text;
        if ((!t.trim() && picked.length === 0) || busy || uploading) return;

        setErr("");
        let atts: ChatAttachment[] = [];

        // 올리는 동안 입력창을 비우지 않는다. 실패하면 그대로 남아야 한다
        if (picked.length > 0) {
            setUploading(true);
            try {
                atts = await Promise.all(picked.map(async (f) => {
                    const { publicUrl } = await uploadToR2("task-files", f);
                    const dim = await measureImage(f);
                    return {
                        url: publicUrl,
                        name: f.name,
                        size: f.size,
                        mime: f.type || "application/octet-stream",
                        ...(dim ?? {}),
                    };
                }));
            } catch (e) {
                setErr(`업로드 실패: ${(e as Error).message}`);
                setUploading(false);
                return;
            }
            setUploading(false);
        }

        setText("");
        setPicked([]);
        await send(t, atts.length > 0 ? atts : undefined);
    };

    const ready = (!!text.trim() || picked.length > 0) && !busy && !uploading;

    return (
        <div style={{ padding: "10px 12px 12px", borderTop: `1px solid ${RULE}` }}>
            {err && (
                <p style={{
                    margin: "0 0 8px", fontSize: 11.5, color: "#B3005E", fontWeight: 600,
                }}>
                    {err}
                </p>
            )}

            {picked.length > 0 && (
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                    {picked.map((f, i) => (
                        <PickedChip
                            key={`${f.name}-${i}`}
                            file={f}
                            onRemove={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                        />
                    ))}
                </div>
            )}

            <div
                className="cw-field"
                style={{
                    display: "flex", alignItems: "center", gap: 4,
                    padding: 5,
                    border: `1px solid ${RULE}`, borderRadius: 12,
                    background: "#F7F6F2",
                    transition: "border-color .14s, background .14s",
                }}
            >
                <label
                    className="cw-icon"
                    title="파일 첨부"
                    style={{
                        width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: PENCIL, cursor: uploading ? "wait" : "pointer",
                        position: "relative",
                        // textarea 가 37px 라 flex-end 로는 위가 비어 보인다.
                        // 아래로 살짝 내려 시각 중심을 맞춘다
                        marginBottom: 3,
                    }}
                >
                    <ClipIcon />
                    <input
                        type="file"
                        multiple
                        disabled={uploading}
                        onChange={(e) => {
                            addFiles(e.target.files);
                            e.target.value = "";
                        }}
                        style={{
                            position: "absolute", inset: 0, opacity: 0,
                            width: "100%", height: "100%", cursor: "pointer",
                        }}
                    />
                </label>

                <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => {
                        // Enter 전송, Shift+Enter 줄바꿈.
                        // 조합 중(IME)에는 무시해야 마지막 글자가 잘리지 않는다
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                            e.preventDefault();
                            void submit();
                        }
                    }}
                    onPaste={(e) => {
                        // 스크린샷을 바로 던질 수 있게
                        if (e.clipboardData.files.length > 0) {
                            e.preventDefault();
                            addFiles(e.clipboardData.files);
                        }
                    }}
                    placeholder={uploading ? "올리는 중..." : "메시지 입력"}
                    rows={1}
                    style={{
                        flex: 1, padding: "8px 4px", fontSize: 13.5, lineHeight: 1.55,
                        resize: "none", border: "none", outline: "none",
                        background: "transparent", color: INK,
                        fontFamily: "inherit", maxHeight: 104, boxSizing: "border-box",
                    }}
                />
                <button
                    type="button"
                    className="cw-send"
                    onClick={() => { void submit(); }}
                    disabled={!ready}
                    aria-label="보내기"
                    style={{
                        width: 34, height: 34, borderRadius: 9, border: "none",
                        background: ready ? MAGENTA : "#DEDCD6",
                        color: "#fff", flexShrink: 0,
                        cursor: ready ? "pointer" : "default",
                        display: "flex", alignItems: "center", justifyContent: "center",
                    }}
                >
                    <PaperPlane size={15} />
                </button>
            </div>
        </div>
    );
}

/** 보내기 전 선택한 파일. 이미지는 로컬 미리보기를 띄운다 */
function PickedChip({ file, onRemove }: { file: File; onRemove: () => void }) {
    const [url, setUrl] = useState<string | null>(null);

    useEffect(() => {
        if (!file.type.startsWith("image/")) return;
        const u = URL.createObjectURL(file);
        setUrl(u);
        return () => URL.revokeObjectURL(u);   // 안 지우면 메모리에 쌓인다
    }, [file]);

    return (
        <span style={{
            position: "relative", display: "inline-flex", alignItems: "center",
            gap: 6, padding: url ? 0 : "6px 9px",
            border: `1px solid ${RULE}`, borderRadius: 8,
            background: "#fff", overflow: "hidden",
        }}>
            {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" style={{
                    width: 52, height: 52, objectFit: "cover", display: "block",
                }} />
            ) : (
                <>
                    <span style={{ fontSize: 13 }}>📄</span>
                    <span style={{
                        maxWidth: 120, fontSize: 11.5, color: PENCIL,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    }}>
                        {file.name}
                    </span>
                </>
            )}
            <button
                type="button"
                onClick={onRemove}
                aria-label="빼기"
                style={{
                    position: "absolute", top: 2, right: 2,
                    width: 16, height: 16, borderRadius: 5, border: "none",
                    background: "rgba(28,28,32,.62)", color: "#fff",
                    fontSize: 10, lineHeight: 1, cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                }}
            >
                ✕
            </button>
        </span>
    );
}

// ─────────────────────────────────────────────────────────────
// 첨부 · 라이트박스
// ─────────────────────────────────────────────────────────────

/**
 * 말풍선 옆의 첨부. 이미지는 격자 썸네일, 그 외는 파일 행.
 *
 * ★ 말풍선 "안"이 아니라 밖이다. 배경이 보라가 아니라 용지색이므로
 *   mine 여부로 색을 가르지 않는다 — 가르면 흰 배경에 흰 글씨가 된다.
 * ★ minWidth: 0 을 모든 겹에 넣는다. 하나라도 빠지면 그 지점에서 넘친다.
 */
function Attachments({
                         list, onOpen,
                     }: {
    list: ChatAttachment[];
    onOpen: (imageIndex: number) => void;
}) {
    const images = list.filter(isImage);
    const files = list.filter((a) => !isImage(a));
    const one = images.length === 1;

    return (
        <div style={{
            display: "flex", flexDirection: "column", gap: 4,
            minWidth: 0, width: "100%",
        }}>
            {images.length > 0 && (
                <div style={{
                    display: "grid",
                    gridTemplateColumns: one ? "1fr" : "1fr 1fr",
                    gap: 3, minWidth: 0, maxWidth: "100%",
                    borderRadius: 13, overflow: "hidden",
                }}>
                    {images.map((a, i) => (
                        <button
                            key={a.url + i}
                            type="button"
                            className="cw-thumb"
                            onClick={() => onOpen(i)}
                            style={{
                                padding: 0, border: "none", background: BUBBLE,
                                // 한 장이면 원본 비율, 여러 장이면 정사각 격자.
                                // 비율을 미리 잡아야 로드 순간 스크롤이 안 튄다
                                aspectRatio: one && a.w && a.h ? `${a.w} / ${a.h}` : "1 / 1",
                                maxHeight: one ? 240 : undefined,
                                width: "100%", minWidth: 0,
                                overflow: "hidden", display: "block",
                            }}
                        >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                                src={a.url}
                                alt={a.name}
                                loading="lazy"
                                style={{
                                    width: "100%", height: "100%",
                                    objectFit: "cover", display: "block",
                                }}
                            />
                        </button>
                    ))}
                </div>
            )}

            {files.map((a, i) => (
                <button
                    key={a.url + i}
                    type="button"
                    className="cw-file"
                    onClick={() => window.open(a.url, "_blank", "noopener,noreferrer")}
                    style={{
                        display: "flex", alignItems: "center", gap: 9,
                        padding: "9px 12px", borderRadius: 12,
                        minWidth: 0, maxWidth: "100%", width: "100%",
                        background: "#fff", border: `1px solid ${RULE}`,
                        cursor: "pointer", textAlign: "left", fontFamily: "inherit",
                    }}
                >
                    <span style={{
                        flexShrink: 0, width: 26, height: 26, borderRadius: 7,
                        background: "#F1EFE9",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13,
                    }}>
                        📄
                    </span>
                    <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{
                            display: "block", fontSize: 12.5, fontWeight: 650, color: INK,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        }}>
                            {a.name}
                        </span>
                        <span style={{
                            display: "block", marginTop: 1, fontFamily: MONO,
                            fontSize: 10, color: FAINT,
                            fontVariantNumeric: "tabular-nums",
                        }}>
                            {fmtBytes(a.size)}
                        </span>
                    </span>
                </button>
            ))}
        </div>
    );
}

/**
 * 이미지 원본 보기. 서랍 안이 아니라 화면 전체에 띄운다 —
 * 380px 서랍 안에서 원본을 보는 건 의미가 없다.
 *
 * zIndex 2100: 서랍(1800)과 모달(2000)보다 위여야 한다.
 */
function Lightbox({
                      list, index, onClose,
                  }: { list: ChatAttachment[]; index: number; onClose: () => void }) {
    const [i, setI] = useState(index);
    const cur = list[i];

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") {
                e.stopPropagation();
                onClose();
            }
            if (e.key === "ArrowLeft") setI((p) => (p - 1 + list.length) % list.length);
            if (e.key === "ArrowRight") setI((p) => (p + 1) % list.length);
        };
        // capture 로 받는다. 안 그러면 ChatWidget 의 Escape 가 먼저 먹어서
        // 라이트박스가 아니라 서랍이 닫힌다
        window.addEventListener("keydown", onKey, true);
        return () => window.removeEventListener("keydown", onKey, true);
    }, [list.length, onClose]);

    if (!cur) return null;

    return (
        <div
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            style={{
                position: "fixed", inset: 0, zIndex: 2100,
                background: "rgba(12,12,14,.92)",
                display: "flex", alignItems: "center", justifyContent: "center",
                padding: 32,
            }}
        >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={cur.url}
                alt={cur.name}
                style={{
                    maxWidth: "100%", maxHeight: "100%",
                    objectFit: "contain", display: "block",
                }}
            />

            <div style={{
                position: "absolute", top: 16, left: 20, right: 20,
                display: "flex", alignItems: "center", gap: 10,
                color: "#fff", pointerEvents: "none",
            }}>
                <span style={{
                    flex: 1, fontSize: 12.5, fontWeight: 600, opacity: .9,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                    {cur.name}
                </span>

                {list.length > 1 && (
                    <span style={{
                        fontFamily: MONO, fontSize: 12, opacity: .7,
                        fontVariantNumeric: "tabular-nums", flexShrink: 0,
                    }}>
                        {i + 1} / {list.length}
                    </span>
                )}

                <button
                    type="button"
                    onClick={(e) => {
                        e.stopPropagation();
                        window.open(cur.url, "_blank", "noopener,noreferrer");
                    }}
                    style={{
                        pointerEvents: "auto", flexShrink: 0,
                        padding: "5px 11px", borderRadius: 8,
                        border: "1px solid rgba(255,255,255,.28)",
                        background: "none", color: "#fff",
                        fontSize: 11.5, fontWeight: 700,
                        cursor: "pointer", fontFamily: "inherit",
                    }}
                >
                    원본
                </button>

                <LightboxBtn label="닫기" onClick={onClose}>✕</LightboxBtn>
            </div>

            {list.length > 1 && (
                <>
                    <LightboxArrow
                        side="left"
                        onClick={() => setI((p) => (p - 1 + list.length) % list.length)}
                    />
                    <LightboxArrow
                        side="right"
                        onClick={() => setI((p) => (p + 1) % list.length)}
                    />
                </>
            )}
        </div>
    );
}

function LightboxBtn({
                         children, onClick, label,
                     }: { children: React.ReactNode; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-label={label}
            style={{
                pointerEvents: "auto", flexShrink: 0,
                width: 30, height: 30, borderRadius: 8,
                border: "1px solid rgba(255,255,255,.28)",
                background: "none", color: "#fff",
                fontSize: 15, lineHeight: 1, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
            }}
        >
            {children}
        </button>
    );
}

function LightboxArrow({
                           side, onClick,
                       }: { side: "left" | "right"; onClick: () => void }) {
    return (
        <button
            type="button"
            onClick={(e) => {
                e.stopPropagation();
                onClick();
            }}
            aria-label={side === "left" ? "이전" : "다음"}
            style={{
                position: "absolute", [side]: 16, top: "50%",
                transform: "translateY(-50%)",
                width: 40, height: 40, borderRadius: 12,
                border: "1px solid rgba(255,255,255,.24)",
                background: "rgba(0,0,0,.35)", color: "#fff",
                fontSize: 18, lineHeight: 1, cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
            }}
        >
            {side === "left" ? "‹" : "›"}
        </button>
    );
}

// ─────────────────────────────────────────────────────────────
// 바텀시트 3종
// ─────────────────────────────────────────────────────────────

/**
 * 나가기 확인. 되돌릴 수 없으므로 무엇이 사라지고 무엇이 남는지
 * 둘 다 적는다 — 상대 쪽은 그대로라는 게 중요한 정보다.
 *
 * 같은 leaveRoom 이지만 채널과 DM 은 사용자에게 전혀 다른 일이다 (5-4 ㉕).
 */
function LeaveConfirm({
                          title, onCancel,
                      }: { title: string; onCancel: () => void }) {
    const { activeRoomId, activeRoom, closeRoom, refreshRooms } = useChat();
    const isChannel = activeRoom?.kind === "channel";
    const [pending, setPending] = useState(false);
    const [err, setErr] = useState("");

    const confirm = async () => {
        if (!activeRoomId) return;
        setErr("");
        setPending(true);
        try {
            const res = await leaveRoom(activeRoomId);
            if (!res.ok) {
                setErr(res.message);
                return;
            }
            closeRoom();
            await refreshRooms();
        } catch (e) {
            setErr((e as Error).message);
        } finally {
            setPending(false);
        }
    };

    return (
        <div
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onCancel();
            }}
            style={{
                position: "absolute", inset: 0, zIndex: 5,
                background: "rgba(28,28,32,.28)",
                display: "flex", alignItems: "flex-end",
            }}
        >
            <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    width: "100%", padding: "18px 18px 16px",
                    background: PAPER, borderTop: `1px solid ${RULE}`,
                    borderRadius: "14px 14px 0 0",
                    boxShadow: "0 -8px 28px rgba(28,28,32,.12)",
                }}
            >
                <p style={{
                    margin: "0 0 6px", fontSize: 14.5, fontWeight: 750,
                    color: INK, letterSpacing: "-.02em",
                }}>
                    {title} {isChannel ? "에서 나갈까요?" : "을 지울까요?"}
                </p>
                <p style={{ margin: "0 0 16px", fontSize: 12.5, color: PENCIL, lineHeight: 1.65 }}>
                    {isChannel
                        ? "이 방에서 나갑니다. 남은 사람들의 대화는 계속되고, 다시 들어오려면 초대를 받아야 합니다. 내가 남긴 말은 지워지지 않습니다."
                        : "내 목록에서 이 대화가 사라집니다. 상대방 화면에는 그대로 남고, 상대가 다시 말을 걸면 대화가 되살아납니다."}
                </p>

                {err && (
                    <p style={{ margin: "0 0 12px", fontSize: 12, color: "#B3005E", fontWeight: 600 }}>
                        {err}
                    </p>
                )}

                <div style={{ display: "flex", gap: 8 }}>
                    <button
                        type="button"
                        onClick={onCancel}
                        disabled={pending}
                        style={{
                            flex: 1, padding: "10px", borderRadius: 9,
                            border: `1px solid ${RULE}`, background: "#fff",
                            color: PENCIL, fontWeight: 700, fontSize: 13,
                            cursor: "pointer", fontFamily: "inherit",
                        }}
                    >
                        취소
                    </button>
                    <button
                        type="button"
                        onClick={() => { void confirm(); }}
                        disabled={pending}
                        style={{
                            flex: 1, padding: "10px", borderRadius: 9,
                            border: "none", background: pending ? "#DEDCD6" : INK,
                            color: "#fff", fontWeight: 700, fontSize: 13,
                            cursor: pending ? "wait" : "pointer", fontFamily: "inherit",
                        }}
                    >
                        {pending
                            ? (isChannel ? "나가는 중..." : "지우는 중...")
                            : (isChannel ? "나가기" : "대화 삭제")}
                    </button>
                </div>
            </div>
        </div>
    );
}

/**
 * 채널에 사람 추가. LeaveConfirm 과 같은 바텀시트 형태로 방 위에 얹는다.
 * 방에 종속된 동작이라 PanelBody 분기로 올리지 않는다.
 */
function InviteSheet({ onClose }: { onClose: () => void }) {
    const { activeRoom, invite, busy } = useChat();
    const { isOnline } = useOnlineUsers();
    const [list, setList] = useState<RosterUser[]>([]);
    const [err, setErr] = useState("");
    const [q, setQ] = useState("");
    const [picked, setPicked] = useState<Set<string>>(new Set());

    const already = useMemo(
        () => new Set(activeRoom?.memberIds ?? []),
        [activeRoom],
    );

    useEffect(() => {
        fetchRoster()
            .then((r) => {
                if (r.ok) setList(r.users);
                else setErr(r.message);
            })
            .catch((e) => setErr((e as Error).message));
    }, []);

    // 이미 있는 사람은 목록에서 뺀다. 남겨두면 눌러도 아무 일이 안 일어난다
    const shown = list.filter((u) =>
        !already.has(u.userId) &&
        u.name.toLowerCase().includes(q.trim().toLowerCase()),
    );

    const toggle = (id: string) => {
        setPicked((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const ready = picked.size > 0 && !busy;

    const submit = () => {
        if (!ready) return;
        void invite(Array.from(picked)).then((ok) => {
            if (ok) onClose();
        });
    };

    return (
        <div
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            style={{
                position: "absolute", inset: 0, zIndex: 5,
                background: "rgba(28,28,32,.28)",
                display: "flex", alignItems: "flex-end",
            }}
        >
            <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    width: "100%", maxHeight: "78%",
                    background: PAPER, borderTop: `1px solid ${RULE}`,
                    borderRadius: "14px 14px 0 0",
                    boxShadow: "0 -8px 28px rgba(28,28,32,.12)",
                    display: "flex", flexDirection: "column", overflow: "hidden",
                }}
            >
                <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "13px 10px 11px 17px",
                    borderBottom: `1px solid ${RULE}`, flexShrink: 0,
                }}>
                    <span style={{
                        flex: 1, fontWeight: 750, fontSize: 14.5, color: INK,
                        letterSpacing: "-.02em",
                    }}>
                        사람 추가
                    </span>
                    <IconBtn label="닫기" onClick={onClose}>✕</IconBtn>
                </div>

                {err && <Empty title={err} hint="권한이 필요하면 관리자에게 문의하세요." />}

                {!err && (
                    <>
                        <div style={{ padding: "11px 14px 10px", flexShrink: 0 }}>
                            <input
                                className="cw-search"
                                value={q}
                                onChange={(e) => setQ(e.target.value)}
                                placeholder="이름으로 찾기"
                                style={{
                                    width: "100%", padding: "9px 12px", fontSize: 13,
                                    border: `1px solid ${RULE}`, borderRadius: 8,
                                    background: "#F7F6F2", color: INK,
                                    fontFamily: "inherit", boxSizing: "border-box",
                                    transition: "border-color .12s, background .12s",
                                }}
                            />
                        </div>

                        <div style={{ flex: 1, overflowY: "auto", minHeight: 90 }}>
                            {shown.length === 0 && (
                                <Empty
                                    title={q.trim()
                                        ? `'${q.trim()}' 와 맞는 사람이 없어요`
                                        : "더 초대할 사람이 없어요"}
                                    hint={q.trim() ? "이름 일부만 입력해보세요." : undefined}
                                />
                            )}

                            {shown.map((u) => {
                                const on = picked.has(u.userId);
                                return (
                                    <button
                                        key={u.userId}
                                        type="button"
                                        className="cw-row"
                                        disabled={busy}
                                        onClick={() => toggle(u.userId)}
                                        style={{
                                            display: "flex", alignItems: "center", gap: 11, width: "100%",
                                            padding: "10px 16px", border: "none",
                                            borderBottom: `1px solid ${RULE}`,
                                            background: "transparent",
                                            cursor: busy ? "wait" : "pointer",
                                            textAlign: "left", fontFamily: "inherit",
                                        }}
                                    >
                                        <Avatar name={u.name} url={u.avatarUrl} online={isOnline(u.userId)} size={34} />
                                        <span style={{ flex: 1, minWidth: 0 }}>
                                            <span style={{
                                                display: "block", fontWeight: 600, color: INK, fontSize: 13.5,
                                                letterSpacing: "-.015em",
                                            }}>
                                                {u.name}
                                            </span>
                                            <span style={{
                                                display: "block", marginTop: 2, fontSize: 11, color: FAINT,
                                                fontFamily: MONO, letterSpacing: "-.01em",
                                            }}>
                                                {roleLabel(u.role)}
                                                {u.workStatus ? ` · ${u.workStatus}` : ""}
                                            </span>
                                        </span>
                                        <span style={{
                                            width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                                            border: `1.5px solid ${on ? MAGENTA : RULE}`,
                                            background: on ? MAGENTA : "transparent",
                                            color: "#fff", fontSize: 12, fontWeight: 800,
                                            display: "flex", alignItems: "center", justifyContent: "center",
                                        }}>
                                            {on ? "✓" : ""}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>

                        <div style={{
                            padding: "10px 14px 14px",
                            borderTop: `1px solid ${RULE}`, flexShrink: 0,
                        }}>
                            <button
                                type="button"
                                onClick={submit}
                                disabled={!ready}
                                style={{
                                    width: "100%", padding: "11px", borderRadius: 10,
                                    border: "none",
                                    background: ready ? INK : "#DEDCD6",
                                    color: "#fff", fontWeight: 700, fontSize: 13,
                                    cursor: ready ? "pointer" : "default",
                                    fontFamily: "inherit",
                                }}
                            >
                                {busy ? "추가하는 중..."
                                    : picked.size === 0 ? "추가할 사람을 골라주세요"
                                        : `${picked.size}명 추가`}
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

/**
 * 대화 참여자. 지금 방에 있는 사람만 보여준다.
 *
 * 나간 사람은 chat_room_members 에서 행이 지워지므로 흔적이 없다.
 * 남기려면 left_at 소프트 삭제가 필요하고 그건 is_room_member() 를
 * 건드리는 일이라 별도로 다룬다 (11절).
 */
function MembersSheet({
                          onClose, onInvite,
                      }: { onClose: () => void; onInvite: () => void }) {
    const { activeRoomId } = useChat();
    const { isOnline } = useOnlineUsers();
    const [members, setMembers] = useState<RoomMember[]>([]);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!activeRoomId) return;
        fetchRoomMembers(activeRoomId)
            .then((r) => {
                if (r.ok) setMembers(r.members);
                else setErr(r.message);
            })
            .catch((e) => setErr((e as Error).message))
            .finally(() => setLoading(false));
    }, [activeRoomId]);

    return (
        <div
            onMouseDown={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            style={{
                position: "absolute", inset: 0, zIndex: 5,
                background: "rgba(28,28,32,.28)",
                display: "flex", alignItems: "flex-end",
            }}
        >
            <div
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                    width: "100%", maxHeight: "78%",
                    background: PAPER, borderTop: `1px solid ${RULE}`,
                    borderRadius: "14px 14px 0 0",
                    boxShadow: "0 -8px 28px rgba(28,28,32,.12)",
                    display: "flex", flexDirection: "column", overflow: "hidden",
                }}
            >
                <div style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "13px 10px 11px 17px",
                    borderBottom: `1px solid ${RULE}`, flexShrink: 0,
                }}>
                    <span style={{
                        flex: 1, fontWeight: 750, fontSize: 14.5, color: INK,
                        letterSpacing: "-.02em",
                    }}>
                        대화 참여자
                        {members.length > 0 && (
                            <span style={{
                                marginLeft: 7, fontFamily: MONO, fontSize: 12,
                                fontWeight: 600, color: FAINT,
                                fontVariantNumeric: "tabular-nums",
                            }}>
                                {members.length}
                            </span>
                        )}
                    </span>
                    <IconBtn label="닫기" onClick={onClose}>✕</IconBtn>
                </div>

                {loading && <PeopleRowsSkeleton rows={4} />}

                {!loading && err && <Empty title={err} hint="방을 다시 열어보세요." />}

                {!loading && !err && (
                    <>
                        <div style={{ flex: 1, overflowY: "auto" }}>
                            {members.map((u) => (
                                <div
                                    key={u.userId}
                                    style={{
                                        display: "flex", alignItems: "center", gap: 11,
                                        padding: "10px 16px",
                                        borderBottom: `1px solid ${RULE}`,
                                    }}
                                >
                                    <Avatar
                                        name={u.name}
                                        url={u.avatarUrl}
                                        online={isOnline(u.userId)}
                                        size={34}
                                    />
                                    <span style={{ flex: 1, minWidth: 0 }}>
                                        <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                            <span style={{
                                                fontWeight: 600, color: INK, fontSize: 13.5,
                                                letterSpacing: "-.015em",
                                                overflow: "hidden", textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}>
                                                {u.name}
                                            </span>
                                            {u.isMe && <Tag text="나" />}
                                            {u.isOwner && <Tag text="개설" />}
                                        </span>
                                        <span style={{
                                            display: "block", marginTop: 2, fontSize: 11, color: FAINT,
                                            fontFamily: MONO, letterSpacing: "-.01em",
                                        }}>
                                            {roleLabel(u.role)}
                                        </span>
                                    </span>
                                </div>
                            ))}
                        </div>

                        <div style={{
                            padding: "10px 14px 14px",
                            borderTop: `1px solid ${RULE}`, flexShrink: 0,
                        }}>
                            <button
                                type="button"
                                onClick={onInvite}
                                style={{
                                    width: "100%", padding: "11px", borderRadius: 10,
                                    border: `1px solid ${RULE}`, background: "#fff",
                                    color: PENCIL, fontWeight: 700, fontSize: 13,
                                    cursor: "pointer", fontFamily: "inherit",
                                }}
                            >
                                ＋ 사람 추가
                            </button>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 아이콘
// ─────────────────────────────────────────────────────────────

export function PaperPlane({ size = 22 }: { size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round">
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22l-4-9-9-4 20-7z" />
        </svg>
    );
}

function ClipIcon() {
    return (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round">
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
    );
}

function PeopleIcon() {
    return (
        <svg width={16} height={16} viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    );
}

function ExitIcon() {
    return (
        <svg width={15} height={15} viewBox="0 0 24 24" fill="none"
             stroke="currentColor" strokeWidth={2}
             strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <path d="m16 17 5-5-5-5" />
            <path d="M21 12H9" />
        </svg>
    );
}

// ─────────────────────────────────────────────────────────────
// 조각
// ─────────────────────────────────────────────────────────────

/**
 * 아바타. 원이 아니라 모서리 둥근 사각이다 —
 * 종이와 판(plate)은 직사각이고, 모든 채팅앱이 원형이라 여기서만 달라진다.
 */
function Avatar({
                    name, url, online, channel = false, size = 38,
                }: {
    name: string; url: string | null; online: boolean; channel?: boolean; size?: number;
}) {
    return (
        <span style={{ position: "relative", flexShrink: 0 }}>
            <span style={{
                display: "flex", alignItems: "center", justifyContent: "center",
                width: size, height: size, borderRadius: 11, overflow: "hidden",
                background: channel ? "#F5E9F7" : "#EFEDE7",
                color: channel ? MAGENTA : "#75736D",
                fontSize: Math.round(size * .38), fontWeight: 700,
                letterSpacing: "-.02em",
            }}>
                {channel ? "#" : url ? (
                    // next/image 를 안 쓴다 — R2·외부 도메인이 next.config 에
                    // 등록돼 있지 않으면 런타임에 터진다
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : initial(name)}
            </span>
            {!channel && online && (
                <span style={{
                    position: "absolute", right: -3, bottom: -3, width: 9, height: 9,
                    borderRadius: 3, background: GREEN,
                    border: `2.5px solid ${PAPER}`, boxSizing: "content-box",
                }} />
            )}
        </span>
    );
}

function Header({
                    title, left, right,
                }: { title: string; left?: React.ReactNode; right?: React.ReactNode }) {
    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 6,
            padding: left ? "11px 10px 11px 7px" : "11px 10px 11px 17px",
            borderBottom: `1px solid ${RULE}`, flexShrink: 0,
        }}>
            {left}
            <span style={{
                flex: 1, fontWeight: 750, fontSize: 15.5, color: INK,
                letterSpacing: "-.025em",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
            }}>
                {title}
            </span>
            {right}
        </div>
    );
}

function IconBtn({
                     children, onClick, label,
                 }: { children: React.ReactNode; onClick: () => void; label: string }) {
    return (
        <button
            type="button"
            className="cw-icon"
            onClick={onClick}
            aria-label={label}
            title={label}
            style={{
                width: 30, height: 30, borderRadius: 8, flexShrink: 0,
                border: "none", background: "none", color: PENCIL,
                fontSize: 17, lineHeight: 1, cursor: "pointer", fontFamily: "inherit",
                display: "flex", alignItems: "center", justifyContent: "center",
            }}
        >
            {children}
        </button>
    );
}

function Badge({ n }: { n: number }) {
    return (
        <span style={{
            minWidth: 20, height: 19, padding: "0 6px", borderRadius: 6,
            background: MAGENTA, color: "#fff",
            fontFamily: MONO, fontSize: 11, fontWeight: 700,
            fontVariantNumeric: "tabular-nums",
            display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}>
            {n > 99 ? "99+" : n}
        </span>
    );
}

function Tag({ text }: { text: string }) {
    return (
        <span style={{
            flexShrink: 0, padding: "1px 6px", borderRadius: 5,
            border: `1px solid ${RULE}`, background: "#F4F2EC",
            color: PENCIL, fontSize: 10, fontWeight: 700,
            letterSpacing: "-.01em",
        }}>
            {text}
        </span>
    );
}

/** 빈 화면은 상태만 알리지 않고 다음 행동을 가리킨다 */
function Empty({ title, hint }: { title: string; hint?: string }) {
    return (
        <div style={{ padding: "56px 30px", textAlign: "center" }}>
            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 650, color: PENCIL }}>
                {title}
            </p>
            {hint && (
                <p style={{ margin: "8px 0 0", fontSize: 12.5, color: FAINT, lineHeight: 1.65 }}>
                    {hint}
                </p>
            )}
        </div>
    );
}

function ErrorBar({ text, onClose }: { text: string; onClose: () => void }) {
    return (
        <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "9px 10px 9px 16px", background: "#FDF2F5",
            borderBottom: "1px solid #F5C6D5", color: "#B3005E",
            fontSize: 12.5, fontWeight: 600,
        }}>
            <span style={{ flex: 1 }}>{text}</span>
            <button
                type="button"
                onClick={onClose}
                aria-label="닫기"
                style={{
                    border: "none", background: "none", cursor: "pointer",
                    color: "#B3005E", fontSize: 15, lineHeight: 1,
                    padding: "2px 6px", fontFamily: "inherit", flexShrink: 0,
                }}
            >
                ✕
            </button>
        </div>
    );
}

/**
 * 날짜 구분선. 괘선 사이에 날짜를 끼운다 — 교정지의 구간 표시.
 * 날짜는 실제로 순서가 있는 정보라 이 장치가 내용을 반영한다.
 */
function DayDivider({ iso }: { iso: string }) {
    return (
        <div style={{
            position: "sticky", top: 0, zIndex: 1,
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 0 10px", background: PAPER,
            pointerEvents: "none",
        }}>
            <span style={{ flex: 1, height: 1, background: RULE }} />
            <span style={{
                fontFamily: MONO, fontSize: 10.5, fontWeight: 600,
                color: FAINT, letterSpacing: ".02em",
                fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap",
            }}>
                {fmtDay(iso)}
            </span>
            <span style={{ flex: 1, height: 1, background: RULE }} />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 유틸
// ─────────────────────────────────────────────────────────────

/** 이름 앞의 [CS] [외주] 같은 접두어를 벗기고 첫 글자만 */
function initial(name: string) {
    return name.replace(/^\[[^\]]*\]\s*/, "").charAt(0) || "?";
}

function roleLabel(role: string) {
    return role === "admin" ? "관리자"
        : role === "designer" ? "디자이너"
            : role === "cs" ? "CS"
                : role === "outsourcing" ? "외주" : role;
}

function gap(a: string, b: string) {
    return new Date(b).getTime() - new Date(a).getTime();
}

function pad(n: number) {
    return String(n).padStart(2, "0");
}

function fmtTime(iso: string) {
    const d = new Date(iso);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 방 목록용 — 오늘이면 시각, 아니면 날짜 */
function fmtWhen(iso: string) {
    const d = new Date(iso);
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? fmtTime(iso) : `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`;
}

function dayKey(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function fmtDay(iso: string) {
    const d = new Date(iso);
    const w = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
    return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${w}`;
}