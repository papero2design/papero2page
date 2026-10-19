// src/app/(classic)/board/layout.tsx
import "./board.css";
import { Suspense } from "react";
import Link from "next/link";
import BoardNav from "./BoardNav";
import Image from "next/image";
import LogoutButton from "./LogoutButton";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { getPresenceUser } from "@/lib/presence/server";
import { PresenceProvider } from "@/lib/presence/PresenceProvider";
import {OnlineUsersBar} from "@/lib/presence/OnlinePresence";
import { ChatProvider } from "@/lib/chat/ChatProvider";
import ChatWidget from "@/lib/chat/ChatWidget";
import { OutsourcingAlertProvider } from "@/lib/alerts/OutsourcingAlertProvider";
import StaffNotifyButton from "./StaffNotifyButton";

export default async function BoardLayout({
                                              children,
                                          }: {
    children: React.ReactNode;
}) {
    // auth 는 여기서 한 번. getPresenceUser 는 이 user 를 받아 이름만 붙인다 (v12 5-1)
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const me = await getPresenceUser(supabase, user);

    // 순서가 중요하다. 접속 바의 프로필 팝오버가 "대화하기"를 부르려면
    // OnlineUsersBar 가 ChatProvider 안쪽에 있어야 한다
    return (
        <PresenceProvider me={me}>
            <ChatProvider myUserId={me?.userId ?? null} canUseRoster>
                <OutsourcingAlertProvider>
                    <div id="wrap">
                        <header
                            id="header"
                            className="bg-white border-b border-gray-200 px-4 md:px-6 py-3 md:py-4
                                   flex flex-wrap items-center gap-x-3 gap-y-3
                                   md:grid md:grid-cols-[1fr_minmax(0,28rem)_1fr] md:gap-4"
                        >
                            <h1 className="flex items-center shrink-0">
                                <Link href="/board">
                                    <Image
                                        src="/logo.png"
                                        alt="우리 디자인을 부탁해"
                                        width={240}
                                        height={100}
                                        className="object-contain h-10 md:h-16 w-auto"
                                        priority
                                    />
                                </Link>
                            </h1>
                            <form
                                action="/board/search"
                                method="GET"
                                className="relative flex items-center w-full order-last md:order-none border border-gray-200 rounded-lg bg-white focus-within:border-gray-100 focus-within:ring-1 focus-within:ring-gray-400 transition-all h-10"
                            >
                                <input
                                    type="text"
                                    name="q"
                                    className="w-full h-full pl-5 pr-12 text-sm bg-transparent outline-none rounded-lg"
                                    placeholder="전체 작업 검색 (고객명·인쇄항목·특이사항)"
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

                            {/* 접속자 — 아무도 없으면 아무것도 렌더하지 않는다 */}
                            <div className="ml-auto md:ml-0 justify-self-end flex items-center gap-3 shrink-0">
                                {/* ★v16 Ch4-B 검수요청 카톡 알림 (13-7-10) */}
                                <StaffNotifyButton />
                                <OnlineUsersBar />
                                <LogoutButton />
                            </div>
                        </header>

                        <Suspense>
                            <BoardNav />
                        </Suspense>

                        <div id="subContainer" className="px-4 pt-5 pb-10">
                            {children}
                        </div>
                    </div>

                    {/* 종이비행기 버튼 + 서랍. 화면당 하나 */}
                    <ChatWidget />
                </OutsourcingAlertProvider>
            </ChatProvider>
        </PresenceProvider>
    );
}
