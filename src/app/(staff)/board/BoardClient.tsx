// src/app/(classic)/board/BoardClient.tsx
"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { TaskWithDesigner } from "@/types/database";
import { TASK_SELECT } from "@/types/database";
import BoardTable from "./BoardTable";
import WriteButton from "./WriteButton";
import FilterBar from "./FilterBar";
import PaginationClient from "./PaginationClient";
import DesignerBoardClient from "./designers/[id]/DesignerBoardClient";
import { TableRowsSkeleton } from "@/lib/ui/Skeleton";


const PAGE_SIZE = 15;

export default function BoardClient() {
    const searchParams = useSearchParams();
    const designerId = searchParams.get("designer");

    const router = useRouter();
    const pathname = usePathname();

    const [tasks, setTasks] = useState<TaskWithDesigner[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [initialLoad, setInitialLoad] = useState(true);
    const [doneShowAll, setDoneShowAll] = useState(false);

    // 클라이언트에서 직접 조회하는 role/designers
    const [isAdmin, setIsAdmin] = useState(false);
    const [isDesigner, setIsDesigner] = useState(false);
    const [isCs, setIsCs] = useState(false);
    const [currentRole, setCurrentRole] = useState<string | null>(null);
    const [userId, setUserId] = useState<string | null>(null);
    const [designers, setDesigners] = useState<{ id: string; name: string }[]>([]);

    // 초기 마운트 시 role + designers 조회 (1회)
    useEffect(() => {
        const supabase = createClient();
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            const [profileRes, designersRes] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("role")
                    .eq("id", user.id)
                    .single(),
                supabase
                    .from("designers")
                    .select("id, name, member_type")
                    .eq("is_active", true)
                    .order("name"),
            ]);

            const role = profileRes.data?.role;
            setUserId(user.id);
            setIsAdmin(role === "admin");
            setIsDesigner(role === "designer");
            setIsCs(role === "cs");
            setCurrentRole(role ?? null);
            setDesigners(designersRes.data ?? []);
        };
        load();
    }, []);

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
    const rawDateFrom = searchParams.get("dateFrom");
    const rawDateTo = searchParams.get("dateTo");
    const fDateFrom = rawDateFrom ?? "";
    const fDateTo = rawDateTo ?? "";
    const fSortBy = searchParams.get("sortBy") ?? "";
    const fSortDir = searchParams.get("sortDir") ?? "";

    const todayDefault = new Date().toISOString().split("T")[0];
    const doneDateFrom = rawDateFrom ?? todayDefault;
    const doneDateTo = rawDateTo ?? todayDefault;

    const prevTab = useRef(tab);
    useEffect(() => {
        if (tab !== prevTab.current) {
            setDoneShowAll(false);
            prevTab.current = tab;
        }
    }, [tab]);

    const prevRawDate = useRef({ rawDateFrom, rawDateTo });
    useEffect(() => {
        if (
            (rawDateFrom || rawDateTo) &&
            (rawDateFrom !== prevRawDate.current.rawDateFrom ||
                rawDateTo !== prevRawDate.current.rawDateTo)
        ) {
            setDoneShowAll(false);
        }
        prevRawDate.current = { rawDateFrom, rawDateTo };
    }, [rawDateFrom, rawDateTo]);

    const handleDoneShowAll = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.delete("dateFrom");
        params.delete("dateTo");
        params.delete("page");
        router.push(`${pathname}?${params.toString()}`);
        setDoneShowAll(true);
    };
    const handleDoneShowToday = () => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("dateFrom", todayDefault);
        params.set("dateTo", todayDefault);
        params.delete("page");
        router.push(`${pathname}?${params.toString()}`);
        setDoneShowAll(false);
    };

    const loadTasks = useCallback(async () => {
        setLoading(true);
        try {
            const supabase = createClient();

            const defaultSortBy = "created_at";
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
            if (tab === "done") {
                if (!doneShowAll) {
                    query = query.gte("completed_at", `${doneDateFrom}T00:00:00`);
                    query = query.lte("completed_at", `${doneDateTo}T23:59:59`);
                }
            } else {
                if (fDateFrom)
                    query = query.gte("created_at", `${fDateFrom}T00:00:00`);
                if (fDateTo)
                    query = query.lte("created_at", `${fDateTo}T23:59:59`);
            }

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
        fPost, fConsult, rawDateFrom, rawDateTo, fSortBy, fSortDir,
        doneShowAll, doneDateFrom, doneDateTo,
    ]);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    const totalPages = Math.ceil(total / PAGE_SIZE);

    // 디자이너 탭 — searchParams 변경만으로 전환 (라우트 변경 없음)
    if (designerId) {
        return (
            <DesignerBoardClient
                designerId={designerId}
                isAdmin={isAdmin}
                isDesignerRole={isDesigner}
                isCsRole={isCs}
                currentRole={currentRole}
                currentUserId={userId}
                allDesigners={designers}
            />
        );
    }

    // 스켈레톤 (초기 로드용) — lib/ui/Skeleton
    if (initialLoad) {
        return <TableRowsSkeleton rows={8} />;
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

            {tab === "done" && (
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingBottom: 8, paddingTop: 4 }}>
                    <button
                        onClick={handleDoneShowToday}
                        style={{
                            padding: "3px 12px",
                            borderRadius: 99,
                            border: `1px solid ${!doneShowAll ? "#15803d" : "#e5e7eb"}`,
                            background: !doneShowAll ? "#f0fdf4" : "#fff",
                            color: !doneShowAll ? "#15803d" : "#6b7280",
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        오늘
                    </button>
                    <button
                        onClick={handleDoneShowAll}
                        style={{
                            padding: "3px 12px",
                            borderRadius: 99,
                            border: `1px solid ${doneShowAll ? "#6b7280" : "#e5e7eb"}`,
                            background: doneShowAll ? "#f9fafb" : "#fff",
                            color: doneShowAll ? "#374151" : "#9ca3af",
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        전체
                    </button>
                    {!doneShowAll && (
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>
                            {doneDateFrom === doneDateTo
                                ? doneDateFrom
                                : `${doneDateFrom} ~ ${doneDateTo}`}
                        </span>
                    )}
                </div>
            )}

            <FilterBar
                currentStatus={tab === "done" ? "" : fStatus}
                currentMethod={fMethod}
                currentSource={fSource}
                currentPrint={fPrint}
                currentPost={fPost}
                currentConsult={fConsult}
                currentDateFrom={tab === "done" && !doneShowAll ? doneDateFrom : fDateFrom}
                currentDateTo={tab === "done" && !doneShowAll ? doneDateTo : fDateTo}
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
                        <WriteButton onRefresh={loadTasks} defaultPriority={tab === "priority"} />
                    ) : undefined
                }
                onMutate={loadTasks}
            />

            <PaginationClient page={page} totalPages={totalPages} />
        </div>
    );
}
