import { redirect } from "next/navigation";
import Link from "next/link";
import { Box, Typography, Paper, Avatar, Divider } from "@mui/material";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { createClient } from "@/lib/supabase/server";
import { Designer, TaskWithDesigner, RecentDoneTask } from "@/types/database";
import { fontSize } from "@/lib/theme/tokens";
import TaskBoardList from "./TaskBoardList";

// ─── 공통 SELECT ─────────────────────────────────────────────

const TASK_SELECT =
    "id, order_source, customer_name, order_method, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, special_details, " +
    "status, is_priority, is_quick, created_at, " +
    "designer:designers(name)";

// ─── 헬퍼 컴포넌트 ───────────────────────────────────────────

function SectionTitle({
    title,
    sub,
    href,
}: {
    title: string;
    sub?: string;
    href?: string;
}) {
    return (
        <Box
            sx={{
                display: "flex",
                alignItems: "flex-end",
                justifyContent: "space-between",
                mb: 1.5,
            }}
        >
            <Box>
                <Typography variant="h3" color="text.primary">
                    {title}
                </Typography>
                {sub && (
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        mt={0.25}
                    >
                        {sub}
                    </Typography>
                )}
            </Box>
            {href && (
                <Link href={href} style={{ textDecoration: "none" }}>
                    <Typography
                        variant="caption"
                        color="text.disabled"
                        sx={{
                            fontWeight: 600,
                            "&:hover": { color: "primary.main" },
                            transition: "color 0.15s",
                        }}
                    >
                        전체보기 →
                    </Typography>
                </Link>
            )}
        </Box>
    );
}

function DesignerStatusChip({ status }: { status: string }) {
    const map: Record<string, { color: string; bg: string }> = {
        바쁨: { color: "error.main", bg: "error.light" },
        작업중: { color: "warning.main", bg: "warning.light" },
        여유: { color: "success.main", bg: "success.light" },
    };
    const s = map[status] ?? map["여유"];
    return (
        <Box
            component="span"
            sx={{
                fontSize: "0.6875rem",
                fontWeight: 700,
                px: 1,
                py: 0.25,
                borderRadius: 99,
                color: s.color,
                bgcolor: s.bg,
            }}
        >
            {status}
        </Box>
    );
}

// ─── 페이지 ──────────────────────────────────────────────────

export default async function TasksPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");
    const isAdmin = user.user_metadata?.role === "admin";

    const [
        { data: priorityTasks },
        { data: quickTasks },
        { data: allTasks },
        { data: recentDone },
        { data: designers },
    ] = await Promise.all([
        // 🚨 우선 작업
        supabase
            .from("tasks")
            .select(TASK_SELECT)
            .eq("is_priority", true)
            .is("deleted_at", null)
            .neq("status", "완료")
            .order("created_at", { ascending: false })
            .limit(5),

        // 🟢 간단 작업 (우선작업 제외)
        supabase
            .from("tasks")
            .select(TASK_SELECT)
            .eq("is_quick", true)
            .eq("is_priority", false)
            .is("deleted_at", null)
            .neq("status", "완료")
            .order("created_at", { ascending: false })
            .limit(5),

        // 전체 목록 — 우선작업 상단 고정 후 최신순
        supabase
            .from("tasks")
            .select(TASK_SELECT)
            .is("deleted_at", null)
            .neq("status", "완료")
            .order("is_priority", { ascending: false })
            .order("created_at", { ascending: false })
            .limit(20),

        // 최근 완료
        supabase
            .from("tasks")
            .select(
                "id, customer_name, order_source, print_items, completed_at, designer:designers(name)",
            )
            .eq("status", "완료")
            .is("deleted_at", null)
            .order("completed_at", { ascending: false })
            .limit(6),

        // 디자이너
        supabase
            .from("designers")
            .select("id, name, status, avatar_url")
            .eq("is_active", true)
            .order("name"),
    ]);

    const today = new Date().toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
    });

    const typedPriority = (priorityTasks ??
        []) as unknown as TaskWithDesigner[];
    const typedQuick = (quickTasks ?? []) as unknown as TaskWithDesigner[];
    const typedAll = (allTasks ?? []) as unknown as TaskWithDesigner[];
    const typedDone = (recentDone ?? []) as unknown as RecentDoneTask[];

    return (
        <Box>
            {/* ── 페이지 헤더 ── */}
            <Box
                sx={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    mb: 4,
                }}
            >
                <Box>
                    <Typography variant="h1" color="text.primary">
                        작업 목록
                    </Typography>
                    <Typography
                        variant="caption"
                        color="text.secondary"
                        display="block"
                        mt={0.5}
                    >
                        {today}
                    </Typography>
                </Box>
                <Link href="/tasks/new" style={{ textDecoration: "none" }}>
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 0.75,
                            bgcolor: "primary.main",
                            color: "primary.contrastText",
                            fontWeight: 700,
                            fontSize: fontSize.body1,
                            px: 2.25,
                            py: 1,
                            borderRadius: 2.5,
                            cursor: "pointer",
                            transition: "all 0.15s",
                            "&:hover": { bgcolor: "primary.dark" },
                        }}
                    >
                        <AddIcon sx={{ fontSize: 17 }} />
                        작업 등록
                    </Box>
                </Link>
            </Box>

            {/* ── 우선 작업 ── */}
            {typedPriority.length > 0 && (
                <Box mb={5}>
                    <SectionTitle
                        title="🚨 우선 작업"
                        sub={`${typedPriority.length}건 · 즉시 처리 필요`}
                        href="/tasks?filter=priority"
                    />
                    <Box sx={{ overflowX: "auto" }}>
                        <TaskBoardList tasks={typedPriority} />
                    </Box>
                </Box>
            )}

            {/* ── 간단 작업 ── */}
            {typedQuick.length > 0 && (
                <Box mb={5}>
                    <SectionTitle
                        title="🟢 간단 작업"
                        sub={`${typedQuick.length}건 · 수정 없음 · 파일 직접 제공`}
                        href="/tasks?filter=quick"
                    />
                    <Box sx={{ overflowX: "auto" }}>
                        <TaskBoardList tasks={typedQuick} />
                    </Box>
                </Box>
            )}

            {/* ── 디자이너별 현황 (관리자 전용) ── */}
            {isAdmin && (designers ?? []).length > 0 && (
                <Box mb={5}>
                    <SectionTitle
                        title="👤 디자이너별 현황"
                        sub="관리자 전용"
                        href="/designers"
                    />
                    <Box
                        sx={{
                            display: "grid",
                            gridTemplateColumns:
                                "repeat(auto-fill, minmax(180px, 1fr))",
                            gap: 1.5,
                        }}
                    >
                        {(designers as Designer[]).map((d) => (
                            <Link
                                key={d.id}
                                href={`/designers/${d.id}`}
                                style={{ textDecoration: "none" }}
                            >
                                <Paper
                                    elevation={0}
                                    sx={{
                                        p: 2.5,
                                        borderRadius: 3,
                                        border: "1px solid",
                                        borderColor: "divider",
                                        transition:
                                            "border-color 0.15s, box-shadow 0.15s",
                                        "&:hover": {
                                            borderColor: "primary.main",
                                            boxShadow:
                                                "0 4px 16px rgba(30,214,125,0.12)",
                                        },
                                    }}
                                >
                                    <Box
                                        sx={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1.5,
                                        }}
                                    >
                                        <Avatar
                                            src={d.avatar_url ?? undefined}
                                            sx={{
                                                width: 38,
                                                height: 38,
                                                bgcolor: "primary.dark",
                                                fontSize: "0.875rem",
                                                fontWeight: 800,
                                            }}
                                        >
                                            {d.name[0]}
                                        </Avatar>
                                        <Box>
                                            <Typography
                                                variant="h6"
                                                color="text.primary"
                                            >
                                                {d.name}
                                            </Typography>
                                            <DesignerStatusChip
                                                status={d.status}
                                            />
                                        </Box>
                                    </Box>
                                </Paper>
                            </Link>
                        ))}
                    </Box>
                </Box>
            )}

            {/* ── 전체 작업 목록 ── */}
            <Box mb={5}>
                <Box
                    sx={{
                        display: "flex",
                        alignItems: "flex-end",
                        justifyContent: "space-between",
                        mb: 1.5,
                    }}
                >
                    <Box>
                        <Typography variant="h3" color="text.primary">
                            📋 전체 작업 목록
                        </Typography>
                        <Typography
                            variant="caption"
                            color="text.secondary"
                            display="block"
                            mt={0.25}
                        >
                            진행 중인 작업 최근 20건 · 우선작업 상단 고정
                        </Typography>
                    </Box>
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        {["전체", "대기중", "진행중", "검수대기"].map((f) => (
                            <Link
                                key={f}
                                href={
                                    f === "전체"
                                        ? "/tasks"
                                        : `/tasks?status=${f}`
                                }
                                style={{ textDecoration: "none" }}
                            >
                                <Box
                                    sx={{
                                        fontSize: 12,
                                        fontWeight: 600,
                                        px: 1.5,
                                        py: 0.5,
                                        borderRadius: 99,
                                        border: "1px solid",
                                        borderColor: "divider",
                                        color: "text.secondary",
                                        transition: "all 0.15s",
                                        "&:hover": {
                                            borderColor: "primary.main",
                                            color: "primary.main",
                                        },
                                    }}
                                >
                                    {f}
                                </Box>
                            </Link>
                        ))}
                    </Box>
                </Box>
                <Box sx={{ overflowX: "auto" }}>
                    <TaskBoardList tasks={typedAll} />
                </Box>
                <Box
                    sx={{
                        mt: 1.5,
                        display: "flex",
                        justifyContent: "flex-end",
                    }}
                >
                    <Link href="/tasks/all" style={{ textDecoration: "none" }}>
                        <Typography
                            variant="caption"
                            sx={{
                                fontWeight: 600,
                                color: "text.disabled",
                                "&:hover": { color: "primary.main" },
                                transition: "color 0.15s",
                            }}
                        >
                            전체 작업 보기 →
                        </Typography>
                    </Link>
                </Box>
            </Box>

            {/* ── 하단 2열: 최근 완료 + 지난 견적 ── */}
            <Box
                sx={{
                    display: "grid",
                    gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" },
                    gap: 3,
                    mb: 6,
                }}
            >
                {/* 최근 완료 */}
                <Box>
                    <SectionTitle
                        title="✅ 최근 완료"
                        sub="완료 처리된 최근 작업"
                        href="/tasks?filter=done"
                    />
                    <Paper
                        elevation={0}
                        sx={{
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 3,
                            overflow: "hidden",
                        }}
                    >
                        {typedDone.length === 0 ? (
                            <Box sx={{ p: 4, textAlign: "center" }}>
                                <Typography
                                    variant="body2"
                                    color="text.disabled"
                                >
                                    완료된 작업이 없습니다.
                                </Typography>
                            </Box>
                        ) : (
                            typedDone.map((task, i, arr) => (
                                <Box key={task.id}>
                                    <Link
                                        href={`/tasks/${task.id}`}
                                        style={{ textDecoration: "none" }}
                                    >
                                        <Box
                                            sx={{
                                                px: 2.5,
                                                py: 1.75,
                                                display: "flex",
                                                alignItems: "center",
                                                gap: 1.5,
                                                "&:hover": {
                                                    bgcolor:
                                                        "background.default",
                                                },
                                                transition: "background 0.1s",
                                            }}
                                        >
                                            <Box
                                                sx={{
                                                    width: 7,
                                                    height: 7,
                                                    borderRadius: "50%",
                                                    bgcolor: "success.main",
                                                    flexShrink: 0,
                                                }}
                                            />
                                            <Box sx={{ flex: 1, minWidth: 0 }}>
                                                <Typography
                                                    variant="h6"
                                                    color="text.primary"
                                                    noWrap
                                                >
                                                    {task.customer_name}
                                                </Typography>
                                                <Typography
                                                    variant="caption"
                                                    color="text.secondary"
                                                    display="block"
                                                    noWrap
                                                >
                                                    {task.order_source} ·{" "}
                                                    {task.designer?.[0]?.name ??
                                                        "미배정"}
                                                </Typography>
                                            </Box>
                                            <Typography
                                                variant="caption"
                                                color="text.disabled"
                                                sx={{ flexShrink: 0 }}
                                            >
                                                {task.completed_at
                                                    ? new Date(
                                                          task.completed_at,
                                                      ).toLocaleDateString(
                                                          "ko-KR",
                                                          {
                                                              month: "2-digit",
                                                              day: "2-digit",
                                                          },
                                                      )
                                                    : "—"}
                                            </Typography>
                                        </Box>
                                    </Link>
                                    {i < arr.length - 1 && <Divider />}
                                </Box>
                            ))
                        )}
                    </Paper>
                </Box>

                {/* 지난 견적 */}
                <Box>
                    <SectionTitle
                        title="💰 지난 견적"
                        sub="발행된 견적 내역"
                        href="/tasks?filter=quote"
                    />
                    <Paper
                        elevation={0}
                        sx={{
                            border: "1px solid",
                            borderColor: "divider",
                            borderRadius: 3,
                            overflow: "hidden",
                        }}
                    >
                        <Box sx={{ p: 4, textAlign: "center" }}>
                            <Typography variant="body2" color="text.disabled">
                                견적 기능 준비 중입니다.
                            </Typography>
                        </Box>
                    </Paper>
                </Box>
            </Box>
        </Box>
    );
}
