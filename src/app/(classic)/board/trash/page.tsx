// src/app/(classic)/board/trash/page.tsx
import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth/isAdmin";
import TrashClient, { type TrashTask } from "./TrashClient";
import Link from "next/link";
import Pagination from "../Pagination";
import { createClient } from "@/lib/supabase/server";
import { TaskWithDesigner } from "@/types/database";

const PAGE_SIZE = 15; //페이지 수

export default async function TrashPage({
    searchParams,
}: {
    searchParams: Promise<{ page?: string }>;
}) {
    const { user, isAdmin } = await getUserWithRole();
    if (!user) redirect("/login");
    if (!isAdmin) redirect("/board");

    // 1. 페이지 계산
    const { page: pageParam } = await searchParams;
    const page = Math.max(1, Number(pageParam ?? 1));
    const from = (page - 1) * PAGE_SIZE;

    // 2. 15개씩 잘라서 가져오기
    const supabase = await createClient();
    const { data, count, error } = await supabase
        .from("tasks")
        .select(
            "id, task_number, customer_name, order_source, order_method, print_items, status, is_priority, created_at, deleted_at, designer:designers(id, name)",
            { count: "exact" },
        )
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

    // 범위를 벗어난 페이지 접근 시 1페이지로 리다이렉트
    if (error?.code === "PGRST103") redirect("/board/trash");

    // 1. 데이터를 가져온 후, TrashClient가 원하는 형식(TrashTask)으로 강제 변환합니다.
    const tasks: TrashTask[] = (data ?? []).map((t) => ({
        ...t,
        deleted_at: t.deleted_at || "", // null 방지 로직
        // designer 데이터가 DB 구조상 배열로 올 수도 있으니 안전하게 처리
        designer: (t.designer as any) || null,
    }));

    const total = count ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    const pageUrl = (p: number) => `/board/trash?page=${p}`;

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
                        alignItems: "flex-start",
                        gap: 10,
                        marginBottom: 20,
                        paddingTop: 4,
                    }}
                >
                    <span style={{ fontSize: 20 }}>🗑</span>
                    <div>
                        <h2
                            style={{
                                margin: 0,
                                fontWeight: 800,
                                color: "#111827",
                                fontSize: 20,
                            }}
                        >
                            휴지통
                        </h2>
                        <p style={{ margin: 0, color: "#9ca3af" }}>
                            삭제된 작업 {tasks.length}건을 복구하거나 영구삭제할
                            수 있습니다
                        </p>
                    </div>
                </div>

                <TrashClient tasks={tasks} />
                <Pagination page={page} totalPages={totalPages} pageUrl={pageUrl} />
            </div>
    );
}
