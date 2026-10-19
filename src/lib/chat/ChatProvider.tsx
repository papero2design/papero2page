// src/lib/chat/ChatProvider.tsx
"use client";

import {
    createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { useChatStream } from "@/lib/hooks/useChatStream";
import {
    fetchMyRooms, fetchRoomMessages, sendChatMessage, openDirectMessage,
    createChannel, inviteToRoom, markRoomRead,
    type ChatRoom, type ChatMessage, ChatAttachment,
} from "./actions";

interface ChatContextValue {
    rooms: ChatRoom[];
    totalUnread: number;

    open: boolean;
    setOpen: (v: boolean) => void;
    toggle: () => void;

    activeRoomId: string | null;
    activeRoom: ChatRoom | null;
    messages: ChatMessage[];
    loadingMessages: boolean;

    myUserId: string | null;

    openRoom: (roomId: string) => void;
    closeRoom: () => void;
    /** 프로필 팝오버의 "대화하기". 방을 찾거나 만들고 바로 연다 */
    openDmWith: (peerUserId: string) => Promise<void>;
    /** 채널 생성. 성공하면 방을 열고 true */
    createGroup: (name: string, memberIds: string[]) => Promise<boolean>;
    invite: (memberIds: string[]) => Promise<boolean>;
    send: (body: string, attachments?: ChatAttachment[]) => Promise<void>;
    refreshRooms: () => Promise<void>;

    error: string;
    clearError: () => void;
    busy: boolean;

    canUseRoster: boolean;
}

const ChatContext = createContext<ChatContextValue | null>(null);

export function ChatProvider({
                                 myUserId,
                                 canUseRoster = false,
                                 children,
                                 debug = false,
                             }: {
    myUserId: string | null;
    canUseRoster?: boolean;
    children: React.ReactNode;
    debug?: boolean;
}) {

    const [rooms, setRooms] = useState<ChatRoom[]>([]);
    const [open, setOpen] = useState(false);
    const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    // 실시간 콜백에서 읽어야 하므로 ref 로도 들고 있는다.
    // state 를 직접 읽으면 마운트 시점의 낡은 값을 붙잡는다 (v5 문서 7-2)
    const activeRoomIdRef = useRef<string | null>(null);
    activeRoomIdRef.current = activeRoomId;
    const openRef = useRef(false);
    openRef.current = open;

    const roomCountRef = useRef(0);
    const resubscribeRef = useRef<(() => void | null)>(null);
    const refreshRooms = useCallback(async () => {
        if (!myUserId) return;
        try {
            const next = await fetchMyRooms();
            const grew = next.length > roomCountRef.current;
            roomCountRef.current = next.length;
            setRooms(next);
            if (grew) resubscribeRef.current?.();
        } catch (e) {
            setError((e as Error).message);
        }
    }, [myUserId]);

    useEffect(() => {
        void refreshRooms();
    }, [refreshRooms]);

    const loadMessages = useCallback(async (roomId: string) => {
        setLoadingMessages(true);
        try {
            setMessages(await fetchRoomMessages(roomId));
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setLoadingMessages(false);
        }
    }, []);

    // 방 목록 갱신을 몰아서 한 번만
    const roomTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const scheduleRoomRefresh = useCallback(() => {
        if (roomTimer.current) clearTimeout(roomTimer.current);
        roomTimer.current = setTimeout(() => {
            roomTimer.current = null;
            void refreshRooms();
        }, 300);
    }, [refreshRooms]);

    // 열린 방을 보고 있는 동안 도착하면 읽음 처리.
    // 매 메시지마다 서버를 때리지 않도록 살짝 묶는다.
    // ★ useChatStream 보다 위에 선언해야 한다. 아래에 두면 콜백이
    //   아직 만들어지지 않은 값을 참조한다
    const readTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const markReadSoon = useCallback((roomId: string) => {
        if (readTimer.current) clearTimeout(readTimer.current);
        readTimer.current = setTimeout(() => {
            readTimer.current = null;
            void markRoomRead(roomId).catch(() => {});
        }, 600);
    }, []);

    const {resubscribe} = useChatStream({
        debug,
        enabled: !!myUserId,
        onMessage: (m) => {
            if (m.room_id === activeRoomIdRef.current) {
                // 열려 있는 방 → 배열 끝에 붙인다.
                // id 로 중복을 막는다. 내가 보낸 것도 실시간으로 돌아오므로
                // 낙관적 업데이트를 하지 않고 이 경로 하나만 쓴다
                setMessages((prev) =>
                    prev.some((x) => x.id === m.id) ? prev : [...prev, m],
                );
                if (openRef.current) markReadSoon(m.room_id);
            }
            scheduleRoomRefresh();   // 안 읽은 수·미리보기 갱신
        },
        onReconnect: () => {
            void refreshRooms();
            const rid = activeRoomIdRef.current;
            if (rid) void loadMessages(rid);
        },
    });

    resubscribeRef.current = resubscribe;

    const openRoom = useCallback((roomId: string) => {
        setActiveRoomId(roomId);
        setMessages([]);
        setOpen(true);
        void loadMessages(roomId).then(() => {
            void refreshRooms();
        });
    }, [loadMessages, refreshRooms]);

    const closeRoom = useCallback(() => {
        setActiveRoomId(null);
        setMessages([]);
        void refreshRooms();
    }, [refreshRooms]);

    const openDmWith = useCallback(async (peerUserId: string) => {
        setError("");
        setBusy(true);
        try {
            const res = await openDirectMessage(peerUserId);
            if (!res.ok) {
                setError(res.message);   // 서랍의 ErrorBar 로 간다
                setOpen(true);
                return;
            }
            await refreshRooms();
            // 방금 만들어진 방은 실시간 권한 캐시에 없다
            resubscribe();
            openRoom(res.roomId);
        } catch (e) {
            setError((e as Error).message);
            setOpen(true);
        } finally {
            setBusy(false);
        }
    }, [refreshRooms, resubscribe, openRoom]);

    const createGroup = useCallback(async (
        name: string, memberIds: string[],
    ): Promise<boolean> => {
        setError("");
        setBusy(true);
        try {
            const res = await createChannel(name, memberIds);
            if (!res.ok) {
                setError(res.message);
                return false;
            }
            await refreshRooms();
            resubscribe();          // 방금 만든 방은 권한 캐시에 없다 (9-2)
            openRoom(res.roomId);
            return true;
        } catch (e) {
            setError((e as Error).message);
            return false;
        } finally {
            setBusy(false);
        }
    }, [refreshRooms, resubscribe, openRoom]);

    const invite = useCallback(async (memberIds: string[]): Promise<boolean> => {
        const rid = activeRoomIdRef.current;
        if (!rid || memberIds.length === 0) return false;
        setError("");
        setBusy(true);
        try {
            const res = await inviteToRoom(rid, memberIds);
            if (!res.ok) {
                setError(res.message);
                return false;
            }
            await refreshRooms();   // memberIds 갱신 — 다시 초대창을 열 때 반영된다
            return true;
        } catch (e) {
            setError((e as Error).message);
            return false;
        } finally {
            setBusy(false);
        }
    }, [refreshRooms]);

    const send = useCallback(async (
        body: string, attachments?: ChatAttachment[],
    ) => {
        const rid = activeRoomIdRef.current;
        if (!rid) return;
        if (!body.trim() && (attachments?.length ?? 0) === 0) return;
        setError("");
        setBusy(true);
        try {
            const res = await sendChatMessage(rid, body, attachments);
            if (!res.ok) {
                setError(res.message);
                return;
            }
            // 실시간이 끊겨 있어도 내 메시지는 보여야 한다.
            // 중복은 id 로 걸러지므로 실시간과 겹쳐도 안전하다
            setMessages(await fetchRoomMessages(rid));
            void refreshRooms();
        } catch (e) {
            setError((e as Error).message);
        } finally {
            setBusy(false);
        }
    }, [refreshRooms]);

    // 탭 복귀 시 한 번 확인 — 실시간이 끊긴 동안의 구멍을 메운다
    useEffect(() => {
        if (!myUserId) return;
        const onVisible = () => {
            if (document.visibilityState !== "visible") return;
            void refreshRooms();
            const rid = activeRoomIdRef.current;
            if (rid) void loadMessages(rid);
        };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);
        return () => {
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
        };
    }, [myUserId, refreshRooms, loadMessages]);

    const totalUnread = rooms.reduce((s, r) => s + r.unread, 0);
    const activeRoom = rooms.find((r) => r.id === activeRoomId) ?? null;

    return (
        <ChatContext.Provider
            value={{
                rooms, totalUnread,
                open, setOpen, toggle: () => setOpen((p) => !p),
                activeRoomId, activeRoom, messages, loadingMessages,
                myUserId, canUseRoster,
                openRoom, closeRoom, openDmWith, createGroup, invite, send, refreshRooms,
                error, clearError: () => setError(""), busy,
            }}
        >
            {children}
        </ChatContext.Provider>
    );
}

export function useChat() {
    const ctx = useContext(ChatContext);
    if (!ctx) throw new Error("useChat 은 ChatProvider 안에서만 쓸 수 있습니다.");
    return ctx;
}

/** Provider 밖에서도 안전하게 쓰고 싶을 때 (없으면 null) */
export function useChatOptional() {
    return useContext(ChatContext);
}
