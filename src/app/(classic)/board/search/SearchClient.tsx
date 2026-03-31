// src/app/(classic)/board/search/SearchClient.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useSearchParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { TaskWithDesigner } from "@/types/database";
import BoardTable from "../BoardTable";
import PaginationClient from "../PaginationClient";
import WriteButton from "../WriteButton";

const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, registered_by, " +
    "status, is_priority, is_quick, created_at, deleted_at, " +
    "designer:designers(id, name)";

const PAGE_SIZE = 25;

export default function SearchPage() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [tasks, setTasks] = useState<TaskWithDesigner[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [initialLoad, setInitialLoad] = useState(true);

    const [isAdmin, setIsAdmin] = useState(false);
    const [isDesigner, setIsDesigner] = useState(false);
    const [designers, setDesigners] = useState<{ id: string; name: string }[]>(
        [],
    );

    const term = (searchParams.get("q") ?? "").trim();
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const from = (page - 1) * PAGE_SIZE;

    // 검색어 없으면 /board로
    useEffect(() => {
        if (!term) router.replace("/board");
    }, [term, router]);

    // 초기 role + designers 조회
    useEffect(() => {
        const supabase = createClient();
        const load = async () => {
            const {
                data: { user },
            } = await supabase.auth.getUser();
            if (!user) return;

            const [profileRes, designersRes] = await Promise.all([
                supabase
                    .from("profiles")
                    .select("role")
                    .eq("id", user.id)
                    .single(),
                supabase
                    .from("designers")
                    .select("id, name")
                    .eq("is_active", true)
                    .order("name"),
            ]);

            const role = profileRes.data?.role;
            setIsAdmin(role === "admin");
            setIsDesigner(role === "designer");
            setDesigners(designersRes.data ?? []);
        };
        load();
    }, []);

    const loadResults = useCallback(async () => {
        if (!term) return;
        setLoading(true);
        try {
            const supabase = createClient();

            const orParts = [
                `customer_name.ilike.%${term}%`,
                `print_items.ilike.%${term}%`,
                `special_details.ilike.%${term}%`,
            ];
            const numTerm = Number(term);
            if (!isNaN(numTerm) && term !== "") {
                orParts.push(`task_number.eq.${numTerm}`);
            }

            const { data, count } = await supabase
                .from("tasks")
                .select(TASK_SELECT, { count: "exact" })
                .is("deleted_at", null)
                .or(orParts.join(","))
                .order("created_at", { ascending: false })
                .range(from, from + PAGE_SIZE - 1);

            setTasks((data ?? []) as unknown as TaskWithDesigner[]);
            setTotal(count ?? 0);
        } catch (err) {
            console.error("[SearchPage] loadResults failed:", err);
        } finally {
            setLoading(false);
            setInitialLoad(false);
        }
    }, [term, page, from]);

    useEffect(() => {
        loadResults();
    }, [loadResults]);

    const totalPages = Math.ceil(total / PAGE_SIZE);

    if (!term) return null;

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
                    <p style={{ color: "#9ca3af", margin: 0 }}>검색 중...</p>
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
                <div className="w-full h-auto flex content-center flex-wrap ">
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
                    <p
                        style={{ color: "#9ca3af", fontSize: 14 }}
                        className="flex ml-2 gap-2 content-center self-center"
                    >
                        <strong style={{ color: "#111827" }}>
                            &quot;{term}&quot;
                        </strong>{" "}
                        검색결과{" "}
                        <strong style={{ color: "#111827" }}>{total}</strong>건
                        <span
                            style={{
                                color: "#d1d5db",
                                marginLeft: 6,
                                fontSize: 12,
                            }}
                        >
                            고객이름 · 인쇄항목 · 특이사항
                        </span>
                    </p>
                </div>
                <div className="w-max">
                    <WriteButton />
                </div>
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

            {/* 결과 테이블 */}
            {tasks.length > 0 && (
                <BoardTable
                    tasks={tasks}
                    total={total}
                    from={from}
                    designers={designers}
                    canEditDesigner={isAdmin || isDesigner}
                    onMutate={loadResults}
                />
            )}

            <PaginationClient page={page} totalPages={totalPages} />
        </div>
    );
}
