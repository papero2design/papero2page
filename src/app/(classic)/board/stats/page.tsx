// src/app/(classic)/board/stats/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StatsClient from "./StatsClient";

export default async function StatsPage() {
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
    if (profile?.role !== "admin") redirect("/board");

    // 전체 현황 (서버에서 초기값)
    const [
        { count: totalActive },
        { count: totalDone },
        { count: totalPriority },
        { count: totalTrash },
    ] = await Promise.all([
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .neq("status", "완료"),
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .eq("status", "완료"),
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .neq("status", "완료")
            .eq("is_priority", true),
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .not("deleted_at", "is", null),
    ]);

    // 상태별 현황
    const { data: statusRows } = await supabase
        .from("tasks")
        .select("status")
        .is("deleted_at", null)
        .neq("status", "완료");

    const statusMap: Record<string, number> = {
        대기중: 0,
        진행중: 0,
        검수대기: 0,
    };
    (statusRows ?? []).forEach((r) => {
        if (r.status in statusMap) statusMap[r.status]++;
    });

    // 디자이너 목록
    const { data: designers } = await supabase
        .from("designers")
        .select("id, name, avatar_url")
        .eq("is_active", true)
        .order("name");

    function fmtDate(d: Date) {
        return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
    }

    return (
        <div
            style={{ maxWidth: 1100, margin: "0 auto", padding: "8px 0 40px" }}
        >
            {/* 헤더 */}
            <div style={{ marginBottom: 20 }}>
                <h2 style={{ margin: 0, fontWeight: 800, color: "#111827" }}>
                    작업 통계
                </h2>
                <p style={{ margin: "4px 0 0", color: "#9ca3af" }}>
                    {fmtDate(new Date())} 기준
                </p>
            </div>

            {/* 전체 현황 카드 (정적) */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns:
                        "repeat(auto-fill, minmax(150px, 1fr))",
                    gap: 10,
                    marginBottom: 20,
                }}
            >
                {[
                    {
                        label: "진행 중",
                        value: totalActive ?? 0,
                        color: "#111827",
                        bg: "#f9fafb",
                    },
                    {
                        label: "전체 완료",
                        value: totalDone ?? 0,
                        color: "#15803d",
                        bg: "#f0fdf4",
                    },
                    {
                        label: "우선작업",
                        value: totalPriority ?? 0,
                        color: "#dc2626",
                        bg: "#fef2f2",
                    },
                    {
                        label: "휴지통",
                        value: totalTrash ?? 0,
                        color: "#9ca3af",
                        bg: "#f9fafb",
                    },
                ].map(({ label, value, color, bg }) => (
                    <div
                        key={label}
                        style={{
                            padding: "14px 16px",
                            background: bg,
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                        }}
                    >
                        <div style={{ fontWeight: 800, fontSize: 26, color }}>
                            {value}
                        </div>
                        <div style={{ color: "#6b7280", marginTop: 2 }}>
                            {label}
                        </div>
                    </div>
                ))}
            </div>

            {/* 상태별 현황 (정적) */}
            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                {[
                    {
                        label: "대기중",
                        bg: "#f4f4f5",
                        color: "#71717a",
                        border: "#e4e4e7",
                    },
                    {
                        label: "진행중",
                        bg: "#fffbeb",
                        color: "#b45309",
                        border: "#fde68a",
                    },
                    {
                        label: "검수대기",
                        bg: "#eff6ff",
                        color: "#1d4ed8",
                        border: "#bfdbfe",
                    },
                ].map(({ label, bg, color, border }) => (
                    <div
                        key={label}
                        style={{
                            flex: 1,
                            padding: "12px 14px",
                            background: bg,
                            border: `1px solid ${border}`,
                            borderRadius: 8,
                            textAlign: "center",
                        }}
                    >
                        <div style={{ fontWeight: 800, fontSize: 22, color }}>
                            {statusMap[label]}
                        </div>
                        <div style={{ color, fontWeight: 600, marginTop: 2 }}>
                            {label}
                        </div>
                    </div>
                ))}
            </div>

            {/* 구분선 */}
            <div style={{ borderTop: "1px solid #e5e7eb", marginBottom: 20 }} />

            {/* 동적 통계 — 기간 선택 + 바차트 + 캘린더 */}
            <StatsClient designers={designers ?? []} />
        </div>
    );
}
