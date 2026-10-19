// src/lib/ui/Feed.tsx
//
// 서버에서 만든 Promise 를 클라이언트 상태에 "흘려 넣는" 급수관.
//
// 쓰는 이유: 목록 상태·핸들러·실시간 훅이 전부 부모 클라이언트 컴포넌트 안에 있는데,
// 초기 데이터만 서버에서 스트리밍으로 받고 싶다. 섹션을 서버 컴포넌트로 쪼개면
// 훅이 갱신할 상태가 흩어진다 (v12 6-3). 그래서 렌더는 부모가 그대로 하고,
// 이 컴포넌트는 화면을 안 그리고 값만 올린다.
//
// - page.tsx 는 await 하지 않고 Promise 를 그대로 props 로 넘긴다 (React 19 / Next 16 지원)
// - use(promise) 가 Suspense 를 건다. fallback 은 null — 스켈레톤은 부모가 상태 보고 그린다
// - onReady 는 마운트 후 한 번만 부른다. StrictMode 이중 실행 방어는 ref 로
// - 실패는 throw 하지 않는다. page 가 Result 로 감싸서 넘기고 여기서 onError 로 올린다
//   (throw 하면 error boundary 가 화면을 통째로 바꾼다 — 예상된 거절은 값으로, v7 교훈 ①)
"use client";

import { use, useEffect, useRef } from "react";
import type { FeedResult } from "./feedSafe";

export type { FeedResult };

export function Feed<T>({
                            promise,
                            onReady,
                            onError,
                        }: {
    promise: Promise<FeedResult<T>>;
    onReady: (value: T) => void;
    onError?: (message: string) => void;
}) {
    const result = use(promise);
    const fired = useRef(false);

    useEffect(() => {
        if (fired.current) return;
        fired.current = true;
        if (result.ok) onReady(result.value);
        else onError?.(result.message);
    }, [result, onReady, onError]);

    return null;
}