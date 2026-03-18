// src/app/(classic)/board/quick/page.tsx
import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TaskWithDesigner } from "@/types/database";
import BoardTable from "../BoardTable";
import WriteButton from "../WriteButton";
import Pagination from "../Pagination";

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, special_details, registered_by, " +
    "status, is_priority, is_quick, created_at, deleted_at, " +
    "designer:designers(id, name)";

const PAGE_SIZE = 15;

export default async function QuickPage({
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
        .eq("is_priority", true)
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

    if (error?.code === "PGRST103") redirect("/board/quick");

    const tasks = (data ?? []) as unknown as TaskWithDesigner[];
    const total = count ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const { data: designers } = await supabase
        .from("designers")
        .select("id, name")
        .eq("is_active", true)
        .order("created_at");

    const pageUrl = (p: number) => `/board/quick?page=${p}`;

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
                            background: "#fef2f2",
                            border: "1px solid #fecaca",
                            borderRadius: 6,
                            color: "#dc2626",
                            fontWeight: 700,
                        }}
                    >
                        🚨 우선작업
                    </span>
                    <p style={{ color: "#9ca3af", margin: 0 }}>
                        총 <strong style={{ color: "#dc2626" }}>{total}</strong>
                        건
                    </p>
                </div>

                <BoardTable
                    tasks={tasks}
                    total={total}
                    from={from}
                    designers={designers ?? []}
                    isAdmin={isAdmin}
                    writeButton={<WriteButton />}
                    canEditDesigner={isAdmin}
                />

                <Pagination page={page} totalPages={totalPages} pageUrl={pageUrl} />
            </div>
    );
}
