import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
    const hostname = request.headers.get("host") ?? "";

    // ── 1. 세션 갱신 (항상 먼저 실행) ──────────────────────────
    const response = NextResponse.next();
    const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        {
            cookies: {
                getAll: () => request.cookies.getAll(),
                setAll: (c) =>
                    c.forEach(({ name, value, options }) =>
                        response.cookies.set(name, value, options),
                    ),
            },
        },
    );
    await supabase.auth.getUser(); // 세션 갱신 — 서브도메인 포함 항상 실행

    // ── 2. 서브도메인 rewrite ────────────────────────────────────
    // classic.poomsin.com → /board로 rewrite
    if (hostname.startsWith("classic.")) {
        const url = request.nextUrl.clone();
        url.pathname = `/board${url.pathname === "/" ? "" : url.pathname}`;
        const rewriteRes = NextResponse.rewrite(url);
        // 갱신된 쿠키를 rewrite response에도 복사
        response.cookies.getAll().forEach(({ name, value }) => {
            rewriteRes.cookies.set(name, value);
        });
        return rewriteRes;
    }

    // app.poomsin.com → /tasks로 rewrite
    if (hostname.startsWith("app.")) {
        const url = request.nextUrl.clone();
        url.pathname = `/tasks${url.pathname === "/" ? "" : url.pathname}`;
        const rewriteRes = NextResponse.rewrite(url);
        response.cookies.getAll().forEach(({ name, value }) => {
            rewriteRes.cookies.set(name, value);
        });
        return rewriteRes;
    }

    return response;
}

export const config = {
    matcher: ["/((?!api|_next|.*\\..*).*)"],
};

// 로컬 테스트
// 127.0.0.1  classic.localhost
// 127.0.0.1  app.localhost
