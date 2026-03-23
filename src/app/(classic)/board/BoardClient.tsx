// src/app/(classic)/board/BoardClient.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TaskWithDesigner } from "@/types/database";
import BoardTable from "./BoardTable";
import WriteButton from "./WriteButton";
import FilterBar from "./FilterBar";
import PaginationClient from "./PaginationClient";

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, registered_by, " +
    "status, is_priority, is_quick, created_at, deleted_at, " +
    "designer:designers(id, name)";

const PAGE_SIZE = 15;

interface Props {
    isAdmin: boolean;
    isDesigner: boolean;
    designers: { id: string; name: string }[];
}

export default function BoardClient({ isAdmin, isDesigner, designers }: Props) {
    const searchParams = useSearchParams();
    const [tasks, setTasks] = useState<TaskWithDesigner[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [initialLoad, setInitialLoad] = useState(true);

    // searchParams에서 값 읽기
    const tab = searchParams.get("tab") ?? "active";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const from = (page - 1) * PAGE_SIZE;
    const q = searchParams.get("q") ?? "";
    const fStatus = searchParams.get("status") ?? "";
    const fMethod = searchParams.get("method") ?? "";
    const fSource = searchParams.get("source") ?? "";
    const fPrint = searchParams.get("print") ?? "";
    const fPost = searchParams.get("post") ?? "";
    const fConsult = searchParams.get("consult") ?? "";
    const fDateFrom = searchParams.get("dateFrom") ?? "";
    const fDateTo = searchParams.get("dateTo") ?? "";
    const fSortBy = searchParams.get("sortBy") ?? "";
    const fSortDir = searchParams.get("sortDir") ?? "";

    const loadTasks = useCallback(async () => {
        setLoading(true);
        try {
            const supabase = createClient();

            const defaultSortBy = tab === "done" ? "completed_at" : "created_at";
            const sortBy = fSortBy || defaultSortBy;
            const sortAsc = fSortDir === "asc";

            let query = supabase
                .from("tasks")
                .select(TASK_SELECT, { count: "exact" })
                .is("deleted_at", null);

            // 탭별 조건 분기
            if (tab === "done") {
                query = query.eq("status", "완료");
            } else if (tab === "priority") {
                query = query
                    .neq("status", "완료")
                    .eq("is_priority", true)
                    .is("assigned_designer_id", null);
            } else {
                query = query
                    .neq("status", "완료")
                    .eq("is_priority", false)
                    .is("assigned_designer_id", null);
            }

            query = query
                .order(sortBy, { ascending: sortAsc })
                .range(from, from + PAGE_SIZE - 1);

            // 필터 적용
            if (q.trim()) query = query.ilike("customer_name", `%${q.trim()}%`);
            if (fStatus) query = query.eq("status", fStatus);
            if (fMethod) query = query.eq("order_method", fMethod);
            if (fSource) query = query.eq("order_source", fSource);
            if (fPrint.trim())
                query = query.ilike("print_items", `%${fPrint.trim()}%`);
            if (fPost) query = query.ilike("post_processing", `${fPost}%`);
            if (fConsult) query = query.eq("consult_path", fConsult);
            if (fDateFrom)
                query = query.gte("created_at", `${fDateFrom}T00:00:00`);
            if (fDateTo)
                query = query.lte("created_at", `${fDateTo}T23:59:59`);

            const { data, count } = await query;
            setTasks((data ?? []) as unknown as TaskWithDesigner[]);
            setTotal(count ?? 0);
            // BoardNav count 갱신
            window.dispatchEvent(new Event("board-refresh"));
        } catch (err) {
            console.error("[BoardClient] loadTasks failed:", err);
        } finally {
            setLoading(false);
            setInitialLoad(false);
        }
    }, [
        tab, page, from, q, fStatus, fMethod, fSource, fPrint,
        fPost, fConsult, fDateFrom, fDateTo, fSortBy, fSortDir,
    ]);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    const totalPages = Math.ceil(total / PAGE_SIZE);

    // 스켈레톤 (초기 로드용)
    if (initialLoad) {
        return (
            <div
                style={{
                    width: "100%",
                    maxWidth: 1260,
                    margin: "0 auto",
                    padding: "0 16px 40px",
                }}
            >
                <div style={{ paddingTop: 16, marginBottom: 4 }}>
                    <p style={{ color: "#9ca3af", margin: 0 }}>불러오는 중...</p>
                </div>
                <div style={{ marginTop: 16 }}>
                    {Array.from({ length: 8 }).map((_, i) => (
                        <div
                            key={i}
                            style={{
                                height: 48,
                                background: "#f3f4f6",
                                borderRadius: 6,
                                marginBottom: 4,
                                animation: "pulse 1.5s ease-in-out infinite",
                            }}
                        />
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div
            style={{
                width: "100%",
                maxWidth: 1260,
                margin: "0 auto",
                padding: "0 16px 40px",
                position: "relative",
            }}
        >
            {/* 탭/필터 변경 시 로딩 오버레이 */}
            {loading && (
                <div
                    style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(255,255,255,0.5)",
                        zIndex: 10,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                    }}
                >
                    <div
                        style={{
                            width: 32,
                            height: 32,
                            border: "3px solid #e5e7eb",
                            borderTopColor: "#6b7280",
                            borderRadius: "50%",
                            animation: "spin 0.6s linear infinite",
                        }}
                    />
                </div>
            )}

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
                    총 <strong style={{ color: "#111827" }}>{total}</strong>건
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
                currentStatus={tab === "done" ? "" : fStatus}
                currentMethod={fMethod}
                currentSource={fSource}
                currentPrint={fPrint}
                currentPost={fPost}
                currentConsult={fConsult}
                currentDateFrom={fDateFrom}
                currentDateTo={fDateTo}
                currentSortBy={fSortBy}
                currentSortDir={fSortDir || "desc"}
            />

            <BoardTable
                tasks={tasks}
                total={total}
                from={from}
                designers={designers}
                canEditDesigner={isAdmin || isDesigner}
                writeButton={
                    tab !== "done" ? (
                        <WriteButton onRefresh={loadTasks} />
                    ) : undefined
                }
                onMutate={loadTasks}
            />

            <PaginationClient page={page} totalPages={totalPages} />
        </div>
    );
}
