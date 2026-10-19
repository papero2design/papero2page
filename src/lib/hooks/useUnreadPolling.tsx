// src/lib/hooks/useUnreadPolling.tsx
"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * 새 소식이 있는지 주기적으로 확인한다.
 *
 * 설계 원칙 두 가지:
 * 1) 화면을 자동으로 갈아엎지 않는다. 업로드 중이거나 textarea 에 쓰던 내용이
 *    날아가므로, 배너만 띄우고 새로고침은 사용자가 누르게 한다.
 * 2) 탭이 백그라운드면 요청하지 않는다. 탭 10개를 열어둔 사람이
 *    서버를 10배로 때리는 걸 막는다.
 *
 * @param fetcher  미확인 건수를 세는 서버 액션
 * @param baseline 서버에서 렌더된 현재 건수. 이 값이 바뀌면(=새로고침됨) 배너를 닫는다.
 */
export function useUnreadPolling(
    fetcher: () => Promise<number>,
    options: { intervalMs?: number } = {},
) {
    const { intervalMs = 30_000 } = options;
    const [hasNew, setHasNew] = useState(false);

    // null = 아직 기준선이 없음. 첫 호출 결과로 잡는다.
    const lastRef = useRef<number | null>(null);
    const fetcherRef = useRef(fetcher);
    fetcherRef.current = fetcher;
    const inFlightRef = useRef(false);
    const suppressUntilRef = useRef(0);

    const tick = useCallback(async () => {
        if (Date.now() < suppressUntilRef.current) return;
        if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
        if (inFlightRef.current) return;

        inFlightRef.current = true;
        try {
            const n = await fetcherRef.current();
            if (lastRef.current === null) {
                lastRef.current = n;   // 첫 호출은 기준선만 잡고 끝
            } else {
                if (n > lastRef.current) setHasNew(true);
                lastRef.current = n;
            }
        } catch (e) {
            console.error("[unread poll]", e);
        } finally {
            inFlightRef.current = false;
        }
    }, []);

    // 마운트 즉시 기준선 확보
    useEffect(() => { tick(); }, [tick]);

    useEffect(() => {
        // intervalMs 가 0 이면 주기 폴링을 걸지 않는다.
        // ★ setInterval(tick, 0) 이 되면 1초에 수백 번 돈다 (v4 문서 5-1 ⑪)
        const id = intervalMs > 0 ? setInterval(tick, intervalMs) : null;

        const onVisible = () => {
            if (document.visibilityState === "visible") tick();
        };
        document.addEventListener("visibilitychange", onVisible);
        window.addEventListener("focus", onVisible);

        return () => {
            if (id) clearInterval(id);
            document.removeEventListener("visibilitychange", onVisible);
            window.removeEventListener("focus", onVisible);
        };
    }, [tick, intervalMs]);

    return {
        hasNew,
        check: tick,
        dismiss: () => setHasNew(false),
        suppress: (ms = 5000) => {
            suppressUntilRef.current = Date.now() + ms;
            setHasNew(false);
        },
    };
}
/** 폴링으로 새 소식이 감지됐을 때 띄우는 배너 */
export function NewMessageBanner({
                                     onRefresh,
                                     text = "새로운 소식이 있습니다.",
                                     style,
                                 }: {
    onRefresh: () => void;
    text?: string;
    style?: React.CSSProperties;
}) {
    return (
        <div
            style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 16px",
                background: "#eff6ff",
                border: "1px solid #bfdbfe",
                borderRadius: 8,
                color: "#1d4ed8",
                fontWeight: 700,
                fontSize: 13,
                ...style,
            }}
        >
            <span>{text}</span>
            <button
                type="button"
                onClick={onRefresh}
                style={{
                    marginLeft: "auto",
                    padding: "5px 14px",
                    borderRadius: 6,
                    border: "1px solid #1d4ed8",
                    background: "#1d4ed8",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: "pointer",
                    fontFamily: "inherit",
                    whiteSpace: "nowrap",
                }}
            >
                새로고침
            </button>
        </div>
    );
}