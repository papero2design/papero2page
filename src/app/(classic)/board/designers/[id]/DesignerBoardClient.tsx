// src/app/(classic)/board/designers/[id]/DesignerBoardClient.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TaskWithDesigner } from "@/types/database";
import BoardTable from "../../BoardTable";
import DesignerProfilePanel from "./DesignerProfilePanel";
import WriteButton from "../../WriteButton";
import PaginationClient from "../../PaginationClient";
import FilterBar from "../../FilterBar";

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, registered_by, " +
    "status, is_priority, is_quick, created_at, deleted_at, " +
    "designer:designers(id, name)";

const PAGE_SIZE = 15;

type Tab = "work" | "done";

interface DesignerData {
    id: string;
    name: string;
    status: string;
    avatar_url: string | null;
    user_id: string | null;
    music_title: string | null;
    music_link: string | null;
    banner_color: string | null;
}

interface Props {
    designerId: string;
    // BoardClient에서 이미 조회한 값을 props로 받으면 재조회 생략
    isAdmin?: boolean;
    isDesignerRole?: boolean;
    currentUserId?: string | null;
    allDesigners?: { id: string; name: string }[];
}

export default function DesignerBoardClient({
    designerId,
    isAdmin: isAdminProp,
    isDesignerRole: isDesignerRoleProp,
    currentUserId: currentUserIdProp,
    allDesigners: allDesignersProp,
}: Props) {
    const searchParams = useSearchParams();
    const [tasks, setTasks] = useState<TaskWithDesigner[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [initialLoad, setInitialLoad] = useState(true);

    // props로 받은 경우 즉시 초기화, 없으면 fetch
    const [designer, setDesigner] = useState<DesignerData | null>(null);
    const [isOwn, setIsOwn] = useState(false);
    const [isAdmin, setIsAdmin] = useState(isAdminProp ?? false);
    const [canEditDesigner, setCanEditDesigner] = useState(
        (isAdminProp ?? false) || (isDesignerRoleProp ?? false),
    );
    const [allDesigners, setAllDesigners] = useState<{ id: string; name: string }[]>(
        allDesignersProp ?? [],
    );

    // 탭 카운트
    const [tabCounts, setTabCounts] = useState({
        work: 0,
        done: 0,
    });

    // searchParams에서 값 읽기
    const tabParam = searchParams.get("tab");
    const tab: Tab = tabParam === "done" ? "done" : "work";
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const from = (page - 1) * PAGE_SIZE;
    const q = searchParams.get("q") ?? "";
    const fMethod = searchParams.get("method") ?? "";
    const fSource = searchParams.get("source") ?? "";
    const fPrint = searchParams.get("print") ?? "";
    const fPost = searchParams.get("post") ?? "";
    const fConsult = searchParams.get("consult") ?? "";
    const fDateFrom = searchParams.get("dateFrom") ?? "";
    const fDateTo = searchParams.get("dateTo") ?? "";
    const fSortBy = searchParams.get("sortBy") ?? "";
    const fSortDir = searchParams.get("sortDir") ?? "";

    // props로 받은 경우 allDesigners 동기화 (새 디자이너 추가 등 반영)
    useEffect(() => {
        if (allDesignersProp) setAllDesigners(allDesignersProp);
    }, [allDesignersProp]);

    // 디자이너 정보 재조회 (프로필 수정 후 호출)
    const reloadDesigner = useCallback(async () => {
        const supabase = createClient();
        const { data: d } = await supabase
            .from("designers")
            .select("id, name, status, avatar_url, user_id, music_title, music_link, banner_color")
            .eq("id", designerId)
            .single();
        if (d) setDesigner(d as DesignerData);
    }, [designerId]);

    // 디자이너 정보 조회 — role/allDesigners는 props로 받으므로 생략
    useEffect(() => {
        const supabase = createClient();
        const load = async () => {
            if (isAdminProp !== undefined) {
                // BoardClient에서 role을 이미 알고 있음 → designer 정보 1건만 조회
                const { data: d } = await supabase
                    .from("designers")
                    .select("id, name, status, avatar_url, user_id, music_title, music_link, banner_color")
                    .eq("id", designerId)
                    .single();
                if (d) {
                    setDesigner(d as DesignerData);
                    setIsOwn(
                        (isDesignerRoleProp ?? false) &&
                            d.user_id === (currentUserIdProp ?? null),
                    );
                }
            } else {
                // 단독 접근 시 (직접 URL 등) 모두 조회
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) return;

                const [profileRes, designerRes, designersRes] = await Promise.all([
                    supabase.from("profiles").select("role").eq("id", user.id).single(),
                    supabase
                        .from("designers")
                        .select("id, name, status, avatar_url, user_id, music_title, music_link, banner_color")
                        .eq("id", designerId)
                        .single(),
                    supabase.from("designers").select("id, name").eq("is_active", true).order("name"),
                ]);

                const role = profileRes.data?.role;
                const admin = role === "admin";
                const isDesignerRole = role === "designer";
                setIsAdmin(admin);
                setCanEditDesigner(admin || isDesignerRole);
                if (designerRes.data) {
                    const d = designerRes.data as DesignerData;
                    setDesigner(d);
                    setIsOwn(isDesignerRole && d.user_id === user.id);
                }
                setAllDesigners(designersRes.data ?? []);
            }
        };
        load();
    }, [designerId, isAdminProp, isDesignerRoleProp, currentUserIdProp]);

    // 작업 목록 + 탭 카운트 fetch
    const loadTasks = useCallback(async () => {
        setLoading(true);
        try {
            const supabase = createClient();
            const sortBy = fSortBy || "created_at";
            const sortAsc = fSortDir === "asc";

            let query = supabase
                .from("tasks")
                .select(TASK_SELECT, { count: "exact" })
                .is("deleted_at", null)
                .eq("assigned_designer_id", designerId);

            if (tab === "done") {
                query = query.eq("status", "완료");
            } else {
                query = query.neq("status", "완료");
            }

            query = query
                .order(sortBy, { ascending: sortAsc })
                .range(from, from + PAGE_SIZE - 1);

            if (q.trim()) query = query.ilike("customer_name", `%${q.trim()}%`);
            if (fMethod) query = query.eq("order_method", fMethod);
            if (fSource) query = query.eq("order_source", fSource);
            if (fPrint.trim())
                query = query.ilike("print_items", `%${fPrint.trim()}%`);
            if (fPost) query = query.ilike("post_processing", `${fPost}%`);
            if (fConsult) query = query.eq("consult_path", fConsult);
            if (fDateFrom)
                query = query.gte("created_at", `${fDateFrom}T00:00:00`);
            if (fDateTo) query = query.lte("created_at", `${fDateTo}T23:59:59`);

            // 작업 목록 + 탭 카운트 동시 조회
            const [taskResult, ...countResults] = await Promise.all([
                query,
                supabase
                    .from("tasks")
                    .select("id", { count: "exact", head: true })
                    .is("deleted_at", null)
                    .eq("assigned_designer_id", designerId)
                    .neq("status", "완료"),
                supabase
                    .from("tasks")
                    .select("id", { count: "exact", head: true })
                    .is("deleted_at", null)
                    .eq("assigned_designer_id", designerId)
                    .eq("status", "완료"),
            ]);

            setTasks((taskResult.data ?? []) as unknown as TaskWithDesigner[]);
            setTotal(taskResult.count ?? 0);
            setTabCounts({
                work: countResults[0].count ?? 0,
                done: countResults[1].count ?? 0,
            });

            window.dispatchEvent(new Event("board-refresh"));
        } catch (err) {
            console.error("[DesignerBoardClient] loadTasks failed:", err);
        } finally {
            setLoading(false);
            setInitialLoad(false);
        }
    }, [
        designerId,
        tab,
        // page,
        from,
        q,
        fMethod,
        fSource,
        fPrint,
        fPost,
        fConsult,
        fDateFrom,
        fDateTo,
        fSortBy,
        fSortDir,
    ]);

    useEffect(() => {
        loadTasks();
    }, [loadTasks]);

    const totalPages = Math.ceil(total / PAGE_SIZE);

    const stats = {
        active: 0,
        done: tabCounts.done,
        priority: 0,
        statusMap: {} as Record<string, number>,
    };

    const TABS: { key: Tab; label: string; count: number }[] = [
        { key: "work", label: "담당작업", count: tabCounts.work },
        { key: "done", label: "완료", count: tabCounts.done },
    ];

    const buildTabUrl = (t: Tab) => {
        const p = new URLSearchParams(searchParams.toString());
        p.set("tab", t);
        p.set("designer", designerId);
        p.delete("page");
        return `/board?${p.toString()}`;
    };

    // 스켈레톤 (초기 로드)
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
                    <p style={{ color: "#9ca3af", margin: 0 }}>
                        불러오는 중...
                    </p>
                </div>
                <div style={{ marginTop: 16 }}>
                    {Array.from({ length: 6 }).map((_, i) => (
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
            {/* 로딩 오버레이 */}
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

            {/* 프로필 패널 */}
            {designer && (
                <DesignerProfilePanel
                    designer={designer}
                    stats={stats}
                    isOwn={isOwn}
                    onRefresh={reloadDesigner}
                />
            )}

            {/* 탭 버튼 */}
            <div
                style={{
                    display: "flex",
                    gap: 8,
                    marginBottom: 16,
                    borderBottom: "2px solid #e5e7eb",
                    paddingBottom: 0,
                }}
            >
                {TABS.map(({ key, label, count }) => {
                    const isActive = tab === key;
                    const color =
                        key === "done" ? "#15803d" : "#111827";
                    return (
                        <Link
                            key={key}
                            href={buildTabUrl(key)}
                            style={{
                                display: "inline-flex",
                                gap: 6,
                                padding: "8px 16px",
                                fontWeight: 700,
                                color: isActive ? color : "#9ca3af",
                                borderBottom: isActive
                                    ? `2px solid ${color}`
                                    : "2px solid transparent",
                                marginBottom: -2,
                                textDecoration: "none",
                                transition: "color 0.1s",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {label}
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    minWidth: 20,
                                    height: 20,
                                    padding: "0 6px",
                                    borderRadius: 99,
                                    background: isActive ? color : "#e5e7eb",
                                    color: isActive ? "#fff" : "#6b7280",
                                    fontSize: 11,
                                    fontWeight: 800,
                                }}
                            >
                                {count > 99 ? "99+" : count}
                            </span>
                        </Link>
                    );
                })}

                <div style={{ flex: 1 }} />

                {isAdmin && (
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            paddingBottom: 4,
                        }}
                    >
                        <WriteButton onRefresh={loadTasks} />
                    </div>
                )}
            </div>

            {/* 총 건수 */}
            <div style={{ paddingTop: 4, marginBottom: 4 }}>
                <p style={{ color: "#9ca3af", margin: 0 }}>
                    총 <strong style={{ color: "#111827" }}>{total}</strong>건
                    {q && (
                        <span style={{ marginLeft: 8, color: "#6b7280" }}>
                            &quot;{q}&quot; 검색결과
                        </span>
                    )}
                </p>
            </div>

            <FilterBar
                currentStatus=""
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
                designers={allDesigners}
                canEditDesigner={canEditDesigner}
                writeButton={undefined}
                onMutate={loadTasks}
                highlightPriorityRows={tab === "work"}
            />

            <PaginationClient page={page} totalPages={totalPages} />
        </div>
    );
}
