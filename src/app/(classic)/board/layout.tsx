// src/app/(classic)/board/layout.tsx
import "./board.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BoardNav from "./BoardNav";
import Image from "next/image";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function BoardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role, name")
        .eq("id", user.id)
        .single();

    const isAdmin = profile?.role === "admin";
    const isDesigner = profile?.role === "designer";

    // 디자이너 계정으로 로그인 시 → 자기 페이지로 리다이렉트
    // /board/designers/[id] 가 아닌 경로에 있을 때만
    if (isDesigner) {
        const { data: myDesigner } = await supabase
            .from("designers")
            .select("id")
            .eq("user_id", user.id)
            .single();

        if (myDesigner) {
            // 현재 요청 URL 확인은 Next.js layout에서 불가
            // → middleware에서 처리하거나, 개인 페이지에서 자체 처리
            // 여기서는 designers 배열에 본인만 넣어서 Nav 표시
            const { data: myDesignerFull } = await supabase
                .from("designers")
                .select("id, name, avatar_url")
                .eq("id", myDesigner.id)
                .single();

            const { count: myActive } = await supabase
                .from("tasks")
                .select("id", { count: "exact", head: true })
                .is("deleted_at", null)
                .neq("status", "완료")
                .eq("assigned_designer_id", myDesigner.id);

            return (
                <div id="wrap">
                    <header
                        id="header"
                        className="bg-white border-b border-gray-200 px-6 flex items-center justify-between h-30"
                    >
                        <h1 className="flex items-center text-4xl font-black tracking-tighter shrink-0">
                            <Link href={`/board/designers/${myDesigner.id}`}>
                                <Image
                                    src="/logo.png"
                                    alt="우리 디자인을 부탁해"
                                    width={160}
                                    height={60}
                                    className="object-contain h-16 w-auto"
                                    priority
                                />
                            </Link>
                        </h1>
                        {/* 디자이너용 검색창 */}
                        <form
                            action={`/board/designers/${myDesigner.id}`}
                            method="GET"
                            className="relative flex items-center w-full max-w-xs border border-gray-200 rounded-lg bg-white focus-within:border-gray-100 focus-within:ring-1 focus-within:ring-gray-400 transition-all h-10 ml-4"
                        >
                            <input
                                type="text"
                                name="q"
                                className="w-full h-full pl-4 pr-10 text-sm bg-transparent outline-none rounded-lg"
                                placeholder="고객이름 검색"
                            />
                            <button
                                type="submit"
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 cursor-pointer"
                            >
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    fill="none"
                                    viewBox="0 0 24 24"
                                    strokeWidth={1.5}
                                    stroke="currentColor"
                                    className="w-4 h-4"
                                >
                                    <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                                    />
                                </svg>
                            </button>
                        </form>
                        <div className="flex items-center gap-3 ml-4">
                            {myDesignerFull?.avatar_url ? (
                                <img
                                    src={myDesignerFull.avatar_url}
                                    alt=""
                                    className="w-8 h-8 rounded-full object-cover border-2 border-gray-200"
                                />
                            ) : (
                                <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500">
                                    {myDesignerFull?.name?.[0] ?? "?"}
                                </div>
                            )}
                            <span className="font-semibold text-gray-700">
                                {profile?.name ?? myDesignerFull?.name}
                            </span>
                            <span className="text-sm text-gray-400">
                                내 작업{" "}
                                <strong className="text-gray-700">
                                    {myActive ?? 0}
                                </strong>
                                건
                            </span>
                            <Link
                                href={`/board/designers/${myDesigner.id}`}
                                className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5 rounded-lg hover:bg-gray-100 transition-colors no-underline"
                            >
                                내 작업
                            </Link>
                            <LogoutButton />
                        </div>
                    </header>
                    <div id="subContainer" className="p-6">
                        {children}
                    </div>
                </div>
            );
        }
    }

    // 관리자 / 일반 레이아웃
    const { data: designers } = await supabase
        .from("designers")
        .select("id, name, avatar_url")
        .eq("is_active", true)
        .order("name", { ascending: true });

    const [
        { count: priorityCount },
        { count: simpleCount },
        { count: activeCount },
        { count: doneCount },
    ] = await Promise.all([
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .neq("status", "완료")
            .eq("is_priority", true),
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .neq("status", "완료")
            .eq("is_quick", true),
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .neq("status", "완료"),
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .eq("status", "완료"),
    ]);

    return (
        <div id="wrap">
            <header
                id="header"
                className="bg-white border-b border-gray-200 px-6 flex items-center justify-between h-30"
            >
                <h1 className="flex items-center text-4xl font-black tracking-tighter shrink-0">
                    <Link href="/board">
                        <Image
                            src="/logo.png"
                            alt="우리 디자인을 부탁해"
                            width={160}
                            height={60}
                            className="object-contain h-16 w-auto"
                            priority
                        />
                    </Link>
                </h1>
                <form
                    action="/board"
                    method="GET"
                    className="relative flex items-center w-full max-w-lg border border-gray-200 rounded-lg bg-white focus-within:border-gray-100 focus-within:ring-1 focus-within:ring-gray-400 transition-all h-10 ml-4"
                >
                    <input
                        type="text"
                        name="q"
                        className="w-full h-full pl-5 pr-12 text-sm bg-transparent outline-none rounded-lg"
                        placeholder="고객이름"
                    />
                    <button
                        type="submit"
                        className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors cursor-pointer"
                        aria-label="검색"
                    >
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                            strokeWidth={1.5}
                            stroke="currentColor"
                            className="w-5 h-5"
                        >
                            <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                            />
                        </svg>
                    </button>
                </form>
                <LogoutButton />
            </header>

            <BoardNav
                designers={designers ?? []}
                isAdmin={isAdmin}
                priorityCount={priorityCount ?? 0}
                simpleCount={simpleCount ?? 0}
                activeCount={activeCount ?? 0}
                doneCount={doneCount ?? 0}
            />

            <div id="subContainer" className="p-6">
                {children}
            </div>
        </div>
    );
}
