"use client";

import { useEffect, useRef, useState} from "react";
import { createClient } from "@/lib/supabase/client";
import type { OutsourcingMessage, MessageSide } from "@/types/database";

interface Options {
    from: MessageSide;

    onMessage: (message: OutsourcingMessage) => void;


    onReconnect?: () => void;

    enabled?: boolean;

    /** true 면 콘솔에 진단 로그를 찍는다 */
    debug?: boolean;
}

export function useOutsourcingMessageStream({
                                                from,
                                                onMessage,
                                                onReconnect,
                                                enabled = true,
                                                debug = false,
                                            }: Options) {
    const [connected, setConnected] = useState(false);

    // v4 문서 5-1 ⑧ 재발 방지. 콜백은 ref 로 받고 의존성에서 뺀다.
    const onMessageRef = useRef(onMessage);
    const onReconnectRef = useRef(onReconnect);
    useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
    useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);

    const hasConnectedBefore = useRef(false);

    useEffect(() => {
        if (!enabled) return;

        const supabase = createClient();
        let channel: ReturnType<typeof supabase.channel> | null = null;
        let cancelled = false;

        const log = (...args: unknown[]) => {
            if (debug) console.log("[RT]", ...args);
        };

        (async () => {
            // ① 토큰 확보 후 실시간 연결에 넘긴다 (이 순서가 핵심)
            const { data, error } = await supabase.auth.getSession();
            if (error) log("세션 조회 실패", error.message);

            const token = data.session?.access_token;
            log("세션", token ? "있음" : "없음 ← 이러면 anon 으로 붙어 아무것도 안 온다");
            if (token) supabase.realtime.setAuth(token);

            if (cancelled) return;

            // ② 그다음에 구독
            channel = supabase
                .channel(`outsourcing-messages:${from}`)
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "outsourcing_messages" },
                    (payload) => {
                        const row = payload.new as OutsourcingMessage;
                        log("수신", row.side, row.task_id, "| 원하는 side:", from);
                        if (row.side !== from) return;   // 내가 보낸 것은 무시
                        onMessageRef.current(row);
                    },
                )
                .subscribe((status) => {
                    log("상태", status);
                    if (status === "SUBSCRIBED") {
                        setConnected(true);
                        if (hasConnectedBefore.current) onReconnectRef.current?.();
                        hasConnectedBefore.current = true;
                        return;
                    }
                    setConnected(false);
                });
        })();

        // ③ 토큰이 갱신되면 실시간 연결에도 알려준다.
        //    안 하면 JWT 만료 시점에 조용히 끊긴다.
        const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
            if (session?.access_token) supabase.realtime.setAuth(session.access_token);
        });

        return () => {
            cancelled = true;
            sub.subscription.unsubscribe();
            if (channel) supabase.removeChannel(channel);
        };
        // 콜백은 의존성에 넣지 않는다 (⑧ 참고)
    }, [from, enabled, debug]);

    return { connected };
}