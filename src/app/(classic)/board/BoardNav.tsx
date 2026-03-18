"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface Designer {
    id: string;
    name: string;
    avatar_url: string | null;
}

interface Props {
    designers: Designer[];
    isAdmin: boolean;
    priorityCount?: number;
    activeCount?: number;
    doneCount?: number;
}

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
    activeCount = 0,
    doneCount = 0,
}: Props) {
    const pathname = usePathname();

    const isActive = (href: string) =>
        pathname === href || pathname.startsWith(href + "/");

    const base =
        "flex items-center whitespace-nowrap px-4 py-2 font-semibold border-b-2 transition-colors";

    const tabCls = (href: string, activeColor: string, hoverColor: string) =>
        `${base} ${
            isActive(href)
                ? `${activeColor} border-current`
                : `text-gray-500 border-transparent ${hoverColor}`
        }`;

    return (
        <div className="w-full">
            <ul className="flex items-center w-full border-b border-gray-200">
                {/* 우선작업 */}
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

                {/* 작업등록 */}
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

                {/* 구분선 */}
                {isAdmin && (
                    <li className="flex items-center flex-shrink-0">
                        <div className="w-px h-4 bg-gray-300 mx-2" />
                    </li>
                )}

                {/* 디자이너 목록 (관리자만) — 미배정 맨 앞 */}
                {isAdmin && (
                    <li
                        className="flex items-center min-w-0 flex-shrink"
                        style={{
                            overflowX: "auto",
                            scrollbarWidth: "thin",
                            scrollbarColor: "#e5e7eb transparent",
                        }}
                    >
                        <div className="flex items-center">
                            {/* 디자이너 개별 탭 */}
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

                {/* 작업완료 */}
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

                {/* 관리자 전용 (우측 끝) */}
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
