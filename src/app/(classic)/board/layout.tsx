// src/app/(classic)/board/layout.tsx
// 정적 셸 — 서버 쿼리 없음. 인증은 middleware.ts, 데이터는 각 클라이언트 컴포넌트에서 직접 fetch
import "./board.css";
import { Suspense } from "react";
import Link from "next/link";
import BoardNav from "./BoardNav";
import Image from "next/image";
import LogoutButton from "./LogoutButton";

export default function BoardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div id="wrap">
            <header
                id="header"
                className="bg-white border-b border-gray-200 px-6 flex items-center justify-between pt-4 pb-4"
            >
                <h1 className="flex items-center text-4xl font-black tracking-tighter shrink-0">
                    <Link href="/board">
                        <Image
                            src="/logo.png"
                            alt="우리 디자인을 부탁해"
                            width={240}
                            height={100}
                            className="object-contain h-18 w-auto"
                            priority
                        />
                    </Link>
                </h1>
                <form
                    action="/board/search"
                    method="GET"
                    className="relative flex items-center w-full max-w-lg border border-gray-200 rounded-lg bg-white focus-within:border-gray-100 focus-within:ring-1 focus-within:ring-gray-400 transition-all h-10 ml-4"
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
                <LogoutButton />
            </header>

            <Suspense>
                <BoardNav />
            </Suspense>

            <div id="subContainer" className="px-4 pt-5 pb-10">
                {children}
            </div>
        </div>
    );
}
