"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

interface Designer {
    id: string;
    name: string;
    avatar_url: string | null;
}

interface Props {
    designers: Designer[];
    isAdmin: boolean;
    priorityCount?: number; // 우선작업 — 빨강
    simpleCount?: number; // 간단작업 — 초록
    activeCount?: number; // 등록작업 — 회색
    waitCount?: number; // 대기중
    ingCount?: number; // 진행중
    checkCount?: number; // 검수대기
    doneCount?: number; // 완료작업 — 파랑
}

// 컴포넌트 바깥에 선언 — 렌더 중 생성 금지
function Badge({ count, bg }: { count: number; bg: string }) {
    if (count === 0) return null;
    return (
        <span
            style={{
                marginLeft: 5,
                minWidth: 18,
                height: 18,
                padding: "0 5px",
                borderRadius: 99,
                background: bg,
                color: "#fff",
                fontWeight: 800,
                fontSize: 11,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                lineHeight: 1,
            }}
        >
            {count > 99 ? "99+" : count}
        </span>
    );
}

export default function BoardNav({
    designers,
    isAdmin,
    priorityCount = 0,
    simpleCount = 0,
    activeCount = 0,
    doneCount = 0,
    waitCount = 0,
    ingCount = 0,
    checkCount = 0,
}: Props) {
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const currentStatus = searchParams.get("status");

    const isActive = (href: string, targetStatus?: string) => {
        // 우선작업, 간단작업 등 특정 경로일 때
        if (targetStatus === undefined) return pathname.startsWith(href);

        // 상태 탭일 때

        if (pathname === "/board") {
            if (targetStatus === "전체") return !currentStatus; // 파라미터 없으면 전체
            return currentStatus === targetStatus;
        }

        return false;
    };

    const base =
        "flex items-center whitespace-nowrap px-4 py-3 font-semibold border-b-2 transition-colors";

    const tabCls = (href: string, activeColor: string, hoverColor: string) =>
        `${base} ${
            isActive(href)
                ? `${activeColor} border-current`
                : `text-gray-500 border-transparent ${hoverColor}`
        }`;

    return (
        <div className="w-full">
            <ul className="flex w-full border-b border-gray-200">
                {/* ── 그룹 1: 작업 분류 ── */}

                {/* 우선작업 — 빨강 뱃지 */}
                <li className="flex-shrink-0">
                    <Link
                        href="/board/quick"
                        className={tabCls(
                            "/board/quick",
                            "text-red-600",
                            "hover:text-red-500",
                        )}
                    >
                        우선작업
                        <Badge count={priorityCount} bg="#ef4444" />
                    </Link>
                </li>

                {/*  작업등록 — 회색 뱃지 */}
                <li className="flex-shrink-0">
                    <Link
                        href="/board"
                        className={tabCls(
                            "/board",
                            "text-gray-900",
                            "hover:text-gray-800",
                        )}
                    >
                        작업등록
                        <Badge count={activeCount} bg="#6b7280" />
                    </Link>
                </li>

                {/* ── 구분선 ── */}
                {isAdmin && designers.length > 0 && (
                    <li className="flex items-center flex-shrink-0">
                        <div className="w-px h-4 bg-gray-300 mx-2" />
                    </li>
                )}

                {/* ── 그룹 2: 디자이너별 (가로스크롤) ── */}
                {isAdmin && designers.length > 0 && (
                    <li
                        className="flex items-center min-w-0 flex-shrink"
                        style={{
                            overflowX: "auto",
                            scrollbarWidth: "thin",
                            scrollbarColor: "#e5e7eb transparent",
                        }}
                    >
                        <div className="flex items-center">
                            {designers.map((d) => (
                                <Link
                                    key={d.id}
                                    href={`/board/designers/${d.id}`}
                                    className={
                                        tabCls(
                                            `/board/designers/${d.id}`,
                                            "text-blue-600",
                                            "hover:text-blue-500",
                                        ) + " flex-shrink-0"
                                    }
                                >
                                    {d.avatar_url ? (
                                        <img
                                            src={d.avatar_url}
                                            alt={d.name}
                                            className="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm mr-2 flex-shrink-0"
                                        />
                                    ) : (
                                        <div
                                            className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 mr-2 flex-shrink-0"
                                            style={{ fontSize: 11 }}
                                        >
                                            {d.name[0]}
                                        </div>
                                    )}
                                    {d.name}
                                </Link>
                            ))}
                        </div>
                    </li>
                )}
                {/* 완료작업 (구 완료) — 파랑 뱃지 */}
                <li className="flex-shrink-0">
                    <Link
                        href="/board/done"
                        className={tabCls(
                            "/board/done",
                            "text-blue-600",
                            "hover:text-blue-500",
                        )}
                    >
                        작업완료
                    </Link>
                </li>
                {/* ── 그룹 3: 관리자 전용 (우측 끝) ── */}
                {isAdmin && (
                    <>
                        <li className="flex-1" />
                        <li className="flex-shrink-0">
                            <Link
                                href="/board/stats"
                                className={tabCls(
                                    "/board/stats",
                                    "text-gray-900",
                                    "hover:text-gray-800",
                                )}
                            >
                                작업통계
                            </Link>
                        </li>
                        <li className="flex-shrink-0">
                            <Link
                                href="/board/designers"
                                className={tabCls(
                                    "/board/designers",
                                    "text-gray-900",
                                    "hover:text-gray-800",
                                )}
                            >
                                디자이너 관리
                            </Link>
                        </li>
                        <li className="flex-shrink-0">
                            <Link
                                href="/board/trash"
                                className={tabCls(
                                    "/board/trash",
                                    "text-red-700",
                                    "hover:text-red-500",
                                )}
                                title="휴지통 (관리자 전용)"
                            >
                                🗑
                            </Link>
                        </li>
                    </>
                )}
            </ul>
        </div>
    );
}
