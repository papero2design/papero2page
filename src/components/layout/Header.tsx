"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import {
    AppBar,
    Toolbar,
    Box,
    InputBase,
    IconButton,
    Avatar,
    Button,
    Paper,
    Typography,
    Divider,
    Badge,
    Tooltip,
} from "@mui/material";
import SearchIcon from "@mui/icons-material/Search";
import PriorityHighIcon from "@mui/icons-material/PriorityHigh";
import { useRouter, usePathname } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import { Task } from "@/types/database";
import Image from "next/image";

const NAV_ITEMS = [
    { label: "작업", href: "/tasks" },
    { label: "통계", href: "/statistics", adminOnly: true },
    { label: "디자이너", href: "/designers", adminOnly: true },
];

interface HeaderProps {
    isAdmin: boolean;
    priorityCount?: number;
}

export default function Header({ isAdmin, priorityCount = 0 }: HeaderProps) {
    const router = useRouter();
    const pathname = usePathname();

    const supabase = useMemo(
        () =>
            createBrowserClient(
                process.env.NEXT_PUBLIC_SUPABASE_URL!,
                process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            ),
        [],
    );

    const [search, setSearch] = useState("");
    const [results, setResults] = useState<
        Pick<
            Task,
            "id" | "customer_name" | "order_source" | "status" | "print_items"
        >[]
    >([]);
    const [open, setOpen] = useState(false);
    const searchRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = setTimeout(async () => {
            if (search.trim().length < 1) {
                setResults([]);
                return;
            }
            const { data } = await supabase
                .from("tasks")
                .select("id, customer_name, order_source, status, print_items")
                .or(
                    `customer_name.ilike.%${search}%,order_source.ilike.%${search}%`,
                )
                .is("deleted_at", null)
                .limit(6);
            setResults(data ?? []);
        }, 250);
        return () => clearTimeout(timer);
    }, [search, supabase]);

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (
                searchRef.current &&
                !searchRef.current.contains(e.target as Node)
            ) {
                setOpen(false);
            }
        };
        document.addEventListener("mousedown", handler);
        return () => document.removeEventListener("mousedown", handler);
    }, []);

    const handleLogout = async () => {
        await fetch("/api/logout", { method: "POST" });
        window.location.href = "/login";
    };

    const visibleNav = NAV_ITEMS.filter((item) => !item.adminOnly || isAdmin);

    return (
        <AppBar
            position="sticky"
            elevation={0}
            sx={{
                bgcolor: "background.paper",
                borderBottom: "1px solid",
                borderColor: "divider",
                boxShadow: "0 1px 12px rgba(0,0,0,0.05)",
            }}
        >
            <Toolbar
                sx={{
                    maxWidth: 1200,
                    width: "100%",
                    mx: "auto",
                    px: { xs: 2, md: 4 },
                    minHeight: "150px !important",
                    height: "150px",
                    display: "flex",
                    flexWrap: "wrap",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: 0,
                }}
            >
                {/* 로고 — 왼쪽 고정 */}
                <Box
                    onClick={() => router.push("/tasks")}
                    sx={{
                        cursor: "pointer",
                        flexShrink: 0,
                        display: "flex",
                        alignItems: "center",
                        mr: 4,
                    }}
                >
                    <Image
                        src="/logo.png"
                        alt="O2Design"
                        width={0}
                        height={80}
                        sizes="100vw"
                        style={{
                            width: "auto",
                            height: "80px",
                            objectFit: "contain",
                        }}
                    />
                </Box>

                {/* 검색 — 중앙 flex */}
                <Box
                    ref={searchRef}
                    sx={{ flex: 1, maxWidth: 480, position: "relative" }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            border: "1.5px solid",
                            borderColor: open ? "primary.main" : "divider",
                            borderRadius: 3,
                            px: 2,
                            height: 48,
                            bgcolor: "background.default",
                            transition: "border-color 0.15s",
                        }}
                    >
                        <SearchIcon
                            sx={{
                                color: "text.disabled",
                                fontSize: 20,
                                mr: 1.25,
                                flexShrink: 0,
                            }}
                        />
                        <InputBase
                            value={search}
                            onChange={(e) => {
                                setSearch(e.target.value);
                                setOpen(true);
                            }}
                            onFocus={() => setOpen(true)}
                            placeholder="고객사 또는 작업명 검색..."
                            sx={{ flex: 1, fontSize: 15 }}
                        />
                    </Box>

                    {open && results.length > 0 && (
                        <Paper
                            elevation={8}
                            sx={{
                                position: "absolute",
                                top: "calc(100% + 6px)",
                                left: 0,
                                right: 0,
                                borderRadius: 2.5,
                                overflow: "hidden",
                                zIndex: 1400,
                                border: "1px solid",
                                borderColor: "divider",
                            }}
                        >
                            {results.map((task, i) => (
                                <Box key={task.id}>
                                    <Box
                                        onClick={() => {
                                            router.push(`/tasks/${task.id}`);
                                            setOpen(false);
                                            setSearch("");
                                        }}
                                        sx={{
                                            px: 2.5,
                                            py: 1.75,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 1.5,
                                            "&:hover": {
                                                bgcolor: "background.default",
                                            },
                                        }}
                                    >
                                        <Box sx={{ flex: 1, minWidth: 0 }}>
                                            <Typography
                                                fontSize={14}
                                                fontWeight={600}
                                                color="text.primary"
                                                noWrap
                                            >
                                                {task.customer_name}
                                            </Typography>
                                            <Typography
                                                fontSize={12}
                                                color="text.secondary"
                                                noWrap
                                            >
                                                {task.order_source} ·{" "}
                                                {task.print_items}
                                            </Typography>
                                        </Box>
                                        <StatusBadge status={task.status} />
                                    </Box>
                                    {i < results.length - 1 && <Divider />}
                                </Box>
                            ))}
                        </Paper>
                    )}
                </Box>

                {/* 네비게이션 — 검색창과 간격 두고 오른쪽 */}
                <Box sx={{ display: "flex", gap: 0.75, ml: 4, flexShrink: 0 }}>
                    {visibleNav.map((item) => {
                        const active = pathname.startsWith(item.href);
                        return (
                            <Button
                                key={item.href}
                                onClick={() => router.push(item.href)}
                                sx={{
                                    fontSize: 15,
                                    fontWeight: 600,
                                    px: 2.25,
                                    py: 1,
                                    borderRadius: 2.5,
                                    color: active
                                        ? "primary.dark"
                                        : "text.secondary",
                                    bgcolor: active
                                        ? "primary.main" + "1A"
                                        : "transparent",
                                    "&:hover": {
                                        bgcolor: active
                                            ? "primary.main" + "28"
                                            : "action.hover",
                                    },
                                }}
                            >
                                {item.label}
                            </Button>
                        );
                    })}
                </Box>

                {/* 우선작업 알림 뱃지 */}
                {priorityCount > 0 && (
                    <Tooltip
                        title={`우선작업 ${priorityCount}건 대기 중`}
                        arrow
                    >
                        <IconButton
                            onClick={() =>
                                router.push("/tasks?filter=priority")
                            }
                            sx={{
                                color: "error.main",
                                width: 44,
                                height: 44,
                                ml: 1,
                            }}
                        >
                            <Badge
                                badgeContent={priorityCount}
                                color="error"
                                max={9}
                            >
                                <PriorityHighIcon sx={{ fontSize: 22 }} />
                            </Badge>
                        </IconButton>
                    </Tooltip>
                )}

                {/* 아바타 / 로그아웃 */}
                <Tooltip
                    title={`${isAdmin ? "관리자" : "디자이너"} · 로그아웃`}
                    arrow
                >
                    <IconButton onClick={handleLogout} sx={{ p: 0, ml: 1 }}>
                        <Avatar
                            sx={{
                                width: 44,
                                height: 44,
                                bgcolor: isAdmin
                                    ? "secondary.main"
                                    : "primary.dark",
                                fontSize: 14,
                                fontWeight: 700,
                            }}
                        >
                            {isAdmin ? "관" : "D"}
                        </Avatar>
                    </IconButton>
                </Tooltip>
            </Toolbar>
        </AppBar>
    );
}

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
                fontSize: 12,
                fontWeight: 700,
                px: 1.25,
                py: 0.4,
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
