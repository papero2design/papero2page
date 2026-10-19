// src/lib/presence/PresenceProvider.tsx
"use client";

import { createContext, useContext } from "react";
import { usePresence, type PresenceUser } from "@/lib/hooks/usePresence";

interface PresenceContextValue {
    /** 지금 접속 중인 사람들. key = userId */
    online: Record<string, PresenceUser>;
    isOnline: (userId: string) => boolean;
    /** 나를 포함한 접속자 수 */
    count: number;
    /** 나 (로그인 안 됐으면 null) */
    me: PresenceUser | null;
}

const PresenceContext = createContext<PresenceContextValue>({
    online: {},
    isOnline: () => false,
    count: 0,
    me: null,
});

/**
 * 접속 상태 채널을 앱당 한 번만 연다.
 *
 * 레이아웃에서 서버가 me 를 만들어 넘긴다 (lib/presence/server.ts).
 * 화면 컴포넌트는 useOnlineUsers() 로 꺼내 쓴다 — 훅을 다시 부르지 말 것.
 */
export function PresenceProvider({
    me,
    children,
    debug = false,
}: {
    me: PresenceUser | null;
    children: React.ReactNode;
    debug?: boolean;
}) {
    const { online, isOnline, count } = usePresence(me, debug);

    return (
        <PresenceContext.Provider value={{ online, isOnline, count, me }}>
            {children}
        </PresenceContext.Provider>
    );
}

/** 어디서든 접속자 목록을 꺼낸다. Provider 밖이면 전부 오프라인으로 나온다. */
export function useOnlineUsers() {
    return useContext(PresenceContext);
}
