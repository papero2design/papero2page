"use client";

import { useState } from "react";
import Link from "next/link";
import {
    Box,
    Typography,
    Checkbox,
    Modal,
    Paper,
    IconButton,
    Divider,
    Button,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import { TaskWithDesigner } from "@/types/database";

// ─── 뱃지 ────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
    const map: Record<string, { color: string; bg: string }> = {
        대기중: { color: "#71717A", bg: "#F4F4F5" },
        진행중: { color: "#D97706", bg: "#FFFBEB" },
        검수대기: { color: "#2563EB", bg: "#EFF6FF" },
        완료: { color: "#16A34A", bg: "#F0FDF4" },
    };
    const s = map[status] ?? map["대기중"];
    return (
        <Box
            sx={{
                display: "inline-block",
                fontSize: "body1",
                fontWeight: 700,
                px: 1,
                py: 0.25,
                borderRadius: 99,
                color: s.color,
                bgcolor: s.bg,
                whiteSpace: "nowrap",
            }}
        >
            {status}
        </Box>
    );
}

// 간단작업 주문방법 목록
const QUICK_METHODS = ["인쇄만 의뢰", "재주문(수정없는)"];

function MethodBadge({ method }: { method?: string | null }) {
    if (!method)
        return (
            <Typography sx={{ fontSize: "body2", color: "text.hint" }}>
                —
            </Typography>
        );
    const isQuick = QUICK_METHODS.includes(method);
    return (
        <Box
            sx={{
                display: "inline-block",
                fontSize: "body2",
                fontWeight: 700,
                px: 1,
                py: 0.25,
                borderRadius: 1,
                bgcolor: isQuick ? "success.light" : "action.selected",
                color: isQuick ? "success.dark" : "text.secondary",
                whiteSpace: "nowrap",
            }}
        >
            {method}
        </Box>
    );
}

// ─── 왼쪽 바 / dot 색상 ───────────────────────────────────────
// is_priority 또는 is_quick 플래그 + order_method 값 둘 다 체크
function isQuickTask(task: TaskWithDesigner): boolean {
    return task.is_quick || QUICK_METHODS.includes(task.order_method ?? "");
}

function getBarColor(task: TaskWithDesigner): string {
    if (task.is_priority) return "error.main";
    if (isQuickTask(task)) return "success.main";
    return "transparent";
}

// ─── 상세 모달 ────────────────────────────────────────────────

function TaskModal({
    task,
    onClose,
}: {
    task: TaskWithDesigner;
    onClose: () => void;
}) {
    const hasAlert = !!task.special_details;

    const fields: { label: string; value: string | null; alert?: boolean }[] = [
        { label: "주문경로", value: task.order_source },
        { label: "고객이름", value: task.customer_name },
        { label: "주문방법", value: task.order_method },
        { label: "인쇄항목", value: task.print_items },
        { label: "후가공", value: task.post_processing ?? "후가공없음" },
        { label: "파일전달경로", value: task.file_paths?.join("\n") ?? "없음" },
        { label: "상담경로", value: task.consult_path ?? "—" },
        {
            label: "처리특이사항",
            value: task.special_details ?? "없음",
            alert: hasAlert,
        },
        { label: "처리자", value: task.designer?.[0]?.name ?? "미배정" },
        {
            label: "접수일",
            value: new Date(task.created_at).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
            }),
        },
    ];

    return (
        <Modal
            open
            onClose={onClose}
            sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                p: 2,
            }}
        >
            <Paper
                elevation={0}
                sx={{
                    width: "100%",
                    maxWidth: 560,
                    borderRadius: 3,
                    border: "1px solid",
                    borderColor: "divider",
                    outline: "none",
                    overflow: "hidden",
                }}
            >
                {/* 헤더 */}
                <Box
                    sx={{
                        px: 3,
                        py: 2.5,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        borderBottom: "1px solid",
                        borderColor: "divider",
                        bgcolor: "background.default",
                    }}
                >
                    <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
                        <Typography
                            sx={{
                                fontSize: "body2",
                                fontWeight: 800,
                                color: "text.primary",
                            }}
                        >
                            {task.customer_name}
                        </Typography>
                        {task.is_priority && (
                            <Box
                                sx={{
                                    fontSize: "body2",
                                    fontWeight: 700,
                                    px: 1,
                                    py: 0.25,
                                    borderRadius: 99,
                                    bgcolor: "error.light",
                                    color: "error.main",
                                }}
                            >
                                긴급
                            </Box>
                        )}
                        {!task.is_priority && isQuickTask(task) && (
                            <Box
                                sx={{
                                    fontSize: "body2",
                                    fontWeight: 700,
                                    px: 1,
                                    py: 0.25,
                                    borderRadius: 99,
                                    bgcolor: "success.light",
                                    color: "success.main",
                                }}
                            >
                                간단 작업
                            </Box>
                        )}
                        <StatusBadge status={task.status} />
                    </Box>
                    <IconButton
                        onClick={onClose}
                        size="small"
                        sx={{ color: "text.hint" }}
                    >
                        <CloseIcon fontSize="small" />
                    </IconButton>
                </Box>

                {/* 필드 */}
                <Box
                    sx={{
                        px: 3,
                        py: 2.5,
                        display: "flex",
                        flexDirection: "column",
                        gap: 1.75,
                    }}
                >
                    {fields.map(({ label, value, alert }) => {
                        if (!value) return null;
                        return (
                            <Box
                                key={label}
                                sx={{
                                    display: "flex",
                                    gap: 2,
                                    alignItems: "flex-start",
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: "body2",
                                        fontWeight: 400,
                                        color: "text.secondary",
                                        minWidth: 96,
                                        flexShrink: 0,
                                        pt: "1px",
                                    }}
                                >
                                    {label}
                                </Typography>
                                <Typography
                                    sx={{
                                        fontSize: "body2",
                                        whiteSpace: "pre-line",
                                        color: alert
                                            ? "error.main"
                                            : "text.secondary",
                                        fontWeight: alert ? 800 : 600,
                                    }}
                                >
                                    {value}
                                </Typography>
                            </Box>
                        );
                    })}
                </Box>

                <Divider />
                <Box
                    sx={{
                        px: 3,
                        py: 2,
                        display: "flex",
                        justifyContent: "flex-end",
                    }}
                >
                    <Link
                        href={`/tasks/${task.id}`}
                        style={{ textDecoration: "none" }}
                    >
                        <Button
                            variant="contained"
                            size="small"
                            endIcon={<ArrowForwardIcon />}
                            sx={{
                                fontWeight: 700,
                                borderRadius: 2,
                                fontSize: "body2",
                            }}
                        >
                            수정
                        </Button>
                    </Link>
                </Box>
            </Paper>
        </Modal>
    );
}

// ─── 컬럼 정의 ───────────────────────────────────────────────
// 번호 | 체크 | dot | 고객이름 | 주문경로 | 주문방법 | 인쇄항목 | 후가공 | 파일전달 | 상담경로 | 특이사항 | 처리자 | 날짜
const GRID =
    "36px 8px 20px 200px 120px 1fr 1fr 120px 100px 150px 150px 150px 52px 52px";
const HEADERS = [
    "#",
    "",
    "",
    "고객이름",
    "주문경로",
    "주문방법",
    "인쇄항목",
    "후가공",
    "파일전달",
    "상담경로",
    "특이사항",
    "처리자",
    "날짜",
];

// ─── 메인 ─────────────────────────────────────────────────────

interface Props {
    tasks: TaskWithDesigner[];
    onMoveSelected?: (ids: string[]) => void;
}

export default function TaskBoardList({ tasks, onMoveSelected }: Props) {
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
    const [modalTask, setModalTask] = useState<TaskWithDesigner | null>(null);

    const toggle = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setSelectedIds((prev) => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };

    const toggleAll = () =>
        setSelectedIds((prev) =>
            prev.size === tasks.length
                ? new Set()
                : new Set(tasks.map((t) => t.id)),
        );

    if (tasks.length === 0) {
        return (
            <Box
                sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 3,
                    p: 5,
                    textAlign: "center",
                }}
            >
                <Typography fontSize={14} color="text.disabled">
                    등록된 작업이 없습니다.
                </Typography>
            </Box>
        );
    }

    return (
        <>
            <Box
                sx={{
                    border: "1px solid",
                    borderColor: "divider",
                    borderRadius: 3,
                    overflow: "auto",
                }}
            >
                {/* 헤더 행 */}
                <Box
                    sx={{
                        display: "grid",
                        gridTemplateColumns: GRID,
                        alignItems: "center",
                        px: 1.5,
                        py: 1.25,
                        minWidth: 900,
                        bgcolor: "background.default",
                        borderBottom: "1px solid",
                        borderColor: "divider",
                    }}
                >
                    {HEADERS.map((h, i) =>
                        i === 1 ? (
                            <Box
                                key="chk-all"
                                onClick={toggleAll}
                                sx={{ cursor: "pointer" }}
                            >
                                <Checkbox
                                    size="small"
                                    checked={
                                        selectedIds.size === tasks.length &&
                                        tasks.length > 0
                                    }
                                    indeterminate={
                                        selectedIds.size > 0 &&
                                        selectedIds.size < tasks.length
                                    }
                                    sx={{ p: 0 }}
                                />
                            </Box>
                        ) : (
                            <Typography
                                key={h + i}
                                sx={{
                                    fontSize: "body2",
                                    fontWeight: 400,
                                    color: "text.disabled",
                                    letterSpacing: "0.03em",
                                }}
                            >
                                {h}
                            </Typography>
                        ),
                    )}
                </Box>

                {/* 데이터 행 */}
                {tasks.map((task, idx) => {
                    const isSelected = selectedIds.has(task.id);
                    const hasAlert = !!task.special_details;
                    const fileLabel =
                        task.file_paths && task.file_paths.length > 0
                            ? `${task.file_paths.length}개`
                            : "없음";
                    const barColor = getBarColor(task);

                    return (
                        <Box
                            key={task.id}
                            onClick={() => setModalTask(task)}
                            sx={{
                                display: "grid",
                                gridTemplateColumns: GRID,
                                alignItems: "center",
                                px: 1.5,
                                minWidth: 900,
                                minHeight: 52, // 배지 유무 관계없이 행 높이 고정
                                borderBottom:
                                    idx < tasks.length - 1
                                        ? "1px solid"
                                        : "none",
                                borderColor: "divider",
                                borderLeft: "3px solid",
                                borderLeftColor: barColor,
                                bgcolor: isSelected
                                    ? "rgba(30,214,125,0.06)"
                                    : hasAlert
                                      ? "rgba(0,0,0,0.02)"
                                      : "background.paper",
                                cursor: "pointer",
                                transition: "background 0.1s",
                                "&:hover": {
                                    bgcolor: isSelected
                                        ? "rgba(30,214,125,0.09)"
                                        : "divider",
                                },
                            }}
                        >
                            {/* 번호 */}
                            <Typography
                                sx={{
                                    fontSize: "body2",
                                    color: "text.secondary",
                                    fontWeight: 500,
                                }}
                            >
                                {tasks.length - idx}
                            </Typography>

                            {/* 체크박스 */}
                            <Box onClick={(e) => toggle(task.id, e)}>
                                <Checkbox
                                    size="small"
                                    checked={isSelected}
                                    sx={{ p: 0 }}
                                />
                            </Box>

                            {/* 우선/간단 dot — is_quick 플래그 + order_method 둘 다 체크 */}
                            <Box></Box>

                            {/* 고객이름 */}
                            <Box
                                sx={{
                                    minWidth: 0,
                                    pr: "1",
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 0.75,
                                }}
                            >
                                <Typography
                                    sx={{
                                        fontSize: "body2",
                                        fontWeight: 700,
                                        color: "text.primary",
                                    }}
                                    noWrap
                                >
                                    {task.customer_name}
                                </Typography>
                                {hasAlert && (
                                    <Box
                                        sx={{
                                            display: "inline-block",
                                            fontSize: 10,
                                            fontWeight: 700,
                                            px: 0.75,
                                            borderRadius: 0.5,
                                            bgcolor: "error.light",
                                            color: "error.main",
                                        }}
                                    >
                                        특이
                                    </Box>
                                )}
                            </Box>

                            {/* 주문경로 */}
                            <Typography
                                sx={{
                                    fontSize: "body2",
                                    color: "text.secondary",
                                }}
                                noWrap
                            >
                                {task.order_source}
                            </Typography>

                            {/* 주문방법 */}
                            <Box>
                                <MethodBadge method={task.order_method} />
                            </Box>

                            {/* 인쇄항목 */}
                            <Typography
                                sx={{
                                    fontSize: "body2",
                                    color: "text.secondary",
                                }}
                                noWrap
                            >
                                {task.print_items}
                            </Typography>

                            {/* 후가공 */}
                            <Typography
                                sx={{
                                    fontSize: "body2",
                                    color:
                                        task.post_processing &&
                                        task.post_processing !== "후가공없음"
                                            ? "text.primary"
                                            : "text.hint",
                                    fontWeight:
                                        task.post_processing &&
                                        task.post_processing !== "후가공없음"
                                            ? 500
                                            : 400,
                                }}
                                noWrap
                            >
                                {task.post_processing ?? "후가공없음"}
                            </Typography>

                            {/* 파일전달 */}
                            <Typography
                                sx={{
                                    fontSize: "body2",
                                    color:
                                        task.file_paths &&
                                        task.file_paths.length > 0
                                            ? "success.main"
                                            : "text.hint",
                                    fontWeight:
                                        task.file_paths &&
                                        task.file_paths.length > 0
                                            ? 600
                                            : 400,
                                }}
                            >
                                {fileLabel}
                            </Typography>

                            {/* 상담경로 */}
                            <Typography
                                sx={{
                                    fontSize: "body2",
                                    color: "text.secondary",
                                }}
                                noWrap
                            >
                                {task.consult_path ?? "—"}
                            </Typography>

                            {/* 특이사항 */}
                            <Typography
                                sx={{
                                    fontSize: "body2",
                                    color: hasAlert
                                        ? "error.main"
                                        : "text.hint",
                                    fontWeight: hasAlert ? 700 : 400,
                                }}
                            >
                                {hasAlert ? "있음" : "없음"}
                            </Typography>

                            {/* 처리자 */}
                            <Typography
                                sx={{
                                    fontSize: "body2",
                                    color: task.designer?.[0]?.name
                                        ? "text.secondary"
                                        : "text.hint",
                                }}
                                noWrap
                            >
                                {task.designer?.[0]?.name ?? "미배정"}
                            </Typography>

                            {/* 날짜 */}
                            <Typography
                                sx={{
                                    fontSize: "body2",
                                    color: "text.disabled",
                                }}
                            >
                                {new Date(task.created_at).toLocaleDateString(
                                    "ko-KR",
                                    { month: "2-digit", day: "2-digit" },
                                )}
                            </Typography>
                        </Box>
                    );
                })}
            </Box>

            {/* 선택 액션바 */}
            {selectedIds.size > 0 && (
                <Box
                    sx={{
                        mt: 1.5,
                        px: 2,
                        py: 1.25,
                        display: "flex",
                        alignItems: "center",
                        gap: 2,
                        bgcolor: "rgba(30,214,125,0.07)",
                        border: "1px solid",
                        borderColor: "rgba(30,214,125,0.3)",
                        borderRadius: 2,
                    }}
                >
                    <Typography
                        sx={{
                            fontSize: 13,
                            fontWeight: 700,
                            color: "primary.dark",
                        }}
                    >
                        {selectedIds.size}건 선택됨
                    </Typography>
                    <Button
                        size="small"
                        variant="outlined"
                        onClick={() =>
                            onMoveSelected?.(Array.from(selectedIds))
                        }
                        sx={{
                            fontSize: 12,
                            fontWeight: 700,
                            borderRadius: 1.5,
                        }}
                    >
                        선택 이동
                    </Button>

                    <Button
                        size="small"
                        onClick={() => setSelectedIds(new Set())}
                        sx={{ fontSize: 12, color: "text.secondary" }}
                    >
                        선택 해제
                    </Button>
                </Box>
            )}

            {modalTask && (
                <TaskModal
                    task={modalTask}
                    onClose={() => setModalTask(null)}
                />
            )}
        </>
    );
}
