// src/lib/hooks/useTaskStream.ts
"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

interface Options {
    /**
     * 내가 볼 수 있는 작업에 변화가 생겼을 때. 목록을 다시 불러오면 된다.
     *
     * ★ 무엇이 바뀌었는지는 따지지 않는다. RLS 가 이미 "내가 볼 수 있는 것"만
     *   배달하므로, 도착했다는 것 자체가 "내 목록이 낡았다"는 뜻이다.
     *   payload 를 뜯어 조건을 다시 짜면 정책과 프론트에 같은 규칙이 두 벌
     *   생기고, 그게 어긋나면 조용히 틀린다.
     */
    onChange: () => void;

    /** 끊겼다 다시 붙었을 때. 끊긴 동안의 변화를 메꾼다. */
    onReconnect?: () => void;

    /**
     * 여러 변경이 몰아칠 때 한 번만 부르도록 묶는 시간(ms).
     * 사내가 일괄 수정하면 UPDATE 가 연달아 오는데, 그때마다 목록을
     * 다시 불러오면 서버를 때린다.
     */
    debounceMs?: number;

    /**
     * postgres_changes 서버 필터. 예: "outsourcing_open=eq.true"
     * 사내 화면처럼 전부 볼 수 있는 계정은 이걸로 소음을 줄인다.
     * 외주 화면은 RLS 가 이미 좁혀주므로 생략한다.
     */
    filter?: string;

    enabled?: boolean;
    debug?: boolean;
}

/**
 * tasks 의 변화를 실시간으로 받는다. (INSERT + UPDATE)
 *
 * 검수 스레드(outsourcing_messages)와 별개다. 메시지는 대화, 이쪽은
 * "새 작업이 떴다 / 상태가 바뀌었다 / 나에게 배정됐다".
 *
 * ★ 선행 조건 (둘 다 필요)
 *   ALTER PUBLICATION "supabase_realtime" ADD TABLE "public"."tasks";
 *   ALTER TABLE "public"."tasks" REPLICA IDENTITY FULL;
 *
 *   REPLICA IDENTITY FULL 은 UPDATE 때 이전 값을 받기 위한 것이다.
 *   outsourcing_messages 는 INSERT 만 쓰므로 필요 없었지만 여기는 필요하다.
 *
 * ★ 알려진 한계
 *   다른 외주가 작업을 가져가면 assigned_designer_id 가 상대 것으로 채워져
 *   그 행이 나에게 안 보이게 되고, 안 보이는 행의 변경은 배달되지 않는다.
 *   내 작업 대기 목록에 그 카드가 남는다. claimOutsourcingTask 의
 *   .eq("outsourcing_status","open") 방어가 있어 통과하지는 않는다.
 */
export function useTaskStream({
    onChange,
    onReconnect,
    debounceMs = 400,
    filter,
    enabled = true,
    debug = false,
}: Options) {
    // 콜백은 ref 로 받고 의존성에서 뺀다 (v5 문서 5-1 ⑧)
    const onChangeRef = useRef(onChange);
    const onReconnectRef = useRef(onReconnect);
    useEffect(() => { onChangeRef.current = onChange; }, [onChange]);
    useEffect(() => { onReconnectRef.current = onReconnect; }, [onReconnect]);

    const hasConnectedBefore = useRef(false);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        if (!enabled) return;

        const supabase = createClient();
        let channel: ReturnType<typeof supabase.channel> | null = null;
        let cancelled = false;

        const log = (...args: unknown[]) => { if (debug) console.log("[Task]", ...args); };

        const fire = () => {
            if (timerRef.current) clearTimeout(timerRef.current);
            timerRef.current = setTimeout(() => {
                timerRef.current = null;
                log("갱신 실행");
                onChangeRef.current();
            }, debounceMs);
        };

        (async () => {
            // ★ 구독 전에 토큰을 넘긴다. 안 하면 anon 으로 붙어
            //   RLS 에 막혀 아무것도 안 온다 (v5 문서 5-2 ⑮)
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            log("세션", token ? "있음" : "없음 ← anon 으로 붙는다");
            if (token) supabase.realtime.setAuth(token);
            if (cancelled) return;

            channel = supabase
                .channel(`tasks-stream${filter ? `:${filter}` : ""}`)
                .on(
                    "postgres_changes",
                    {
                        event: "*",          // INSERT: 새 작업 / UPDATE: 공개·배정·상태 변경
                        schema: "public",
                        table: "tasks",
                        ...(filter ? { filter } : {}),
                    },
                    (payload) => {
                        log("수신", payload.eventType, (payload.new as { id?: string })?.id);
                        fire();
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
            if (timerRef.current) clearTimeout(timerRef.current);
            sub.subscription.unsubscribe();
            if (channel) supabase.removeChannel(channel);
        };
    }, [filter, enabled, debounceMs, debug]);
}
