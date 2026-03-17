import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import StatsClient from "./StatsClient";
import {
    BarChart3,
    CheckCircle2,
    Clock,
    Trash2,
    AlertCircle,
} from "lucide-react";
import Link from "next/link";

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
        { count: totalQuick },
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
        supabase
            .from("tasks")
            .select("id", { count: "exact", head: true })
            .is("deleted_at", null)
            .neq("status", "완료")
            .eq("is_quick", true),
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
        <div className="max-w-6xl mx-auto px-4 py-8 pb-20">
            {/* 헤더 */}
            <div className="mb-8 border-b border-gray-200 pb-6">
                <h2 className="text-2xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
                    <BarChart3 className="w-6 h-6 text-gray-700" />
                    작업 통계 대시보드
                </h2>
                <p className="mt-1 text-sm text-gray-500">
                    {fmtDate(new Date())} 기준 전체 작업 현황
                </p>
            </div>

            {/* 전체 현황 카드 */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                {[
                    {
                        label: "우선작업",
                        value: totalPriority ?? 0,
                        icon: AlertCircle,
                        href: "/board/quick",
                    },
                    {
                        label: "간단작업",
                        value: totalQuick ?? 0,
                        icon: AlertCircle,
                        href: "/board/simple",
                    },

                    {
                        label: "등록작업",
                        value: totalActive ?? 0,
                        icon: Clock,
                        href: "/board",
                    },
                    {
                        label: "완료작업",
                        value: totalDone ?? 0,
                        icon: CheckCircle2,
                        href: "/board/done",
                    },

                    {
                        label: "휴지통",
                        value: totalTrash ?? 0,
                        icon: Trash2,
                        href: "/board/trash",
                    },
                ].map(({ label, value, icon: Icon, href }) => (
                    <Link
                        key={label}
                        href={href}
                        className="p-5 rounded-xl border border-gray-200 bg-white flex flex-col justify-between hover:shadow-md hover:border-gray-300 transition-all cursor-pointer"
                    >
                        <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-medium text-gray-500">
                                {label}
                            </span>
                            <Icon className="w-4 h-4 text-gray-400" />
                        </div>
                        <div className="text-3xl font-bold text-gray-900 tracking-tight">
                            {value}
                        </div>
                    </Link>
                ))}
            </div>

            {/* 상태별 현황 */}
            <div className="flex flex-col md:flex-row gap-4 mb-10">
                {[
                    { label: "대기중", query: "대기중" },
                    { label: "진행중", query: "진행중" },
                    { label: "검수대기", query: "검수대기" },
                ].map(({ label, query }) => (
                    <Link
                        key={label}
                        href={`/board?status=${query}`}
                        className="flex-1 py-4 px-6 rounded-xl border border-gray-200 bg-gray-50 flex items-center justify-between hover:bg-white hover:shadow-sm hover:border-gray-300 transition-all cursor-pointer"
                    >
                        <span className="text-sm font-medium text-gray-600">
                            {label}
                        </span>
                        <span className="text-2xl font-bold text-gray-900">
                            {statusMap[query]}
                        </span>
                    </Link>
                ))}
            </div>

            {/* 동적 통계 */}
            <StatsClient designers={designers ?? []} />
        </div>
    );
}
