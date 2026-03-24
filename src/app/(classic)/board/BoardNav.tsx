"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const TAB_ORDER_KEY = "board_designer_tab_order";

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

function applyOrder(designers: Designer[], order: string[]): Designer[] {
    if (!order.length) return designers;
    const map = new Map(designers.map((d) => [d.id, d]));
    const ordered: Designer[] = [];
    order.forEach((id) => {
        const d = map.get(id);
        if (d) ordered.push(d);
    });
    designers.forEach((d) => {
        if (!order.includes(d.id)) ordered.push(d);
    });
    return ordered;
}

export default function BoardNav() {
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const [designers, setDesigners] = useState<Designer[]>([]);
    const [tabOrder, setTabOrder] = useState<string[]>([]);
    const [isAdmin, setIsAdmin] = useState(false);
    const [canManage, setCanManage] = useState(false);
    const [counts, setCounts] = useState({ priority: 0, active: 0, done: 0 });
    const [loaded, setLoaded] = useState(false);

    // 드래그 상태
    const [editMode, setEditMode] = useState(false);
    const dragIndexRef = useRef<number | null>(null);
    const [dragOver, setDragOver] = useState<number | null>(null);

    useEffect(() => {
        const supabase = createClient();

        const loadAll = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const [profileRes, designersRes, settingRes, ...countRes] = await Promise.all([
                supabase.from("profiles").select("role").eq("id", user.id).single(),
                supabase.from("designers").select("id, name, avatar_url").eq("is_active", true).order("name"),
                supabase.from("app_settings").select("value").eq("key", "designer_tab_order").single(),
                supabase.from("tasks").select("id", { count: "exact", head: true }).is("deleted_at", null).neq("status", "완료").eq("is_priority", true).is("assigned_designer_id", null),
                supabase.from("tasks").select("id", { count: "exact", head: true }).is("deleted_at", null).neq("status", "완료").eq("is_priority", false).is("assigned_designer_id", null),
                supabase.from("tasks").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "완료"),
            ]);

            const role = profileRes.data?.role;
            const admin = role === "admin";
            const designer = role === "designer";
            setIsAdmin(admin);
            setCanManage(admin || designer);

            const raw = designersRes.data ?? [];
            // DB 순서 우선, 없으면 localStorage 폴백
            const dbOrder: string[] = settingRes.data?.value ?? [];
            const order = dbOrder.length > 0 ? dbOrder : (() => {
                try {
                    const saved = localStorage.getItem(TAB_ORDER_KEY);
                    return saved ? (JSON.parse(saved) as string[]) : [];
                } catch { return []; }
            })();

            if (order.length > 0) {
                setTabOrder(order);
                setDesigners(applyOrder(raw, order));
                try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order)); } catch {}
            } else {
                setDesigners(raw);
            }

            setCounts({
                priority: countRes[0].count ?? 0,
                active: countRes[1].count ?? 0,
                done: countRes[2].count ?? 0,
            });
            setLoaded(true);
        };

        loadAll();

        const refreshCounts = async () => {
            const [p, a, d] = await Promise.all([
                supabase.from("tasks").select("id", { count: "exact", head: true }).is("deleted_at", null).neq("status", "완료").eq("is_priority", true).is("assigned_designer_id", null),
                supabase.from("tasks").select("id", { count: "exact", head: true }).is("deleted_at", null).neq("status", "완료").eq("is_priority", false).is("assigned_designer_id", null),
                supabase.from("tasks").select("id", { count: "exact", head: true }).is("deleted_at", null).eq("status", "완료"),
            ]);
            setCounts({ priority: p.count ?? 0, active: a.count ?? 0, done: d.count ?? 0 });
        };

        window.addEventListener("board-refresh", refreshCounts);
        return () => window.removeEventListener("board-refresh", refreshCounts);
    }, []);

    // 드래그 핸들러
    const handleDragStart = (index: number) => {
        dragIndexRef.current = index;
    };
    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        setDragOver(index);
    };
    const saveOrderToDB = async (order: string[]) => {
        const supabase = createClient();
        await supabase
            .from("app_settings")
            .upsert({ key: "designer_tab_order", value: order, updated_at: new Date().toISOString() });
        try { localStorage.setItem(TAB_ORDER_KEY, JSON.stringify(order)); } catch {}
    };

    const handleDrop = (index: number) => {
        const from = dragIndexRef.current;
        if (from === null || from === index) {
            setDragOver(null);
            dragIndexRef.current = null;
            return;
        }
        const next = [...designers];
        const [moved] = next.splice(from, 1);
        next.splice(index, 0, moved);
        setDesigners(next);
        const order = next.map((d) => d.id);
        setTabOrder(order);
        saveOrderToDB(order);
        setDragOver(null);
        dragIndexRef.current = null;
    };
    const handleDragEnd = () => {
        setDragOver(null);
        dragIndexRef.current = null;
    };

    const resetOrder = async () => {
        try { localStorage.removeItem(TAB_ORDER_KEY); } catch {}
        setTabOrder([]);
        setDesigners((prev) => [...prev].sort((a, b) => a.name.localeCompare(b.name)));
        const supabase = createClient();
        await supabase
            .from("app_settings")
            .upsert({ key: "designer_tab_order", value: [], updated_at: new Date().toISOString() });
    };

    const currentTab = searchParams.get("tab") ?? "active";
    const isTabActive = (tab: string) => pathname === "/board" && currentTab === tab && !searchParams.get("designer");
    const isActive = (href: string) => {
        if (href === "/board?tab=priority") return isTabActive("priority");
        if (href === "/board?tab=done") return isTabActive("done");
        if (href === "/board?tab=active") return isTabActive("active") || (pathname === "/board" && !searchParams.has("tab") && !searchParams.get("designer"));
        return pathname === href || pathname.startsWith(href + "/");
    };
    const isDesignerActive = (id: string) =>
        (pathname === "/board" && searchParams.get("designer") === id) ||
        pathname === `/board/designers/${id}`;

    const base = "flex items-center whitespace-nowrap px-4 py-2 font-semibold border-b-2 transition-colors";
    const tabCls = (href: string, activeColor: string, hoverColor: string) =>
        `${base} ${isActive(href) ? `${activeColor} border-current` : `text-gray-500 border-transparent ${hoverColor}`}`;

    if (!loaded) {
        return (
            <div className="w-full">
                <ul className="flex items-center w-full border-b border-gray-200">
                    <li className="shrink-0">
                        <Link href="/board?tab=priority" className={tabCls("/board?tab=priority", "text-red-600", "hover:text-red-500")}>
                            우선작업
                        </Link>
                    </li>
                    <li className="shrink-0">
                        <Link href="/board?tab=active" className={tabCls("/board?tab=active", "text-gray-900", "hover:text-gray-800")}>
                            작업등록
                        </Link>
                    </li>
                    <li className="shrink-0">
                        <Link href="/board?tab=done" className={tabCls("/board?tab=done", "text-blue-600", "hover:text-blue-500")}>
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
                <li className="shrink-0">
                    <Link href="/board?tab=priority" className={tabCls("/board?tab=priority", "text-red-600", "hover:text-red-500")}>
                        우선작업
                        <Badge count={counts.priority} bg="#ef4444" />
                    </Link>
                </li>

                {/* 작업등록 */}
                <li className="shrink-0">
                    <Link href="/board?tab=active" className={tabCls("/board?tab=active", "text-gray-900", "hover:text-gray-800")}>
                        작업등록
                        <Badge count={counts.active} bg="#6b7280" />
                    </Link>
                </li>

                {/* 구분선 */}
                {canManage && (
                    <li className="flex items-center shrink-0">
                        <div className="w-px h-4 bg-gray-300 mx-2" />
                    </li>
                )}

                {/* 디자이너 탭 목록 */}
                {canManage && (
                    <li
                        className="flex items-center min-w-0 shrink"
                        style={{ overflowX: "auto", scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}
                    >
                        <div className="flex items-center">
                            {designers.map((d, index) => (
                                <div
                                    key={d.id}
                                    draggable={editMode && isAdmin}
                                    onDragStart={() => handleDragStart(index)}
                                    onDragOver={(e) => handleDragOver(e, index)}
                                    onDrop={() => handleDrop(index)}
                                    onDragEnd={handleDragEnd}
                                    style={{
                                        opacity: dragOver === index ? 0.5 : 1,
                                        cursor: editMode && isAdmin ? "grab" : "default",
                                        outline: editMode && isAdmin ? "2px dashed #d1d5db" : "none",
                                        outlineOffset: -2,
                                        borderRadius: 4,
                                        transition: "opacity 0.15s",
                                    }}
                                >
                                    {editMode && isAdmin ? (
                                        <span
                                            className={`${base} text-gray-500 border-transparent shrink-0`}
                                            style={{ userSelect: "none" }}
                                        >
                                            {d.avatar_url ? (
                                                <img
                                                    src={d.avatar_url}
                                                    alt={d.name}
                                                    className="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm mr-2 shrink-0"
                                                />
                                            ) : (
                                                <div
                                                    className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 mr-2 shrink-0"
                                                    style={{ fontSize: 11 }}
                                                >
                                                    {d.name[0]}
                                                </div>
                                            )}
                                            {d.name}
                                            <span style={{ marginLeft: 4, fontSize: 10, color: "#9ca3af" }}>⠿</span>
                                        </span>
                                    ) : (
                                        <Link
                                            href={`/board?designer=${d.id}`}
                                            className={(isDesignerActive(d.id)
                                                ? `${base} text-blue-600 border-current`
                                                : `${base} text-gray-500 border-transparent hover:text-blue-500`) + " shrink-0"}
                                        >
                                            {d.avatar_url ? (
                                                <img
                                                    src={d.avatar_url}
                                                    alt={d.name}
                                                    className="w-7 h-7 rounded-full object-cover border-2 border-white shadow-sm mr-2 shrink-0"
                                                />
                                            ) : (
                                                <div
                                                    className="w-7 h-7 rounded-full bg-gray-200 flex items-center justify-center font-bold text-gray-500 mr-2 shrink-0"
                                                    style={{ fontSize: 11 }}
                                                >
                                                    {d.name[0]}
                                                </div>
                                            )}
                                            {d.name}
                                        </Link>
                                    )}
                                </div>
                            ))}
                        </div>
                    </li>
                )}

                {/* 작업완료 */}
                <li className="shrink-0">
                    <Link href="/board?tab=done" className={tabCls("/board?tab=done", "text-blue-600", "hover:text-blue-500")}>
                        작업완료
                    </Link>
                </li>

                {/* 우측 끝 */}
                {canManage && (
                    <>
                        <li className="flex-1" />
                        {isAdmin && (
                            <>
                                {/* 탭 순서 편집 버튼 */}
                                <li className="shrink-0">
                                    {editMode ? (
                                        <div className="flex items-center gap-1 px-2">
                                            <button
                                                onClick={resetOrder}
                                                style={{
                                                    padding: "3px 8px",
                                                    fontSize: 11,
                                                    fontWeight: 600,
                                                    border: "1px solid #e5e7eb",
                                                    borderRadius: 4,
                                                    cursor: "pointer",
                                                    background: "#fff",
                                                    color: "#6b7280",
                                                    fontFamily: "inherit",
                                                }}
                                            >
                                                초기화
                                            </button>
                                            <button
                                                onClick={() => setEditMode(false)}
                                                style={{
                                                    padding: "3px 8px",
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    border: "1px solid #111827",
                                                    borderRadius: 4,
                                                    cursor: "pointer",
                                                    background: "#111827",
                                                    color: "#fff",
                                                    fontFamily: "inherit",
                                                }}
                                            >
                                                완료
                                            </button>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => setEditMode(true)}
                                            title="탭 순서 편집"
                                            style={{
                                                padding: "3px 8px",
                                                fontSize: 13,
                                                border: "none",
                                                background: "none",
                                                cursor: "pointer",
                                                color: "#9ca3af",
                                            }}
                                        >
                                            ⋮⋮
                                        </button>
                                    )}
                                </li>
                                <li className="shrink-0">
                                    <Link href="/board/stats" className={tabCls("/board/stats", "text-gray-900", "hover:text-gray-800")}>
                                        작업통계
                                    </Link>
                                </li>
                                <li className="shrink-0">
                                    <Link href="/board/designers" className={tabCls("/board/designers", "text-gray-900", "hover:text-gray-800")}>
                                        디자이너 관리
                                    </Link>
                                </li>
                            </>
                        )}
                        <li className="shrink-0">
                            <Link href="/board/trash" className={tabCls("/board/trash", "text-red-700", "hover:text-red-500")} title="휴지통">
                                🗑
                            </Link>
                        </li>
                    </>
                )}
            </ul>
        </div>
    );
}
