"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { Download, CalendarDays, BarChart2, Users } from "lucide-react";
import * as XLSX from "xlsx-js-style"; // 엑셀 파일용 라이브러리

type Designer = { id: string; name: string; avatar_url: string | null };
type DayData = {
    date: string;
    count: number;
    priority: number;
    normal: number;
};
type DesignerStat = {
    id: string;
    name: string;
    avatar_url: string | null;
    total: number;
    priority: number;
    normal: number;
};

const PRESETS = [
    { label: "오늘", days: 0 },
    { label: "이번 주", days: 6 },
    { label: "이번 달", days: 29 },
    { label: "3개월", days: 89 },
] as const;

function toYMD(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function addDays(d: Date, n: number) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
}

export default function StatsClient({ designers }: { designers: Designer[] }) {
    const today = toYMD(new Date());

    const [dateFrom, setDateFrom] = useState(toYMD(addDays(new Date(), -29)));
    const [dateTo, setDateTo] = useState(today);
    const [calMonth, setCalMonth] = useState(() => new Date());

    const [dayData, setDayData] = useState<DayData[]>([]);
    const [designerStats, setDesignerStats] = useState<DesignerStat[]>([]);
    const [totalDone, setTotalDone] = useState(0);
    const [loading, setLoading] = useState(false);

    const supabase = createClient();

    const load = async (from: string, to: string) => {
        setLoading(true);
        try {
            const { data } = await supabase
                .from("tasks")
                .select(
                    "id, completed_at, assigned_designer_id, is_priority",
                )
                .eq("status", "완료")
                .is("deleted_at", null)
                .gte("completed_at", `${from}T00:00:00`)
                .lte("completed_at", `${to}T23:59:59`)
                .limit(10000);

            const rows = data ?? [];
            setTotalDone(rows.length);

            // 1. 날짜별 집계
            const dayMap: Record<string, Omit<DayData, "date">> = {};
            rows.forEach((r) => {
                if (!r.completed_at) return;
                const d = r.completed_at.split("T")[0];
                if (!dayMap[d])
                    dayMap[d] = { count: 0, priority: 0, normal: 0 };

                dayMap[d].count++;
                if (r.is_priority) {
                    dayMap[d].priority++;
                } else {
                    dayMap[d].normal++;
                }
            });

            const days: DayData[] = [];
            const cur = new Date(from);
            const end = new Date(to);
            while (cur <= end) {
                const d = toYMD(cur);
                const stat = dayMap[d];
                days.push({
                    date: d,
                    count: stat?.count ?? 0,
                    priority: stat?.priority ?? 0,
                    normal: stat?.normal ?? 0,
                });
                cur.setDate(cur.getDate() + 1);
            }
            setDayData(days);

            // 2. 디자이너별 세부 집계
            const dMap: Record<string, DesignerStat> = {};
            designers.forEach((d) => {
                dMap[d.id] = {
                    ...d,
                    total: 0,
                    priority: 0,
                    normal: 0,
                };
            });

            rows.forEach((r) => {
                if (!r.assigned_designer_id) return;
                const stat = dMap[r.assigned_designer_id];
                if (!stat) return;

                stat.total++;
                if (r.is_priority) {
                    stat.priority++;
                } else {
                    stat.normal++;
                }
            });

            const dStats = Object.values(dMap).sort(
                (a, b) => b.total - a.total,
            );
            setDesignerStats(dStats);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        load(dateFrom, dateTo);
    }, [dateFrom, dateTo]);

    const setPreset = (days: number) => {
        const f = toYMD(addDays(new Date(), -days));
        setDateFrom(f);
        setDateTo(today);
        setCalMonth(new Date());
    };

    const maxCount = Math.max(...dayData.map((d) => d.count), 1);
    const maxDesigner = Math.max(...designerStats.map((d) => d.total), 1);

    const calYear = calMonth.getFullYear();
    const calMon = calMonth.getMonth();
    const firstDay = new Date(calYear, calMon, 1).getDay();
    const daysInMonth = new Date(calYear, calMon + 1, 0).getDate();
    const calDayMap: Record<string, DayData> = {};
    dayData.forEach((d) => {
        calDayMap[d.date] = d;
    });
    const calMaxCount = Math.max(
        ...Object.values(calDayMap).map((d) => d.count),
        1,
    );

    const downloadExcel = async () => {
        const { data } = await supabase
            .from("tasks")
            .select(
                "task_number, customer_name, order_source, order_method, order_method_note, print_items, post_processing, consult_path, file_paths, special_details, status, is_priority, created_at, completed_at, deleted_at, designer:designers(name)",
            )
            .gte("created_at", `${dateFrom}T00:00:00`)
            .lte("created_at", `${dateTo}T23:59:59`)
            .order("created_at", { ascending: false })
            .limit(10000);

        if (!data?.length) {
            alert("다운로드할 데이터가 없습니다.");
            return;
        }

        // 통계 집계용 변수
        let priority = 0, normal = 0;
        let done = 0, trash = 0, active = 0;
        const sourceMap: Record<string, number> = {};
        const methodMap: Record<string, number> = {};

        type Row = (typeof data)[0] & { designer: { name: string } | null };

        const detailRows = (data as Row[]).map((r) => {
            const isTrash = !!r.deleted_at;
            if (isTrash) trash++;
            else if (r.status === "완료") done++;
            else active++;

            if (r.is_priority) priority++;
            else normal++;

            const source = r.order_source || "미상";
            const method = r.order_method || "미상";
            sourceMap[source] = (sourceMap[source] || 0) + 1;
            methodMap[method] = (methodMap[method] || 0) + 1;

            const typeStr = r.is_priority ? "우선작업" : "일반작업";
            const statusStr = isTrash ? "휴지통(삭제)" : r.status;
            const methodStr = r.order_method_note
                ? `${method} (${r.order_method_note})`
                : method;

            return {
                번호: r.task_number || "-",
                상태: statusStr,
                작업유형: typeStr,
                고객이름: r.customer_name || "-",
                주문경로: r.order_source || "-",
                주문방법: methodStr,
                인쇄항목: r.print_items || "-",
                후가공: r.post_processing || "없음",
                상담경로: r.consult_path || "없음",
                담당디자이너: r.designer?.name ?? "미배정",
                접수일시: r.created_at?.replace("T", " ").slice(0, 16) || "-",
                완료일시: r.completed_at?.replace("T", " ").slice(0, 16) || "-",
                특이사항: r.special_details || "없음",
            };
        });

        const summaryRows = [
            { 구분: "조회 기간", 내용: `${dateFrom} ~ ${dateTo}` },
            { 구분: "총 접수건", 내용: `${data.length}건` },
            { 구분: "", 내용: "" },
            { 구분: "[상태별 현황]", 내용: "" },
            { 구분: "작업중", 내용: `${active}건` },
            { 구분: "완료", 내용: `${done}건` },
            { 구분: "휴지통", 내용: `${trash}건` },
            { 구분: "", 내용: "" },
            { 구분: "[작업유형별 현황]", 내용: "" },
            { 구분: "우선작업", 내용: `${priority}건` },
            { 구분: "일반작업", 내용: `${normal}건` },
            { 구분: "", 내용: "" },
            { 구분: "[주문경로별 현황]", 내용: "" },
            ...Object.entries(sourceMap).map(([k, v]) => ({
                구분: k,
                내용: `${v}건`,
            })),
        ];

        const wb = XLSX.utils.book_new();

        const wsSummary = XLSX.utils.json_to_sheet(summaryRows);
        wsSummary["!cols"] = [{ wpx: 150 }, { wpx: 200 }];
        const sumRange = XLSX.utils.decode_range(wsSummary["!ref"] || "A1");
        for (let R = sumRange.s.r; R <= sumRange.e.r; ++R) {
            for (let C = sumRange.s.c; C <= sumRange.e.c; ++C) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (!wsSummary[cellRef]) continue;
                wsSummary[cellRef].s = {
                    font: { bold: true, color: { rgb: "374151" } },
                    alignment: { horizontal: "center", vertical: "center" },
                };
            }
        }
        XLSX.utils.book_append_sheet(wb, wsSummary, "통계 요약");

        const wsDetail = XLSX.utils.json_to_sheet(detailRows);
        wsDetail["!cols"] = [
            { wpx: 50 }, { wpx: 80 }, { wpx: 80 }, { wpx: 100 },
            { wpx: 100 }, { wpx: 150 }, { wpx: 250 }, { wpx: 100 },
            { wpx: 100 }, { wpx: 100 }, { wpx: 120 }, { wpx: 120 }, { wpx: 300 },
        ];
        const detRange = XLSX.utils.decode_range(wsDetail["!ref"] || "A1");
        for (let R = detRange.s.r; R <= detRange.e.r; ++R) {
            for (let C = detRange.s.c; C <= detRange.e.c; ++C) {
                const cellRef = XLSX.utils.encode_cell({ r: R, c: C });
                if (!wsDetail[cellRef]) continue;
                if (R === 0) {
                    wsDetail[cellRef].s = {
                        fill: { fgColor: { rgb: "111827" } },
                        font: { bold: true, color: { rgb: "FFFFFF" } },
                        alignment: { horizontal: "center", vertical: "center" },
                    };
                } else {
                    wsDetail[cellRef].s = {
                        alignment: {
                            horizontal: C === 12 ? "left" : "center",
                            vertical: "center",
                        },
                    };
                }
            }
        }
        XLSX.utils.book_append_sheet(wb, wsDetail, "상세 내역");

        XLSX.writeFile(wb, `작업통계_${dateFrom}_${dateTo}.xlsx`);
    };

    const shouldShowLabel = (idx: number, total: number) => {
        if (total <= 14) return true;
        if (total <= 35) return idx % 3 === 0;
        if (total <= 65) return idx % 7 === 0;
        return idx % 10 === 0;
    };

    return (
        <div className="space-y-6">
            {/* 컨트롤 패널 */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        {PRESETS.map((p) => {
                            const isActive =
                                dateFrom ===
                                    toYMD(addDays(new Date(), -p.days)) &&
                                dateTo === today;
                            return (
                                <button
                                    key={p.label}
                                    onClick={() => setPreset(p.days)}
                                    className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                                        isActive
                                            ? "bg-white text-gray-900 shadow-sm"
                                            : "text-gray-500 hover:text-gray-900"
                                    }`}
                                >
                                    {p.label}
                                </button>
                            );
                        })}
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                        <input
                            type="date"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-gray-900 transition-colors text-gray-700 bg-white"
                        />
                        <span className="text-gray-400">~</span>
                        <input
                            type="date"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="px-3 py-1.5 border border-gray-200 rounded-lg outline-none focus:border-gray-900 transition-colors text-gray-700 bg-white"
                        />
                    </div>
                </div>

                <button
                    onClick={downloadExcel}
                    className="flex items-center gap-2 px-4 py-2 border border-gray-200 bg-white text-gray-900 rounded-lg font-medium text-sm hover:bg-gray-50 transition-colors"
                >
                    <Download className="w-4 h-4" />
                    엑셀 파일(.xlsx) 다운로드
                </button>
            </div>

            {loading ? (
                <div className="py-20 text-center text-gray-400 font-medium">
                    데이터를 불러오는 중입니다...
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* 일별 바차트 */}
                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                        <div className="flex items-center gap-2 mb-4">
                            <BarChart2 className="w-5 h-5 text-gray-500" />
                            <h3 className="font-semibold text-gray-900">
                                일별 완료 흐름
                            </h3>
                        </div>

                        <div className="flex items-end justify-between gap-[1px] sm:gap-[2px] w-full relative pb-1 mt-4 h-65">
                            {dayData.map((d, i) => {
                                const hPercent =
                                    d.count > 0
                                        ? Math.max(2, (d.count / maxCount) * 100)
                                        : 0;
                                const isToday = d.date === today;
                                const intensity =
                                    d.count > 0
                                        ? Math.max(0.15, d.count / maxCount)
                                        : 0;

                                const bgStyle =
                                    d.count === 0
                                        ? { backgroundColor: "#f3f4f6" }
                                        : isToday
                                          ? { backgroundColor: "#1ED67D" }
                                          : { backgroundColor: `rgba(17, 24, 39, ${intensity})` };

                                return (
                                    <div
                                        key={d.date}
                                        className="group relative flex flex-col items-center justify-end flex-1 h-full"
                                    >
                                        <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[11px] p-2.5 rounded-lg shadow-xl transition-opacity whitespace-nowrap z-50 pointer-events-none min-w-[100px]">
                                            <div className="font-bold border-b border-gray-700 pb-1.5 mb-1.5 text-center">
                                                {d.date.replace(/-/g, ".")}{" "}
                                                <span className="text-[#1ED67D]">
                                                    총 {d.count}건
                                                </span>
                                            </div>
                                            <div className="flex flex-col gap-1 text-gray-300">
                                                <div className="flex justify-between gap-3">
                                                    <span>우선작업</span>{" "}
                                                    <span className="font-medium text-white">
                                                        {d.priority}건
                                                    </span>
                                                </div>
                                                <div className="flex justify-between gap-3">
                                                    <span>일반작업</span>{" "}
                                                    <span className="font-medium text-[#1ED67D]">
                                                        {d.normal}건
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900"></div>
                                        </div>
                                        <div
                                            style={{
                                                height: `${hPercent}%`,
                                                ...bgStyle,
                                            }}
                                            className="w-full max-w-[24px] rounded-t-[2px] transition-all duration-300"
                                        />
                                        {shouldShowLabel(i, dayData.length) && (
                                            <span
                                                className={`absolute -bottom-5 text-[9px] whitespace-nowrap ${
                                                    isToday
                                                        ? "text-[#1ED67D] font-bold"
                                                        : "text-gray-400"
                                                }`}
                                            >
                                                {d.date.slice(5).replace("-", "/")}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 월간 히트맵 */}
                    <div className="bg-white border border-gray-200 rounded-xl p-6">
                        <div className="flex items-center justify-between mb-6">
                            <div className="flex items-center gap-2">
                                <CalendarDays className="w-5 h-5 text-gray-500" />
                                <h3 className="font-semibold text-gray-900">
                                    월간 작업 히트맵
                                </h3>
                            </div>
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() =>
                                        setCalMonth(
                                            (m) => new Date(m.getFullYear(), m.getMonth() - 1, 1),
                                        )
                                    }
                                    className="p-1 text-gray-400 hover:text-gray-900 rounded transition-colors"
                                >
                                    ‹
                                </button>
                                <span className="font-medium text-gray-900 text-sm">
                                    {calYear}.{" "}
                                    {String(calMon + 1).padStart(2, "0")}
                                </span>
                                <button
                                    onClick={() =>
                                        setCalMonth(
                                            (m) => new Date(m.getFullYear(), m.getMonth() + 1, 1),
                                        )
                                    }
                                    className="p-1 text-gray-400 hover:text-gray-900 rounded transition-colors"
                                >
                                    ›
                                </button>
                            </div>
                        </div>

                        <div className="grid grid-cols-7 gap-1">
                            {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                                <div
                                    key={d}
                                    className="text-center text-[11px] text-gray-400 font-medium py-1"
                                >
                                    {d}
                                </div>
                            ))}
                            {Array.from({ length: firstDay }).map((_, i) => (
                                <div key={`e${i}`} />
                            ))}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                const day = i + 1;
                                const dStr = `${calYear}-${String(calMon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                const dayStat = calDayMap[dStr];
                                const cnt = dayStat?.count ?? 0;
                                const intensity =
                                    cnt > 0 ? Math.max(0.15, cnt / calMaxCount) : 0;
                                const isToday2 = dStr === today;

                                return (
                                    <div
                                        key={day}
                                        className="group relative flex flex-col items-center justify-center h-10 rounded-md"
                                        style={{
                                            backgroundColor:
                                                cnt > 0
                                                    ? `rgba(30, 214, 125, ${intensity})`
                                                    : "transparent",
                                            border: isToday2
                                                ? "1.5px solid #111827"
                                                : "1.5px solid transparent",
                                        }}
                                    >
                                        <span
                                            className={`text-[11px] ${
                                                cnt > 0
                                                    ? intensity > 0.6
                                                        ? "text-gray-900 font-bold"
                                                        : "text-gray-800 font-medium"
                                                    : isToday2
                                                      ? "text-gray-900 font-bold"
                                                      : "text-gray-400"
                                            }`}
                                        >
                                            {day}
                                        </span>

                                        {cnt > 0 && dayStat && (
                                            <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[11px] p-2.5 rounded-lg shadow-xl transition-opacity whitespace-nowrap z-50 pointer-events-none min-w-[100px]">
                                                <div className="font-bold border-b border-gray-700 pb-1.5 mb-1.5 text-center">
                                                    {dStr.replace(/-/g, ".")}{" "}
                                                    <span className="text-[#1ED67D]">
                                                        총 {cnt}건
                                                    </span>
                                                </div>
                                                <div className="flex flex-col gap-1 text-gray-300">
                                                    <div className="flex justify-between gap-3">
                                                        <span>우선</span>{" "}
                                                        <span className="font-medium text-white">
                                                            {dayStat.priority}건
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-3">
                                                        <span>일반</span>{" "}
                                                        <span className="font-medium text-[#1ED67D]">
                                                            {dayStat.normal}건
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900"></div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* 디자이너별 세부 누적 바차트 */}
            {!loading && designerStats.length > 0 && (
                <div className="bg-white border border-gray-200 rounded-xl p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div className="flex items-center gap-2">
                            <Users className="w-5 h-5 text-gray-500" />
                            <h3 className="font-semibold text-gray-900">
                                디자이너별 완료 성과
                            </h3>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-medium text-gray-500">
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-sm bg-gray-900"></div>
                                우선작업
                            </div>
                            <div className="flex items-center gap-1.5">
                                <div className="w-2.5 h-2.5 rounded-sm bg-[#1ED67D]"></div>
                                일반작업
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-col gap-5">
                        {designerStats.map((d) => (
                            <div key={d.id} className="flex items-center gap-4">
                                <div className="flex items-center gap-3 w-32 shrink-0">
                                    {d.avatar_url ? (
                                        <img
                                            src={d.avatar_url}
                                            alt={d.name}
                                            className="w-7 h-7 rounded-full object-cover border border-gray-200"
                                        />
                                    ) : (
                                        <div className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-s font-medium text-gray-600">
                                            {d.name[0]}
                                        </div>
                                    )}
                                    <span className="text-s font-medium text-gray-700 truncate">
                                        {d.name}
                                    </span>
                                </div>

                                <div className="flex-1 h-5 flex items-center group relative cursor-pointer">
                                    <div
                                        className="h-full flex rounded-sm overflow-hidden w-full"
                                        style={{
                                            width: `${d.total > 0 ? Math.max(2, (d.total / maxDesigner) * 100) : 0}%`,
                                        }}
                                    >
                                        {d.priority > 0 && (
                                            <div
                                                className="bg-gray-900 h-full transition-all"
                                                style={{
                                                    width: `${(d.priority / d.total) * 100}%`,
                                                }}
                                            />
                                        )}
                                        {d.normal > 0 && (
                                            <div
                                                className="bg-[#1ED67D] h-full transition-all"
                                                style={{
                                                    width: `${(d.normal / d.total) * 100}%`,
                                                }}
                                            />
                                        )}
                                    </div>
                                    <span className="text-gray-900 text-sm font-semibold ml-3 w-8 shrink-0">
                                        {d.total > 0 ? `${d.total}건` : "0건"}
                                    </span>

                                    {d.total > 0 && (
                                        <div className="opacity-0 group-hover:opacity-100 absolute bottom-full mb-2 left-1/4 bg-gray-900 text-white text-[11px] p-2.5 rounded-lg shadow-xl transition-opacity whitespace-nowrap z-50 pointer-events-none min-w-[100px]">
                                            <div className="font-bold border-b border-gray-700 pb-1.5 mb-1.5 text-center">
                                                {d.name}{" "}
                                                <span className="text-[#1ED67D]">
                                                    총 {d.total}건
                                                </span>
                                            </div>
                                            <div className="flex flex-col gap-1 text-gray-300">
                                                <div className="flex justify-between gap-3">
                                                    <span>우선작업</span>{" "}
                                                    <span className="font-medium text-white">
                                                        {d.priority}건
                                                    </span>
                                                </div>
                                                <div className="flex justify-between gap-3">
                                                    <span>일반작업</span>{" "}
                                                    <span className="font-medium text-[#1ED67D]">
                                                        {d.normal}건
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="absolute top-full left-1/2 -translate-x-1/2 border-[5px] border-transparent border-t-gray-900"></div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
