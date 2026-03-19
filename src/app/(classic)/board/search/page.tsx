// src/app/(classic)/board/search/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TaskWithDesigner } from "@/types/database";
import BoardTable from "../BoardTable";
import Pagination from "../Pagination";

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, registered_by, " +
    "status, is_priority, is_quick, created_at, deleted_at, " +
    "designer:designers(id, name)";

const PAGE_SIZE = 25;

export default async function SearchPage({
    searchParams,
}: {
    searchParams: Promise<{ q?: string; page?: string }>;
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

    const { q, page: pageParam } = await searchParams;
    const term = q?.trim() ?? "";

    if (!term) redirect("/board");

    const page = Math.max(1, Number(pageParam ?? 1));
    const from = (page - 1) * PAGE_SIZE;

    const orParts = [
        `customer_name.ilike.%${term}%`,
        `print_items.ilike.%${term}%`,
        `special_details.ilike.%${term}%`,
    ];
    const numTerm = Number(term);
    if (!isNaN(numTerm) && term !== "") {
        orParts.push(`task_number.eq.${numTerm}`);
    }

    const [{ data, count, error }, { data: designers }] = await Promise.all([
        supabase
            .from("tasks")
            .select(TASK_SELECT, { count: "exact" })
            .is("deleted_at", null)
            .or(orParts.join(","))
            .order("created_at", { ascending: false })
            .range(from, from + PAGE_SIZE - 1),
        supabase
            .from("designers")
            .select("id, name")
            .eq("is_active", true)
            .order("name"),
    ]);

    if (error?.code === "PGRST103")
        redirect(`/board/search?q=${encodeURIComponent(term)}`);

    const tasks = (data ?? []) as unknown as TaskWithDesigner[];
    const total = count ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const pageUrl = (p: number) => {
        const params = new URLSearchParams({ q: term });
        if (p > 1) params.set("page", String(p));
        return `/board/search?${params.toString()}`;
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
            {/* 검색 헤더 */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    paddingTop: 16,
                    marginBottom: 4,
                }}
            >
                <Link
                    href="/board"
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        color: "#6b7280",
                        textDecoration: "none",
                        fontSize: 13,
                        padding: "4px 10px",
                        border: "1px solid #e5e7eb",
                        borderRadius: 6,
                        background: "#fff",
                    }}
                >
                    ← 돌아가기
                </Link>
                <p style={{ margin: 0, color: "#9ca3af", fontSize: 14 }}>
                    <strong style={{ color: "#111827" }}>
                        &quot;{term}&quot;
                    </strong>{" "}
                    검색결과{" "}
                    <strong style={{ color: "#111827" }}>{total}</strong>건
                    <span style={{ color: "#d1d5db", marginLeft: 6, fontSize: 12 }}>
                        고객이름 · 인쇄항목 · 특이사항
                    </span>
                </p>
            </div>

            {/* 결과 없음 */}
            {tasks.length === 0 && (
                <div
                    style={{
                        textAlign: "center",
                        padding: "80px 0",
                        color: "#9ca3af",
                    }}
                >
                    <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
                    <div style={{ fontSize: 15 }}>
                        <strong style={{ color: "#6b7280" }}>
                            &quot;{term}&quot;
                        </strong>
                        에 해당하는 작업이 없어요.
                    </div>
                </div>
            )}

            {/* 결과 테이블 — BoardTable 그대로 사용 */}
            {tasks.length > 0 && (
                <BoardTable
                    tasks={tasks}
                    total={total}
                    from={from}
                    designers={designers ?? []}
                    canEditDesigner={isAdmin || isDesigner}
                />
            )}

            <Pagination page={page} totalPages={totalPages} pageUrl={pageUrl} />
        </div>
    );
}
