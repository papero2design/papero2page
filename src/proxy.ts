import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const OUTSOURCING_HOME = "/outsourcing";

export async function proxy(request: NextRequest) {

    if(request.nextUrl.pathname.startsWith("/api/")){
        return NextResponse.next();
    }
    // if (request.nextUrl.pathname.startsWith("/api/")) {
    //     return NextResponse.next();
    // }
    //
    // // RSC 페이로드 요청은 이미 통과한 문서의 후속 요청이다.
    // // 리다이렉트 대상이 아니므로 인증 왕복을 건너뛴다
    // if (request.headers.get("RSC") === "1") {
    //     return NextResponse.next();
    // }
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

    const {
        data: { user },
    } = await supabase.auth.getUser();

    const { pathname } = request.nextUrl;

    // 미인증 사용자 → /login 리다이렉트
    if (!user && !pathname.startsWith("/login")) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    // 인증된 사용자 → role 조회 후 분기
    if (user) {
        const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        const role = profile?.role ?? null;
        const isOutsourcing = role === "outsourcing";

        // /login 접근 시 role에 맞는 홈으로
        if (pathname.startsWith("/login")) {
            return NextResponse.redirect(
                new URL(isOutsourcing ? OUTSOURCING_HOME : "/board", request.url),
            );
        }

        // 외주 계정이 /board 등 일반 페이지 접근 → 외주 페이지로
        if (isOutsourcing && !pathname.startsWith(OUTSOURCING_HOME)) {
            return NextResponse.redirect(new URL(OUTSOURCING_HOME, request.url));
        }

        // 비외주 계정이 외주 전용 페이지 접근 → /board로
        if (!isOutsourcing && pathname.startsWith(OUTSOURCING_HOME)) {
            return NextResponse.redirect(new URL("/board", request.url));
        }
    }

    return response;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};