import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export async function middleware(request: NextRequest) {
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
        data: { session },
    } = await supabase.auth.getSession();

    // 미인증 사용자 → /login 리다이렉트
    if (!session && !request.nextUrl.pathname.startsWith("/login")) {
        return NextResponse.redirect(new URL("/login", request.url));
    }

    // 인증된 사용자가 /login 접근 → /board로
    if (session && request.nextUrl.pathname.startsWith("/login")) {
        return NextResponse.redirect(new URL("/board", request.url));
    }

    return response;
}

export const config = {
    matcher: [
        "/((?!_next/static|_next/image|favicon.ico|logo.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    ],
};
