// src/lib/alerts/OutsourcingAlertProvider.tsx
"use client";

import {
    createContext, useCallback, useContext, useEffect, useRef, useState,
} from "react";
import { useOutsourcingMessageStream } from "@/lib/hooks/useOutsourcingMessageStream";

/** 실시간으로 도착한 외주 메시지 한 건 */
export interface IncomingMessage {
    task_id: string;
    kind: string;
    round: number;
}

interface AlertContextValue {
    /** 마지막으로 도착한 메시지. 화면마다 처리 방식이 달라 원본을 그대로 준다 */
    last: IncomingMessage | null;
    /** 도착할 때마다 올라간다. 이 값을 effect 의존성에 넣으면 재로드가 걸린다 */
    bump: number;
    /** 재연결 시 올라간다. 끊긴 동안 놓친 것을 확인할 때 쓴다 */
    reconnectBump: number;
}

const AlertContext = createContext<AlertContextValue>({
    last: null,
    bump: 0,
    reconnectBump: 0,
});

/**
 * 사내 화면의 외주 알림.
 *
 * ★ 채널은 여기서 한 번만 연다. 화면에서 useOutsourcingMessageStream 을
 *   다시 부르면 채널이 두 개가 되고 같은 메시지가 두 번 도착한다.
 *   Presence 의 usePresence 와 같은 규칙 (8-1).
 *
 * 레이아웃에 두므로 /board 아래 어느 페이지에 있든 잡힌다.
 * 이전에는 OutsourcingBoardClient 안에 있어서 그 화면에 머물러야만 왔다.
 */
export function OutsourcingAlertProvider({
                                             children,
                                             debug = false,
                                         }: {
    children: React.ReactNode;
    debug?: boolean;
}) {
    const [last, setLast] = useState<IncomingMessage | null>(null);
    const [bump, setBump] = useState(0);
    const [reconnectBump, setReconnectBump] = useState(0);

    useOutsourcingMessageStream({
        from: "outsourcing",   // 외주가 보낸 것만. 내가 보낸 건 안 온다
        debug,
        onMessage: (m) => {
            setLast({ task_id: m.task_id, kind: m.kind, round: m.round });
            setBump((n) => n + 1);
        },
        onReconnect: () => { setReconnectBump((n) => n + 1); },
    });

    return (
        <AlertContext.Provider value={{ last, bump, reconnectBump }}>
            {children}
        </AlertContext.Provider>
    );
}

export function useOutsourcingAlert() {
    return useContext(AlertContext);
}