// src/app/(classic)/board/designers/[id]/page.tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TaskWithDesigner } from "@/types/database";
import BoardTable from "../../BoardTable";
import DesignerProfilePanel from "./DesignerProfilePanel";
import WriteButton from "../../WriteButton";
import Pagination from "../../Pagination";

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, special_details, registered_by, " +
    "status, is_priority, is_quick, created_at, deleted_at, " +
    "designer:designers(id, name)";

const PAGE_SIZE = 15;

type Tab = "active" | "done" | "priority";

export default async function DesignerBoardPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{
        tab?: string;
        page?: string;
        q?: string;
    }>;
}) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    const isAdmin = profile?.role === "admin";
    const isDesigner = profile?.role === "designer";

    const { id } = await params;
    const { tab: tabParam, page: pageParam, q } = await searchParams;

    const tab: Tab =
        tabParam === "done" ? "done" : tabParam === "priority" ? "priority" : "active";

    // 디자이너 정보 조회
    const { data: designer } = await supabase
        .from("designers")
        .select("id, name, status, avatar_url, user_id, music_title, music_link")
        .eq("id", id)
        .single();

    if (!designer) notFound();

    const d = designer as {
        id: string;
        name: string;
        status: string;
        avatar_url: string | null;
        user_id: string | null;
        music_title: string | null;
        music_link: string | null;
    };

    // 권한 체크: 관리자 또는 본인만 접근 가능
    if (!isAdmin && !(isDesigner && d.user_id === user.id)) {
        redirect("/board");
    }

    const isOwn = isDesigner && d.user_id === user.id;
    const canEditDesigner = isAdmin || isOwn;

    const page = Math.max(1, Number(pageParam ?? 1));
    const from = (page - 1) * PAGE_SIZE;

    // 탭별 쿼리
    let query = supabase
        .from("tasks")
        .select(TASK_SELECT, { count: "exact" })
        .is("deleted_at", null)
        .eq("assigned_designer_id", id);

    if (tab === "active") {
        query = query.neq("status", "완료").eq("is_priority", false);
    } else if (tab === "done") {
        query = query.eq("status", "완료");
    } else {
        // priority
        query = query.neq("status", "완료").eq("is_priority", true);
    }

    query = query
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

    if (q?.trim()) query = query.ilike("customer_name", `%${q.trim()}%`);

    const { data, count, error } = await query;
    if (error?.code === "PGRST103") redirect(`/board/designers/${id}`);

    const tasks = (data ?? []) as unknown as TaskWithDesigner[];
    const total = count ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    // 탭 카운트 (3개 동시 조회)
    const [{ count: activeCount }, { count: doneCount }, { count: priorityCount }] =
        await Promise.all([
            supabase
                .from("tasks")
                .select("id", { count: "exact", head: true })
                .is("deleted_at", null)
                .eq("assigned_designer_id", id)
                .neq("status", "완료")
                .eq("is_priority", false),
            supabase
                .from("tasks")
                .select("id", { count: "exact", head: true })
                .is("deleted_at", null)
                .eq("assigned_designer_id", id)
                .eq("status", "완료"),
            supabase
                .from("tasks")
                .select("id", { count: "exact", head: true })
                .is("deleted_at", null)
                .eq("assigned_designer_id", id)
                .neq("status", "완료")
                .eq("is_priority", true),
        ]);

    const stats = {
        active: activeCount ?? 0,
        done: doneCount ?? 0,
        priority: priorityCount ?? 0,
        statusMap: {},
    };

    const allDesigners = canEditDesigner
        ? ((await supabase.from("designers").select("id, name").eq("is_active", true).order("name")).data ?? [])
        : [];

    const tabUrl = (t: Tab, p = 1) =>
        `/board/designers/${id}?tab=${t}&page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

    const pageUrl = (p: number) =>
        `/board/designers/${id}?tab=${tab}&page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

    const TABS: { key: Tab; label: string; count: number }[] = [
        { key: "active", label: "진행중", count: activeCount ?? 0 },
        { key: "done", label: "완료", count: doneCount ?? 0 },
        { key: "priority", label: "우선작업", count: priorityCount ?? 0 },
    ];

    return (
        <div
                style={{
                    width: "100%",
                    maxWidth: 1260,
                    margin: "0 auto",
                    padding: "0 16px 40px",
                }}
            >
                {/* 프로필 패널 */}
                <DesignerProfilePanel
                    designer={d}
                    stats={stats}
                    isOwn={isOwn}
                />

                {/* 탭 버튼 */}
                <div
                    style={{
                        display: "flex",
                        gap: 8,
                        marginBottom: 16,
                        borderBottom: "2px solid #e5e7eb",
                        paddingBottom: 0,
                    }}
                >
                    {TABS.map(({ key, label, count }) => {
                        const isActive = tab === key;
                        const color =
                            key === "priority"
                                ? "#dc2626"
                                : key === "done"
                                  ? "#15803d"
                                  : "#111827";
                        return (
                            <Link
                                key={key}
                                href={tabUrl(key)}
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "8px 16px",
                                    fontWeight: 700,
                                    color: isActive ? color : "#9ca3af",
                                    borderBottom: isActive
                                        ? `2px solid ${color}`
                                        : "2px solid transparent",
                                    marginBottom: -2,
                                    textDecoration: "none",
                                    transition: "color 0.1s",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {label}
                                <span
                                    style={{
                                        display: "inline-flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        minWidth: 20,
                                        height: 20,
                                        padding: "0 6px",
                                        borderRadius: 99,
                                        background: isActive ? color : "#e5e7eb",
                                        color: isActive ? "#fff" : "#6b7280",
                                        fontSize: 11,
                                        fontWeight: 800,
                                    }}
                                >
                                    {count > 99 ? "99+" : count}
                                </span>
                            </Link>
                        );
                    })}

                    <div style={{ flex: 1 }} />

                    {isAdmin && (
                        <div style={{ display: "flex", alignItems: "center", paddingBottom: 4 }}>
                            <WriteButton />
                        </div>
                    )}
                </div>

                {/* 검색결과 안내 */}
                {q && (
                    <p style={{ color: "#6b7280", marginBottom: 8 }}>
                        &quot;{q}&quot; 검색결과{" "}
                        <Link
                            href={tabUrl(tab)}
                            style={{ marginLeft: 6, color: "#ef4444", textDecoration: "none" }}
                        >
                            ✕
                        </Link>
                    </p>
                )}

                <BoardTable
                    tasks={tasks}
                    total={total}
                    from={from}
                    designers={allDesigners}
                    isAdmin={isAdmin}
                    canEditDesigner={canEditDesigner}
                    writeButton={undefined}
                />

                <Pagination page={page} totalPages={totalPages} pageUrl={pageUrl} />
            </div>
    );
}
