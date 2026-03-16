// src/app/(classic)/board/designers/[id]/page.tsx
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { TaskWithDesigner } from "@/types/database";
import BoardTable from "../../BoardTable";
import DesignerProfilePanel from "./DesignerProfilePanel";
import WriteButton from "../../WriteButton";

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, " +
    "status, is_priority, is_quick, created_at, deleted_at, " +
    "designer:designers(id, name)";

const PAGE_SIZE = 5;

const STATUS_COLORS: Record<
    string,
    { bg: string; color: string; border: string }
> = {
    대기중: { bg: "#f4f4f5", color: "#71717a", border: "#e4e4e7" },
    진행중: { bg: "#fffbeb", color: "#b45309", border: "#fde68a" },
    검수대기: { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
};

export default async function DesignerBoardPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ page?: string; status?: string; q?: string }>;
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
    const { page: pageParam, status: filterStatus, q } = await searchParams;

    // 디자이너 정보 조회
    const { data: designer } = await supabase
        .from("designers")
        .select("id, name, status, avatar_url, user_id")
        .eq("id", id)
        .single();

    if (!designer) notFound();

    // notFound() 이후 TypeScript 타입 좁히기
    const d = designer as {
        id: string;
        name: string;
        status: string;
        avatar_url: string | null;
        user_id: string | null;
    };

    // 권한 체크: 관리자 또는 본인만 접근 가능
    if (!isAdmin && !(isDesigner && d.user_id === user.id)) {
        redirect("/board");
    }

    // 본인 여부 (디자이너가 자기 페이지 보는 경우)
    const isOwn = isDesigner && d.user_id === user.id;

    const page = Math.max(1, Number(pageParam ?? 1));
    const from = (page - 1) * PAGE_SIZE;

    let query = supabase
        .from("tasks")
        .select(TASK_SELECT, { count: "exact" })
        .is("deleted_at", null)
        .neq("status", "완료")
        .eq("assigned_designer_id", id)
        .order("is_priority", { ascending: false })
        .order("created_at", { ascending: false })
        .range(from, from + PAGE_SIZE - 1);

    if (filterStatus) query = query.eq("status", filterStatus);
    if (q?.trim()) query = query.ilike("customer_name", `%${q.trim()}%`);

    const { data, count, error } = await query;
    if (error?.code === "PGRST103") redirect(`/board/designers/${id}`);

    const tasks = (data ?? []) as unknown as TaskWithDesigner[];
    const total = count ?? 0;
    const totalPages = Math.ceil(total / PAGE_SIZE);

    // 상태별 통계
    const { data: statRows } = await supabase
        .from("tasks")
        .select("status")
        .is("deleted_at", null)
        .neq("status", "완료")
        .eq("assigned_designer_id", id);

    const statMap: Record<string, number> = {
        대기중: 0,
        진행중: 0,
        검수대기: 0,
    };
    (statRows ?? []).forEach((r) => {
        if (statMap[r.status] !== undefined) statMap[r.status]++;
    });

    // 전체 완료 건수
    const { count: doneCount } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .eq("status", "완료")
        .eq("assigned_designer_id", id);

    // 우선작업 건수
    const { count: priorityCount } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .is("deleted_at", null)
        .neq("status", "완료")
        .eq("assigned_designer_id", id)
        .eq("is_priority", true);

    const stats = {
        active: total,
        done: doneCount ?? 0,
        priority: priorityCount ?? 0,
        statusMap: statMap,
    };

    const allDesigners = isAdmin
        ? ((
              await supabase
                  .from("designers")
                  .select("id, name")
                  .eq("is_active", true)
                  .order("name")
          ).data ?? [])
        : [];

    const pageUrl = (p: number) =>
        `/board/designers/${id}?page=${p}${filterStatus ? `&status=${filterStatus}` : ""}`;

    const ds: Record<string, { dot: string }> = {
        여유: { dot: "#1ED67D" },
        작업중: { dot: "#f59e0b" },
        바쁨: { dot: "#ef4444" },
    };
    const dot = ds[d.status]?.dot ?? "#d1d5db";

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
                {/* 프로필 + 통계 패널 */}
                <DesignerProfilePanel
                    designer={d}
                    stats={stats}
                    isOwn={isOwn}
                />

                {/* 상태 필터 탭 */}
                <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                    {(["대기중", "진행중", "검수대기"] as const).map((s) => {
                        const sc = STATUS_COLORS[s];
                        const isActive = filterStatus === s;
                        return (
                            <Link
                                key={s}
                                href={`/board/designers/${id}?status=${isActive ? "" : s}`}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 6,
                                    padding: "6px 14px",
                                    borderRadius: 8,
                                    textDecoration: "none",
                                    background: isActive ? sc.bg : "#fff",
                                    border: `1px solid ${isActive ? sc.border : "#e5e7eb"}`,
                                    color: isActive ? sc.color : "#6b7280",
                                    fontWeight: isActive ? 700 : 400,
                                    transition: "all 0.1s",
                                }}
                            >
                                <span
                                    style={{
                                        fontWeight: 800,
                                        color: isActive ? sc.color : "#111827",
                                    }}
                                >
                                    {statMap[s]}
                                </span>
                                <span>{s}</span>
                            </Link>
                        );
                    })}
                </div>

                {/* 등록하기 버튼 — 관리자만 */}
                {isAdmin && (
                    <div
                        style={{
                            display: "flex",
                            justifyContent: "flex-end",
                            marginBottom: 8,
                        }}
                    >
                        <WriteButton designers={allDesigners} />
                    </div>
                )}

                {/* 작업 목록
                    - isAdmin: 전체 수정 가능
                    - isOwn(본인 디자이너): 상태 변경만 가능 (isAdmin=false)
                */}
                <BoardTable
                    tasks={tasks}
                    total={total}
                    from={from}
                    designers={allDesigners}
                    isAdmin={isAdmin}
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
