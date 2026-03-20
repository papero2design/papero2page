// src/app/(classic)/board/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TaskWithDesigner } from "@/types/database";
import BoardTable from "./BoardTable";
import WriteButton from "./WriteButton";
import FilterBar from "./FilterBar";
import Pagination from "./Pagination";

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, registered_by, " +
    "status, is_priority, is_quick, created_at, deleted_at, " +
    "designer:designers(id, name)";

const PAGE_SIZE = 15;

export default async function BoardPage({
    searchParams,
}: {
    searchParams: Promise<{
        tab?: string;
        page?: string;
        q?: string;
        status?: string;
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

    // profile 쿼리는 layout.tsx에서 이미 조회됨 (request 캐시)
    // 여기서는 간단하게 권한 체크만 수행
    const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    const isAdmin = profileData?.role === "admin";
    const isDesigner = profileData?.role === "designer";

    const {
        tab: fTab,
        page: pageParam,
        q,
        status: fStatus,
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

    const tab = fTab ?? "active"; // 기본값: active
    const page = Math.max(1, Number(pageParam ?? 1));
    const from = (page - 1) * PAGE_SIZE;

    // done 탭은 기본 정렬이 completed_at, 나머지는 created_at
    const defaultSortBy = tab === "done" ? "completed_at" : "created_at";
    const sortBy = fSortBy ?? defaultSortBy;
    const sortAsc = fSortDir === "asc";

    let query = supabase
        .from("tasks")
        .select(TASK_SELECT, { count: "exact" })
        .is("deleted_at", null);

    // 탭별 조건 분기
    if (tab === "done") {
        // 작업완료: status=완료 (done/page.tsx 로직)
        query = query.eq("status", "완료");
    } else if (tab === "priority") {
        // 우선작업: is_priority=true, status != 완료, assigned_designer_id IS NULL (quick/page.tsx 로직)
        query = query
            .neq("status", "완료")
            .eq("is_priority", true)
            .is("assigned_designer_id", null);
    } else {
        // 작업등록 (active): is_priority=false, status != 완료, assigned_designer_id IS NULL (기존 page.tsx 로직)
        query = query
            .neq("status", "완료")
            .eq("is_priority", false)
            .is("assigned_designer_id", null);
    }

    query = query
        .order(sortBy, { ascending: sortAsc })
        .range(from, from + PAGE_SIZE - 1);

    if (q?.trim()) query = query.ilike("customer_name", `%${q.trim()}%`);
    if (fStatus) query = query.eq("status", fStatus);
    if (fMethod) query = query.eq("order_method", fMethod);
    if (fSource) query = query.eq("order_source", fSource);
    if (fPrint?.trim())
        query = query.ilike("print_items", `%${fPrint.trim()}%`);
    if (fPost) query = query.ilike("post_processing", `${fPost}%`);
    if (fConsult) query = query.eq("consult_path", fConsult);
    if (fDateFrom) query = query.gte("created_at", `${fDateFrom}T00:00:00`);
    if (fDateTo) query = query.lte("created_at", `${fDateTo}T23:59:59`);

    const { data, count, error } = await query;
    if (error?.code === "PGRST103")
        redirect(`/board${q ? `?q=${encodeURIComponent(q)}` : ""}`);

    const tasks = (data ?? []) as unknown as TaskWithDesigner[];
    const total = count ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const { data: designers } = await supabase
        .from("designers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

    const pageUrl = (p: number) => {
        const params = new URLSearchParams();
        params.set("page", String(p));
        if (tab !== "active") params.set("tab", tab);
        if (q) params.set("q", q);
        if (fStatus) params.set("status", fStatus);
        if (fMethod) params.set("method", fMethod);
        if (fSource) params.set("source", fSource);
        if (fPrint) params.set("print", fPrint);
        if (fPost) params.set("post", fPost);
        if (fConsult) params.set("consult", fConsult);
        if (fDateFrom) params.set("dateFrom", fDateFrom);
        if (fDateTo) params.set("dateTo", fDateTo);
        if (fSortBy) params.set("sortBy", fSortBy);
        if (fSortDir) params.set("sortDir", fSortDir);
        return `/board?${params.toString()}`;
    };

    return (
        <div
            style={{
                width: "100%",
                maxWidth: 1260,
                margin: "0 auto",
                padding: "0 16px 40px",
            }}
        >
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    paddingTop: 16,
                    marginBottom: 4,
                }}
            >
                <p style={{ color: "#9ca3af", margin: 0 }}>
                    총 <strong style={{ color: "#111827" }}>{total}</strong>건
                    {q && (
                        <span style={{ marginLeft: 8, color: "#6b7280" }}>
                            &quot;{q}&quot; 검색결과
                            <Link
                                href="/board"
                                style={{
                                    marginLeft: 6,
                                    color: "#ef4444",
                                    textDecoration: "none",
                                }}
                            >
                                ✕
                            </Link>
                        </span>
                    )}
                </p>
            </div>

            <FilterBar
                currentStatus={tab === "done" ? "" : fStatus ?? ""}
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
                designers={designers ?? []}
                canEditDesigner={isAdmin || isDesigner}
                writeButton={tab !== "done" ? <WriteButton /> : undefined}
            />

            <Pagination page={page} totalPages={totalPages} pageUrl={pageUrl} />
        </div>
    );
}
