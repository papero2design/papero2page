"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface Designer {
    id: string;
    name: string;
    avatar_url: string | null;
}

interface Props {
    designers: Designer[];
    isAdmin: boolean;
    canManage: boolean;
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
    canManage,
}: Props) {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // 클라이언트에서 직접 count fetch
    const [counts, setCounts] = useState({ priority: 0, active: 0, done: 0 });

    useEffect(() => {
        const supabase = createClient();

        const load = async () => {
            const [
                { count: priorityCount },
                { count: activeCount },
                { count: doneCount },
            ] = await Promise.all([
                supabase
                    .from("tasks")
                    .select("id", { count: "exact", head: true })
                    .is("deleted_at", null)
                    .neq("status", "완료")
                    .eq("is_priority", true)
                    .is("assigned_designer_id", null),
                supabase
                    .from("tasks")
                    .select("id", { count: "exact", head: true })
                    .is("deleted_at", null)
                    .neq("status", "완료")
                    .eq("is_priority", false)
                    .is("assigned_designer_id", null),
                supabase
                    .from("tasks")
                    .select("id", { count: "exact", head: true })
                    .is("deleted_at", null)
                    .eq("status", "완료"),
            ]);

            setCounts({
                priority: priorityCount ?? 0,
                active: activeCount ?? 0,
                done: doneCount ?? 0,
            });
        };

        load();

        // board-refresh 이벤트 수신 시 count 갱신
        const handler = () => load();
        window.addEventListener("board-refresh", handler);
        return () => window.removeEventListener("board-refresh", handler);
    }, []);

    const currentTab = searchParams.get("tab") ?? "active";

    const isTabActive = (tab: string) =>
        pathname === "/board" && currentTab === tab;

    const isActive = (href: string) => {
        if (href === "/board?tab=priority") {
            return isTabActive("priority");
        }
        if (href === "/board?tab=done") {
            return isTabActive("done");
        }
        if (href === "/board?tab=active") {
            return isTabActive("active") || (pathname === "/board" && !searchParams.has("tab"));
        }
        return pathname === href || pathname.startsWith(href + "/");
    };

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
                        href="/board?tab=priority"
                        className={tabCls(
                            "/board?tab=priority",
                            "text-red-600",
                            "hover:text-red-500",
                        )}
                    >
                        우선작업
                        <Badge count={counts.priority} bg="#ef4444" />
                    </Link>
                </li>

                {/* 작업등록 */}
                <li className="flex-shrink-0">
                    <Link
                        href="/board?tab=active"
                        className={tabCls(
                            "/board?tab=active",
                            "text-gray-900",
                            "hover:text-gray-800",
                        )}
                    >
                        작업등록
                        <Badge count={counts.active} bg="#6b7280" />
                    </Link>
                </li>

                {/* 구분선 */}
                {canManage && (
                    <li className="flex items-center flex-shrink-0">
                        <div className="w-px h-4 bg-gray-300 mx-2" />
                    </li>
                )}

                {/* 디자이너 목록 */}
                {canManage && (
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

                {/* 작업완료 */}
                <li className="flex-shrink-0">
                    <Link
                        href="/board?tab=done"
                        className={tabCls(
                            "/board?tab=done",
                            "text-blue-600",
                            "hover:text-blue-500",
                        )}
                    >
                        작업완료
                    </Link>
                </li>

                {/* 우측 끝 */}
                {canManage && (
                    <>
                        <li className="flex-1" />
                        {isAdmin && (
                            <>
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
                            </>
                        )}
                        <li className="flex-shrink-0">
                            <Link
                                href="/board/trash"
                                className={tabCls(
                                    "/board/trash",
                                    "text-red-700",
                                    "hover:text-red-500",
                                )}
                                title="휴지통"
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
