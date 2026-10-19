// src/lib/hooks/useChatStream.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ChatMessage } from "@/lib/chat/actions";

interface Options {
    /** 내가 볼 수 있는 방에 새 메시지가 도착했을 때 */
    onMessage: (m: ChatMessage) => void;
    onReconnect?: () => void;
    enabled?: boolean;
    debug?: boolean;
}

/**
 * chat_messages 의 새 메시지를 실시간으로 받는다.
 *
 * ★ 방마다 채널을 열지 않는다. 테이블 전체를 구독해도
 *   chat_messages_select 정책(is_room_member)이 배달 전에 걸러주므로
 *   내가 속한 방의 메시지만 도착한다.
 *
 * ★ 구독 전에 realtime.setAuth() 로 토큰을 넘긴다.
 *   안 하면 anon 으로 붙어 SUBSCRIBED 인 채로 아무것도 안 온다 (v5 문서 5-2 ⑮).
 *
 * ★ 권한 캐시 — Realtime 은 접속 시점에 접근 정책을 캐시한다.
 *   누군가 나를 새 방에 초대해도 내가 이미 접속 중이면 그 방 메시지가 안 온다.
 *   resubscribe() 로 채널을 다시 열어야 새 권한이 반영된다.
 */
export function useChatStream({
                                  onMessage,
                                  onReconnect,
                                  enabled = true,
                                  debug = false,
                              }: Options) {
    const onMessageRef = useRef(onMessage);
    const onReconnectRef = useRef(onReconnect);
    useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);
    useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);

    const hasConnectedBefore = useRef(false);

    /** 값이 바뀌면 effect 가 다시 돌아 채널을 새로 연다 */
    const [nonce, setNonce] = useState(0);
    const resubscribe = useCallback(() => setNonce((n) => n + 1), []);

    useEffect(() => {
        if (!enabled) return;

        const supabase = createClient();
        let channel: ReturnType<typeof supabase.channel> | null = null;
        let cancelled = false;

        const log = (...args: unknown[]) => { if (debug) console.log("[Chat]", ...args); };

        (async () => {
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            log("세션", token ? "있음" : "없음 ← anon 으로 붙는다");
            if (token) supabase.realtime.setAuth(token);
            if (cancelled) return;

            channel = supabase
                .channel(`chat-messages:${nonce}`)
                .on(
                    "postgres_changes",
                    { event: "INSERT", schema: "public", table: "chat_messages" },
                    (payload) => {
                        const row = payload.new as ChatMessage;
                        log("수신", row.room_id, row.author_name);
                        onMessageRef.current(row);
                    },
                )
                .subscribe((status) => {
                    log("상태", status);
                    if (status !== "SUBSCRIBED") return;
                    if (hasConnectedBefore.current) onReconnectRef.current?.();
                    hasConnectedBefore.current = true;
                });
        })();

        const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
            if (session?.access_token) supabase.realtime.setAuth(session.access_token);
        });

        return () => {
            cancelled = true;
            sub.subscription.unsubscribe();
            if (channel) supabase.removeChannel(channel);
        };
    }, [enabled, debug, nonce]);

    return { resubscribe };
}
