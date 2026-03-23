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

export default function BoardNav() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    // 클라이언트에서 직접 fetch
    const [designers, setDesigners] = useState<Designer[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [canManage, setCanManage] = useState(false);
    const [counts, setCounts] = useState({ priority: 0, active: 0, done: 0 });
    const [loaded, setLoaded] = useState(false);

    useEffect(() => {
        const supabase = createClient();

        const loadAll = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) return;

            const [profileRes, designersRes, ...countRes] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("role")
                    .eq("id", user.id)
                    .single(),
                supabase
                    .from("designers")
                    .select("id, name, avatar_url")
                    .eq("is_active", true)
                    .order("name"),
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

            const role = profileRes.data?.role;
            const admin = role === "admin";
            const designer = role === "designer";
            setIsAdmin(admin);
            setCanManage(admin || designer);
            setDesigners(designersRes.data ?? []);
            setCounts({
                priority: countRes[0].count ?? 0,
                active: countRes[1].count ?? 0,
                done: countRes[2].count ?? 0,
            });
            setLoaded(true);
        };

        loadAll();

        // board-refresh 이벤트 수신 시 count만 갱신
        const refreshCounts = async () => {
            const [p, a, d] = await Promise.all([
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
                priority: p.count ?? 0,
                active: a.count ?? 0,
                done: d.count ?? 0,
            });
        };

        window.addEventListener("board-refresh", refreshCounts);
        return () => window.removeEventListener("board-refresh", refreshCounts);
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

    // 로딩 중에는 기본 탭만 표시 (깜빡임 방지)
    if (!loaded) {
        return (
            <div className="w-full">
                <ul className="flex items-center w-full border-b border-gray-200">
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
                        </Link>
                    </li>
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
                        </Link>
                    </li>
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
                </ul>
            </div>
        );
    }

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
