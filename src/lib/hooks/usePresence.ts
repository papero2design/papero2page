// src/lib/hooks/usePresence.ts
"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export interface PresenceUser {
    userId: string;          // = profiles.id = auth.uid()
    name: string;
    avatarUrl?: string | null;
}

/**
 * 지금 접속해 있는 사람 목록.
 *
 * ★ DB 에 저장되지 않는다. 전화선(WebSocket)이 살아 있는 동안에만 존재한다.
 *   profiles 에 is_online 컬럼을 두면 브라우저가 비정상 종료됐을 때
 *   영원히 "접속 중"으로 남는 유령이 생긴다. 저장하지 않으면 유령이 생길 수 없다.
 *
 * ★ 공개 채널이다. 결정된 정책이 "전체 공개"(사내가 외주 접속 상태를 봄)이므로
 *   private 채널 + realtime.messages RLS 는 쓰지 않는다.
 *   대신 payload 에 민감한 값을 넣지 말 것 — userId, 표시 이름, 아바타 URL 만.
 *
 * ★ 이 훅은 앱당 한 번만 부른다. PresenceProvider 가 그 역할이다.
 *   화면마다 부르면 채널이 여러 개 열린다.
 */
export function usePresence(me: PresenceUser | null, debug = false) {
    const [online, setOnline] = useState<Record<string, PresenceUser>>({});

    useEffect(() => {
        if (!me) return;

        const supabase = createClient();
        const log = (...args: unknown[]) => { if (debug) console.log("[Presence]", ...args); };

        const channel = supabase.channel("presence:online", {
            config: {
                // ★ 이걸 지정하지 않으면 탭을 두 개 열었을 때 두 사람으로 잡힌다.
                //   사용자 ID 를 키로 주면 같은 사람으로 묶인다.
                presence: { key: me.userId },
            },
        });

        let cancelled = false;

        (async () => {
            // 공개 채널이라 토큰이 없어도 붙지만, 클라이언트를 실시간 구독과
            // 공유하므로 여기서도 맞춰둔다 (v5 문서 5-2 ⑮ 참고).
            const { data } = await supabase.auth.getSession();
            const token = data.session?.access_token;
            if (token) supabase.realtime.setAuth(token);
            if (cancelled) return;

            channel
                .on("presence", { event: "sync" }, () => {
                    // presenceState() 는 { userId: [ {…}, {…} ] } 형태.
                    // 배열인 이유는 같은 사람이 탭을 여러 개 열 수 있기 때문.
                    // 화면에는 한 명으로 보여야 하므로 첫 항목만 쓴다.
                    const state = channel.presenceState<PresenceUser>();
                    const next: Record<string, PresenceUser> = {};
                    for (const [key, entries] of Object.entries(state)) {
                        const first = entries[0];
                        if (first) {
                            next[key] = {
                                userId: first.userId,
                                name: first.name,
                                avatarUrl: first.avatarUrl ?? null,
                            };
                        }
                    }
                    log("접속자", Object.keys(next).length, Object.values(next).map((u) => u.name));
                    setOnline(next);
                })
                .subscribe(async (status) => {
                    log("상태", status);
                    if (status !== "SUBSCRIBED") return;
                    // "나 여기 있어요" 등록. 이 시점부터 남들에게 보인다.
                    await channel.track({
                        userId: me.userId,
                        name: me.name,
                        avatarUrl: me.avatarUrl ?? null,
                    });
                });
        })();

        return () => {
            cancelled = true;
            supabase.removeChannel(channel);   // untrack 은 자동
        };
    }, [me?.userId, me?.name, me?.avatarUrl, debug]);

    return {
        online,
        isOnline: (userId: string) => Boolean(online[userId]),
        /** 나를 포함한 접속자 수 */
        count: Object.keys(online).length,
    };
}
