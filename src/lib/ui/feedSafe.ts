// src/lib/ui/feedSafe.ts
//
// 서버 전용. "use client" 가 없는 파일이어야 page.tsx 가 부를 수 있다.
// Feed.tsx 에 같이 두면 "Attempted to call feedSafe() from the server" 가 난다.
export type FeedResult<T> =
    | { ok: true; value: T }
    | { ok: false; message: string };

/** page.tsx 에서 Promise 를 감싼다. reject 를 값으로 바꾼다 */
export function feedSafe<T>(p: Promise<T>): Promise<FeedResult<T>> {
    return p.then(
        (value) => ({ ok: true as const, value }),
        (e) => ({ ok: false as const, message: (e as Error)?.message ?? String(e) }),
    );
}