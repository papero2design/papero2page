// src/app/(classic)/board/done/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import DoneClient from "./DoneClient";

const DONE_SELECT =
    "id, task_number, customer_name, order_source, order_method, " +
    "print_items, post_processing, completed_at, created_at, " +
    "designer:designers(id, name)";

const PAGE_SIZE = 5;

type DoneTask = {
    id: string;
    task_number: number | null;
    customer_name: string;
    order_source: string;
    order_method: string;
    print_items: string;
    post_processing: string | null;
    completed_at: string | null;
    created_at: string;
    designer: { id: string; name: string } | null;
};

export default async function DonePage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string; q?: string }>;
}) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { page: pageParam, q } = await searchParams;
    const page = Math.max(1, Number(pageParam ?? 1));
    const from = (page - 1) * PAGE_SIZE;

    let query = supabase
        .from("tasks")
        .select(DONE_SELECT, { count: "exact" })
        .is("deleted_at", null)
        .eq("status", "완료")
        .order("completed_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

    if (q?.trim()) query = query.ilike("customer_name", `%${q.trim()}%`);

    const { data, count, error } = await query;
    if (error?.code === "PGRST103") redirect("/board/done");

    const tasks = (data ?? []) as unknown as DoneTask[];
    const total = count ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const pageUrl = (p: number) =>
        `/board/done?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

    return (
        <>
            <style>{`
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
                {/* 헤더 */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: 16,
                        paddingTop: 16,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                        }}
                    >
                        <span
                            style={{
                                padding: "2px 8px",
                                background: "#f0fdf4",
                                border: "1px solid #bbf7d0",
                                borderRadius: 6,
                                color: "#15803d",
                                fontWeight: 700,
                            }}
                        >
                            완료
                        </span>
                        <p style={{ color: "#9ca3af", margin: 0 }}>
                            총{" "}
                            <strong style={{ color: "#111827" }}>
                                {total}
                            </strong>
                            건
                            {q && (
                                <span
                                    style={{ marginLeft: 8, color: "#6b7280" }}
                                >
                                    &quot;{q}&quot; 검색결과
                                    <Link
                                        href="/board/done"
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
                    {/* 검색 */}
                    <form
                        action="/board/done"
                        method="GET"
                        style={{ display: "flex", gap: 6 }}
                    >
                        <input
                            type="text"
                            name="q"
                            defaultValue={q ?? ""}
                            placeholder="고객이름 검색"
                            style={{
                                padding: "5px 10px",
                                border: "1px solid #e5e7eb",
                                borderRadius: 6,
                                outline: "none",
                                width: 160,
                            }}
                        />
                        <button
                            type="submit"
                            style={{
                                padding: "5px 12px",
                                background: "#111827",
                                color: "#fff",
                                border: "none",
                                borderRadius: 6,
                                cursor: "pointer",
                                fontWeight: 600,
                            }}
                        >
                            검색
                        </button>
                    </form>
                </div>

                {/* 테이블 — tbody만 Client Component로 분리 */}
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                        <tr
                            style={{
                                borderTop: "2px solid #111827",
                                borderBottom: "1px solid #e5e7eb",
                                background: "#f9fafb",
                            }}
                        >
                            {[
                                "번호",
                                "고객이름",
                                "주문방법",
                                "인쇄항목",
                                "담당 디자이너",
                                "완료일시",
                            ].map((h) => (
                                <th
                                    key={h}
                                    style={{
                                        padding: "10px 12px",
                                        fontWeight: 700,
                                        color: "#6b7280",
                                        textAlign: "left",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {/* 클릭 → 모달 처리는 Client Component에서 */}
                        <DoneClient tasks={tasks} />
                    </tbody>
                </table>

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
