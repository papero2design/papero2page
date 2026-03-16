// src/app/(classic)/board/stats/StatsClient.tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

type Designer = { id: string; name: string; avatar_url: string | null };
type DayData = { date: string; count: number };
type DesignerStat = {
    id: string;
    name: string;
    avatar_url: string | null;
    count: number;
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
            // 완료 작업 (completed_at 기준)
            const { data } = await supabase
                .from("tasks")
                .select("id, completed_at, assigned_designer_id")
                .eq("status", "완료")
                .is("deleted_at", null)
                .gte("completed_at", `${from}T00:00:00`)
                .lte("completed_at", `${to}T23:59:59`);

            const rows = data ?? [];
            setTotalDone(rows.length);

            // 날짜별 집계
            const dayMap: Record<string, number> = {};
            rows.forEach((r) => {
                if (!r.completed_at) return;
                const d = r.completed_at.split("T")[0];
                dayMap[d] = (dayMap[d] ?? 0) + 1;
            });
            // 날짜 범위 전체 채우기
            const days: DayData[] = [];
            const cur = new Date(from);
            const end = new Date(to);
            while (cur <= end) {
                const d = toYMD(cur);
                days.push({ date: d, count: dayMap[d] ?? 0 });
                cur.setDate(cur.getDate() + 1);
            }
            setDayData(days);

            // 디자이너별 집계
            const dMap: Record<string, number> = {};
            rows.forEach((r) => {
                if (!r.assigned_designer_id) return;
                dMap[r.assigned_designer_id] =
                    (dMap[r.assigned_designer_id] ?? 0) + 1;
            });
            const dStats = designers
                .map((d) => ({ ...d, count: dMap[d.id] ?? 0 }))
                .sort((a, b) => b.count - a.count);
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
    const maxDesigner = Math.max(...designerStats.map((d) => d.count), 1);

    // 달력 렌더
    const calYear = calMonth.getFullYear();
    const calMon = calMonth.getMonth();
    const firstDay = new Date(calYear, calMon, 1).getDay();
    const daysInMonth = new Date(calYear, calMon + 1, 0).getDate();
    const calDayMap: Record<string, number> = {};
    dayData.forEach((d) => {
        calDayMap[d.date] = d.count;
    });

    const calMaxCount = Math.max(...Object.values(calDayMap), 1);

    const downloadCSV = async () => {
        const { data } = await supabase
            .from("tasks")
            .select(
                "task_number, customer_name, order_source, order_method, print_items, status, completed_at, designer:designers(name)",
            )
            .eq("status", "완료")
            .is("deleted_at", null)
            .gte("completed_at", `${dateFrom}T00:00:00`)
            .lte("completed_at", `${dateTo}T23:59:59`)
            .order("completed_at", { ascending: false });

        if (!data?.length) {
            alert("데이터가 없습니다.");
            return;
        }

        type Row = (typeof data)[0] & { designer: { name: string } | null };
        const header =
            "번호,고객이름,주문경로,주문방법,인쇄항목,담당 디자이너,완료일시";
        const rows = (data as Row[]).map((r) =>
            [
                r.task_number,
                r.customer_name,
                r.order_source,
                r.order_method,
                r.print_items,
                (r.designer as { name: string } | null)?.name ?? "미배정",
                r.completed_at?.replace("T", " ").slice(0, 16),
            ]
                .map((v) => `"${v}"`)
                .join(","),
        );
        const csv = [header, ...rows].join("\n");
        const blob = new Blob(["\uFEFF" + csv], {
            type: "text/csv;charset=utf-8;",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `완료작업_${dateFrom}_${dateTo}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div>
            {/* 기간 선택 */}
            <div
                style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "center",
                    flexWrap: "wrap",
                    marginBottom: 20,
                }}
            >
                {PRESETS.map((p) => (
                    <button
                        key={p.label}
                        onClick={() => setPreset(p.days)}
                        style={{
                            padding: "5px 14px",
                            borderRadius: 6,
                            border: "1px solid #e5e7eb",
                            background:
                                dateFrom ===
                                    toYMD(addDays(new Date(), -p.days)) &&
                                dateTo === today
                                    ? "#111827"
                                    : "#fff",
                            color:
                                dateFrom ===
                                    toYMD(addDays(new Date(), -p.days)) &&
                                dateTo === today
                                    ? "#fff"
                                    : "#374151",
                            fontWeight: 600,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        {p.label}
                    </button>
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => setDateFrom(e.target.value)}
                        style={{
                            padding: "5px 8px",
                            border: "1px solid #e5e7eb",
                            borderRadius: 6,
                            outline: "none",
                            fontFamily: "inherit",
                        }}
                    />
                    <span style={{ color: "#9ca3af" }}>~</span>
                    <input
                        type="date"
                        value={dateTo}
                        onChange={(e) => setDateTo(e.target.value)}
                        style={{
                            padding: "5px 8px",
                            border: "1px solid #e5e7eb",
                            borderRadius: 6,
                            outline: "none",
                            fontFamily: "inherit",
                        }}
                    />
                </div>
                <button
                    onClick={downloadCSV}
                    style={{
                        padding: "5px 14px",
                        borderRadius: 6,
                        border: "1px solid #d1d5db",
                        background: "#fff",
                        color: "#374151",
                        fontWeight: 600,
                        cursor: "pointer",
                        fontFamily: "inherit",
                        marginLeft: "auto",
                    }}
                >
                    CSV 다운로드
                </button>
            </div>

            {/* 요약 */}
            <div style={{ display: "flex", gap: 10, marginBottom: 24 }}>
                {[
                    {
                        label: "선택 기간 완료",
                        value: totalDone,
                        color: "#15803d",
                        bg: "#f0fdf4",
                    },
                    {
                        label: "기간",
                        value: `${dateFrom} ~ ${dateTo}`,
                        color: "#6b7280",
                        bg: "#f9fafb",
                        text: true,
                    },
                ].map(({ label, value, color, bg, text }) => (
                    <div
                        key={label}
                        style={{
                            padding: "14px 20px",
                            background: bg,
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            minWidth: 160,
                        }}
                    >
                        {!text && (
                            <div
                                style={{ fontWeight: 800, fontSize: 28, color }}
                            >
                                {value}
                            </div>
                        )}
                        {text && (
                            <div
                                style={{ fontWeight: 600, color, fontSize: 13 }}
                            >
                                {value}
                            </div>
                        )}
                        <div style={{ color: "#9ca3af", marginTop: 2 }}>
                            {label}
                        </div>
                    </div>
                ))}
            </div>

            {loading && (
                <div
                    style={{
                        textAlign: "center",
                        padding: 20,
                        color: "#9ca3af",
                    }}
                >
                    로딩 중...
                </div>
            )}

            {!loading && (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "1fr 1fr",
                        gap: 20,
                        marginBottom: 24,
                    }}
                >
                    {/* 바차트 */}
                    <div
                        style={{
                            background: "#fff",
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            padding: "16px 20px",
                        }}
                    >
                        <p
                            style={{
                                margin: "0 0 16px",
                                fontWeight: 700,
                                color: "#374151",
                            }}
                        >
                            일별 완료 현황
                        </p>
                        <div
                            style={{
                                display: "flex",
                                alignItems: "flex-end",
                                gap: 2,
                                height: 140,
                                overflowX: "auto",
                            }}
                        >
                            {dayData.map((d) => {
                                const h =
                                    maxCount > 0
                                        ? Math.max(
                                              4,
                                              (d.count / maxCount) * 120,
                                          )
                                        : 4;
                                const isToday = d.date === today;
                                return (
                                    <div
                                        key={d.date}
                                        title={`${d.date}: ${d.count}건`}
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            flex: "0 0 auto",
                                            minWidth: 16,
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: 10,
                                                color: "#9ca3af",
                                                marginBottom: 2,
                                            }}
                                        >
                                            {d.count > 0 ? d.count : ""}
                                        </span>
                                        <div
                                            style={{
                                                width: 14,
                                                height: h,
                                                background:
                                                    d.count > 0
                                                        ? isToday
                                                            ? "#111827"
                                                            : "#1ED67D"
                                                        : "#f3f4f6",
                                                borderRadius: "3px 3px 0 0",
                                                transition: "height 0.2s",
                                            }}
                                        />
                                        {dayData.length <= 31 && (
                                            <span
                                                style={{
                                                    fontSize: 9,
                                                    color: "#d1d5db",
                                                    marginTop: 2,
                                                    writingMode: "vertical-rl",
                                                }}
                                            >
                                                {d.date.slice(5)}
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* 달력 */}
                    <div
                        style={{
                            background: "#fff",
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            padding: "16px 20px",
                        }}
                    >
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: 12,
                            }}
                        >
                            <button
                                onClick={() =>
                                    setCalMonth(
                                        (m) =>
                                            new Date(
                                                m.getFullYear(),
                                                m.getMonth() - 1,
                                                1,
                                            ),
                                    )
                                }
                                style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "#6b7280",
                                    fontSize: 18,
                                    padding: "0 4px",
                                }}
                            >
                                ‹
                            </button>
                            <span style={{ fontWeight: 700, color: "#374151" }}>
                                {calYear}년 {calMon + 1}월
                            </span>
                            <button
                                onClick={() =>
                                    setCalMonth(
                                        (m) =>
                                            new Date(
                                                m.getFullYear(),
                                                m.getMonth() + 1,
                                                1,
                                            ),
                                    )
                                }
                                style={{
                                    background: "none",
                                    border: "none",
                                    cursor: "pointer",
                                    color: "#6b7280",
                                    fontSize: 18,
                                    padding: "0 4px",
                                }}
                            >
                                ›
                            </button>
                        </div>
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(7,1fr)",
                                gap: 2,
                            }}
                        >
                            {["일", "월", "화", "수", "목", "금", "토"].map(
                                (d) => (
                                    <div
                                        key={d}
                                        style={{
                                            textAlign: "center",
                                            fontSize: 11,
                                            color: "#9ca3af",
                                            padding: "2px 0",
                                            fontWeight: 600,
                                        }}
                                    >
                                        {d}
                                    </div>
                                ),
                            )}
                            {Array.from({ length: firstDay }).map((_, i) => (
                                <div key={`e${i}`} />
                            ))}
                            {Array.from({ length: daysInMonth }).map((_, i) => {
                                const day = i + 1;
                                const dStr = `${calYear}-${String(calMon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                                const cnt = calDayMap[dStr] ?? 0;
                                const intensity =
                                    cnt > 0
                                        ? Math.max(0.2, cnt / calMaxCount)
                                        : 0;
                                const isToday2 = dStr === today;
                                return (
                                    <div
                                        key={day}
                                        title={
                                            cnt > 0
                                                ? `${dStr}: ${cnt}건 완료`
                                                : dStr
                                        }
                                        style={{
                                            textAlign: "center",
                                            padding: "4px 2px",
                                            borderRadius: 6,
                                            background:
                                                cnt > 0
                                                    ? `rgba(30,214,125,${intensity})`
                                                    : "transparent",
                                            border: isToday2
                                                ? "1.5px solid #1ED67D"
                                                : "1px solid transparent",
                                            cursor:
                                                cnt > 0 ? "pointer" : "default",
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: 12,
                                                color:
                                                    cnt > 0
                                                        ? "#15803d"
                                                        : isToday2
                                                          ? "#1ED67D"
                                                          : "#374151",
                                                fontWeight: cnt > 0 ? 700 : 400,
                                            }}
                                        >
                                            {day}
                                        </span>
                                        {cnt > 0 && (
                                            <div
                                                style={{
                                                    fontSize: 9,
                                                    color: "#15803d",
                                                    fontWeight: 600,
                                                }}
                                            >
                                                {cnt}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* 디자이너별 바차트 */}
            {!loading && designerStats.length > 0 && (
                <div
                    style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: "16px 20px",
                    }}
                >
                    <p
                        style={{
                            margin: "0 0 16px",
                            fontWeight: 700,
                            color: "#374151",
                        }}
                    >
                        디자이너별 완료 현황
                    </p>
                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                        }}
                    >
                        {designerStats.map((d) => (
                            <div
                                key={d.id}
                                style={{
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 12,
                                }}
                            >
                                {/* 아바타 */}
                                {d.avatar_url ? (
                                    <img
                                        src={d.avatar_url}
                                        alt={d.name}
                                        style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: "50%",
                                            objectFit: "cover",
                                            border: "2px solid #e5e7eb",
                                            flexShrink: 0,
                                        }}
                                    />
                                ) : (
                                    <div
                                        style={{
                                            width: 28,
                                            height: 28,
                                            borderRadius: "50%",
                                            background: "#e5e7eb",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontWeight: 700,
                                            color: "#6b7280",
                                            fontSize: 11,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {d.name[0]}
                                    </div>
                                )}
                                <span
                                    style={{
                                        width: 70,
                                        fontWeight: 600,
                                        color: "#374151",
                                        flexShrink: 0,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {d.name}
                                </span>
                                <div
                                    style={{
                                        flex: 1,
                                        background: "#f3f4f6",
                                        borderRadius: 99,
                                        height: 20,
                                        overflow: "hidden",
                                    }}
                                >
                                    <div
                                        style={{
                                            height: "100%",
                                            borderRadius: 99,
                                            background:
                                                d.count > 0
                                                    ? "#1ED67D"
                                                    : "transparent",
                                            width: `${(d.count / maxDesigner) * 100}%`,
                                            transition: "width 0.4s ease",
                                            display: "flex",
                                            alignItems: "center",
                                            paddingLeft: 8,
                                        }}
                                    >
                                        {d.count > 0 && (
                                            <span
                                                style={{
                                                    fontSize: 11,
                                                    fontWeight: 700,
                                                    color: "#fff",
                                                }}
                                            >
                                                {d.count}건
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {d.count === 0 && (
                                    <span
                                        style={{
                                            color: "#d1d5db",
                                            fontSize: 13,
                                        }}
                                    >
                                        0건
                                    </span>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
