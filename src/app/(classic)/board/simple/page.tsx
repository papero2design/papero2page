// src/app/(classic)/board/simple/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserWithRole } from "@/lib/auth/isAdmin";
import { TaskWithDesigner } from "@/types/database";
import BoardTable from "../BoardTable";
import WriteButton from "../WriteButton";

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, " +
    "status, is_priority, is_quick, created_at, deleted_at, " +
    "designer:designers(id, name)";

const PAGE_SIZE = 5;

export default async function SimplePage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>;
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

    const { page: pageParam } = await searchParams;
    const page = Math.max(1, Number(pageParam ?? 1));
    const from = (page - 1) * PAGE_SIZE;

    const { data, count, error } = await supabase
        .from("tasks")
        .select(TASK_SELECT, { count: "exact" })
        .is("deleted_at", null)
        .neq("status", "완료")
        .eq("is_quick", true)
        .order("is_priority", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

    if (error?.code === "PGRST103") redirect("/board/simple");

    const tasks = (data ?? []) as unknown as TaskWithDesigner[];
    const total = count ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const { data: designers } = await supabase
        .from("designers")
        .select("id, name")
        .eq("is_active", true)
        .order("created_at");

    const pageUrl = (p: number) => `/board/simple?page=${p}`;

    return (
        <>
            <style>{`
                .bo-btn { display:inline-block; padding:6px 14px; font-weight:600; border:1px solid #e5e7eb; border-radius:4px; background:#fff; color:#374151; cursor:pointer; text-decoration:none; transition:background 0.1s; }
                .bo-btn:hover { background:#f9fafb; }
                .pg-wrap { margin-top:20px; text-align:center; }
                .pg-wrap span { display:inline-flex; gap:4px; flex-wrap:wrap; justify-content:center; }
                .pg-link { display:inline-flex; align-items:center; justify-content:center; min-width:32px; height:30px; padding:0 8px; border:1px solid #e5e7eb; border-radius:4px; background:#fff; color:#6b7280; text-decoration:none; }
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
                        alignItems: "center",
                        gap: 8,
                        marginBottom: 12,
                        paddingTop: 16,
                    }}
                >
                    <span
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            padding: "2px 8px",
                            background: "#f0fdf4",
                            border: "1px solid #86efac",
                            borderRadius: 6,
                            color: "#15803d",
                            fontWeight: 700,
                        }}
                    >
                        간단작업
                    </span>
                    <p style={{ color: "#9ca3af", margin: 0 }}>
                        총 <strong style={{ color: "#15803d" }}>{total}</strong>
                        건
                        <span style={{ marginLeft: 8, color: "#d1d5db" }}>
                            인쇄만 / 재주문(수정X)
                        </span>
                    </p>
                </div>

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
