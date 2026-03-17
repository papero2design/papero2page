// src/app/(classic)/board/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TaskWithDesigner } from "@/types/database";
import BoardTable from "./BoardTable";
import WriteButton from "./WriteButton";
import FilterBar from "./FilterBar";

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, " +
    "status, is_priority, is_quick, created_at, deleted_at, " +
    "designer:designers(id, name)";

const PAGE_SIZE = 5;

export default async function BoardPage({
    searchParams,
}: {
    searchParams: Promise<{
        page?: string;
        q?: string;
        status?: string;
        designer?: string;
        method?: string;
        source?: string;
        print?: string;
        post?: string;
        consult?: string;
        dateFrom?: string;
        dateTo?: string;
    }>;
}) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    const isAdmin = profileData?.role === "admin";
    const isDesigner = profileData?.role === "designer";

    if (isDesigner) {
        const { data: myDesigner } = await supabase
            .from("designers")
            .select("id")
            .eq("user_id", user.id)
            .single();
        if (myDesigner) redirect(`/board/designers/${myDesigner.id}`);
    }

    const {
        page: pageParam,
        q,
        status: fStatus,
        designer: fDesigner,
        method: fMethod,
        source: fSource,
        print: fPrint,
        post: fPost,
        consult: fConsult,
        dateFrom: fDateFrom,
        dateTo: fDateTo,
    } = await searchParams;

    const page = Math.max(1, Number(pageParam ?? 1));
    const from = (page - 1) * PAGE_SIZE;

    let query = supabase
        .from("tasks")
        .select(TASK_SELECT, { count: "exact" })
        .is("deleted_at", null)
        .neq("status", "완료")
        .order("is_priority", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

    // 검색 + 필터 전부 적용
    if (q?.trim()) query = query.ilike("customer_name", `%${q.trim()}%`);
    if (fStatus) query = query.eq("status", fStatus);
    if (fDesigner) query = query.eq("assigned_designer_id", fDesigner);
    if (fMethod) query = query.eq("order_method", fMethod);
    if (fSource) query = query.eq("order_source", fSource);
    if (fPrint?.trim())
        query = query.ilike("print_items", `%${fPrint.trim()}%`);
    if (fPost) query = query.eq("post_processing", fPost);
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
        if (q) params.set("q", q);
        if (fStatus) params.set("status", fStatus);
        if (fDesigner) params.set("designer", fDesigner);
        if (fMethod) params.set("method", fMethod);
        if (fSource) params.set("source", fSource);
        if (fPrint) params.set("print", fPrint);
        if (fPost) params.set("post", fPost);
        if (fConsult) params.set("consult", fConsult);
        if (fDateFrom) params.set("dateFrom", fDateFrom);
        if (fDateTo) params.set("dateTo", fDateTo);
        return `/board?${params.toString()}`;
    };

    return (
        <>
            <style>{`
                .bo-btn { display:inline-block; padding:6px 14px; font-weight:600; border:1px solid #e5e7eb; border-radius:4px; background:#fff; color:#374151; cursor:pointer; text-decoration:none; transition:background 0.1s; }
                .bo-btn:hover { background:#f9fafb; }
                .pg-wrap { margin-top:20px; text-align:center; }
                .pg-wrap span { display:inline-flex; gap:4px; flex-wrap:wrap; justify-content:center; }
                .pg-link { display:inline-flex; align-items:center; justify-content:center; min-width:32px; height:30px; padding:2px 8px; border:1px solid #e5e7eb; border-radius:4px; background:#fff; color:#6b7280; text-decoration:none; transition:background 0.1s; }
                .pg-link:hover { background:#f9fafb; }
                .pg-link.active { background:#111827; color:#fff; border-color:#111827; font-weight:700; }
            `}</style>

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
                        총 <strong style={{ color: "#111827" }}>{total}</strong>
                        건
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
                    designers={designers ?? []}
                    currentStatus={fStatus ?? ""}
                    currentDesigner={fDesigner ?? ""}
                    currentMethod={fMethod ?? ""}
                    currentSource={fSource ?? ""}
                    currentPrint={fPrint ?? ""}
                    currentPost={fPost ?? ""}
                    currentConsult={fConsult ?? ""}
                    currentDateFrom={fDateFrom ?? ""}
                    currentDateTo={fDateTo ?? ""}
                />

                <BoardTable
                    tasks={tasks}
                    total={total}
                    from={from}
                    designers={designers ?? []}
                    isAdmin={isAdmin}
                    writeButton={<WriteButton designers={designers ?? []} />}
                />

                {totalPages > 1 && (
                    <nav className="pg-wrap">
                        <span>
                            {page > 1 && (
                                <Link href={pageUrl(1)} className="pg-link">
                                    맨처음
                                </Link>
                            )}
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter((p) => Math.abs(p - page) <= 4)
                                .map((p) => (
                                    <Link
                                        key={p}
                                        href={pageUrl(p)}
                                        className={`pg-link${p === page ? " active" : ""}`}
                                    >
                                        {p}
                                    </Link>
                                ))}
                            {page < totalPages && (
                                <Link
                                    href={pageUrl(totalPages)}
                                    className="pg-link"
                                >
                                    맨끝
                                </Link>
                            )}
                        </span>
                    </nav>
                )}
            </div>
        </>
    );
}
