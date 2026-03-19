// src/app/(classic)/board/designers/[id]/page.tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TaskWithDesigner } from "@/types/database";
import BoardTable from "../../BoardTable";
import DesignerProfilePanel from "./DesignerProfilePanel";
import WriteButton from "../../WriteButton";
import Pagination from "../../Pagination";
import FilterBar from "../../FilterBar";

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, registered_by, " +
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
        method?: string;
        source?: string;
        print?: string;
        post?: string;
        consult?: string;
        dateFrom?: string;
        dateTo?: string;
        sortBy?: string;
        sortDir?: string;
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
    const {
        tab: tabParam,
        page: pageParam,
        q,
        method: fMethod,
        source: fSource,
        print: fPrint,
        post: fPost,
        consult: fConsult,
        dateFrom: fDateFrom,
        dateTo: fDateTo,
        sortBy: fSortBy,
        sortDir: fSortDir,
    } = await searchParams;

    const tab: Tab =
        tabParam === "done"
            ? "done"
            : tabParam === "active"
              ? "active"
              : "priority";

    // 디자이너 정보 조회
    const { data: designer } = await supabase
        .from("designers")
        .select(
            "id, name, status, avatar_url, user_id, music_title, music_link, banner_color",
        )
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
        banner_color: string | null; // DB 마이그레이션 후 쿼리에 추가: ALTER TABLE designers ADD COLUMN banner_color TEXT;
    };

    // 본인 여부 (프로필 수정 권한)
    const isOwn = isDesigner && d.user_id === user.id;
    const canEditDesigner = isAdmin || isDesigner;

    const page = Math.max(1, Number(pageParam ?? 1));
    const from = (page - 1) * PAGE_SIZE;
    const sortBy = fSortBy ?? "created_at";
    const sortAsc = fSortDir === "asc";

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
        .order(sortBy, { ascending: sortAsc })
        .range(from, from + PAGE_SIZE - 1);

    if (q?.trim()) query = query.ilike("customer_name", `%${q.trim()}%`);
    if (fMethod) query = query.eq("order_method", fMethod);
    if (fSource) query = query.eq("order_source", fSource);
    if (fPrint?.trim())
        query = query.ilike("print_items", `%${fPrint.trim()}%`);
    if (fPost) query = query.ilike("post_processing", `${fPost}%`);
    if (fConsult) query = query.eq("consult_path", fConsult);
    if (fDateFrom) query = query.gte("created_at", `${fDateFrom}T00:00:00`);
    if (fDateTo) query = query.lte("created_at", `${fDateTo}T23:59:59`);

    const { data, count, error } = await query;
    if (error?.code === "PGRST103") redirect(`/board/designers/${id}`);

    const tasks = (data ?? []) as unknown as TaskWithDesigner[];
    const total = count ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    // 탭 카운트 (3개 동시 조회)
    const [
        { count: activeCount },
        { count: doneCount },
        { count: priorityCount },
    ] = await Promise.all([
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
        ? ((
              await supabase
                  .from("designers")
                  .select("id, name")
                  .eq("is_active", true)
                  .order("name")
          ).data ?? [])
        : [];

    const buildFilterParams = (overrides: Record<string, string> = {}) => {
        const p = new URLSearchParams();
        if (q) p.set("q", q);
        if (fMethod) p.set("method", fMethod);
        if (fSource) p.set("source", fSource);
        if (fPrint) p.set("print", fPrint);
        if (fPost) p.set("post", fPost);
        if (fConsult) p.set("consult", fConsult);
        if (fDateFrom) p.set("dateFrom", fDateFrom);
        if (fDateTo) p.set("dateTo", fDateTo);
        if (fSortBy) p.set("sortBy", fSortBy);
        if (fSortDir) p.set("sortDir", fSortDir);
        Object.entries(overrides).forEach(([k, v]) => {
            if (v) p.set(k, v);
            else p.delete(k);
        });
        return p.toString();
    };

    const tabUrl = (t: Tab, p = 1) => {
        const filterStr = buildFilterParams({ tab: t, page: String(p) });
        return `/board/designers/${id}?${filterStr}`;
    };

    const pageUrl = (p: number) => {
        const filterStr = buildFilterParams({ tab, page: String(p) });
        return `/board/designers/${id}?${filterStr}`;
    };

    const TABS: { key: Tab; label: string; count: number }[] = [
        { key: "priority", label: "우선작업", count: priorityCount ?? 0 },

        { key: "active", label: "진행중", count: activeCount ?? 0 },
        { key: "done", label: "완료", count: doneCount ?? 0 },
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
            <DesignerProfilePanel designer={d} stats={stats} isOwn={isOwn} />

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
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            paddingBottom: 4,
                        }}
                    >
                        <WriteButton />
                    </div>
                )}
            </div>

            {/* 총 건수 */}
            <div style={{ paddingTop: 4, marginBottom: 4 }}>
                <p style={{ color: "#9ca3af", margin: 0 }}>
                    총 <strong style={{ color: "#111827" }}>{total}</strong>건
                    {q && (
                        <span style={{ marginLeft: 8, color: "#6b7280" }}>
                            &quot;{q}&quot; 검색결과
                        </span>
                    )}
                </p>
            </div>

            <FilterBar
                currentStatus=""
                currentMethod={fMethod ?? ""}
                currentSource={fSource ?? ""}
                currentPrint={fPrint ?? ""}
                currentPost={fPost ?? ""}
                currentConsult={fConsult ?? ""}
                currentDateFrom={fDateFrom ?? ""}
                currentDateTo={fDateTo ?? ""}
                currentSortBy={fSortBy ?? ""}
                currentSortDir={fSortDir ?? "desc"}
            />

            <BoardTable
                tasks={tasks}
                total={total}
                from={from}
                designers={allDesigners}
                canEditDesigner={canEditDesigner}
                writeButton={undefined}
            />

            <Pagination page={page} totalPages={totalPages} pageUrl={pageUrl} />
        </div>
    );
}
