"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Download } from "lucide-react";
import { useToast } from "../Toast";
import * as XLSX from "xlsx-js-style";

// ─── 타입 ──────────────────────────────────────────────────────
type Mode = "day" | "week" | "month";

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
    member_type: string;
    total: number;
    byMethod: Record<string, number>;
};

type RangeStats = {
    completed: number;
    registered: number;
    priorityRegistered: number;
    deleted: number;
    byMethod: Record<string, number>;
    designers: DesignerStat[];
    days: DayData[];
};

type CsMember = { id: string; name: string; avatar_url: string | null };

type CsMemberStat = {
    id: string;
    name: string;
    avatar_url: string | null;
    total: number;
};

// ─── 상수 ──────────────────────────────────────────────────────
const ORDER_METHODS = [
    "샘플디자인 의뢰",
    "재주문(글자수정)",
    "인쇄만 의뢰",
    "재주문(수정없는)",
    "디자인 복원",
    "신규 디자인",
    "디자인 수정",
    "기타",
];

const METHOD_COLORS: Record<string, string> = {
    "샘플디자인 의뢰": "#3B82F6",
    "재주문(글자수정)": "#1ED67D",
    "인쇄만 의뢰": "#F97316",
    "재주문(수정없는)": "#A78BFA",
    "디자인 복원": "#F59E0B",
    "신규 디자인": "#06B6D4",
    "디자인 수정": "#EC4899",
    기타: "#9CA3AF",
};

// ─── 헬퍼 ──────────────────────────────────────────────────────
function toYMD(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getWeekRange(dateStr: string): { from: string; to: string } {
    const d = new Date(dateStr + "T00:00:00");
    const day = d.getDay(); // 0=일
    const diff = day === 0 ? -6 : 1 - day; // 월요일 기준
    const mon = new Date(d);
    mon.setDate(d.getDate() + diff);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4); // 금요일 (월~금)
    return { from: toYMD(mon), to: toYMD(fri) };
}

function getMonthRange(
    year: number,
    month: number,
): { from: string; to: string } {
    const mm = String(month + 1).padStart(2, "0");
    const lastDay = new Date(year, month + 1, 0).getDate();
    return {
        from: `${year}-${mm}-01`,
        to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}`,
    };
}

function fmtPeriodLabel(from: string, to: string, mode: Mode): string {
    if (from === to) {
        const d = new Date(from + "T00:00:00");
        const week = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
        return `${from.replace(/-/g, ".")} (${week})`;
    }
    if (mode === "month") {
        return `${from.slice(0, 4)}년 ${parseInt(from.slice(5, 7))}월`;
    }
    return `${from.replace(/-/g, ".")} ~ ${to.replace(/-/g, ".")}`;
}

function fmtShortDate(dateStr: string): string {
    return dateStr.slice(5).replace("-", "/");
}

// ─── 스타일 상수 ───────────────────────────────────────────────
const card = (
    color: string,
    bg: string,
    border: string,
): React.CSSProperties => ({
    display: "block",
    padding: "16px 18px",
    border: `1px solid ${border}`,
    borderRadius: 10,
    background: bg,
    textDecoration: "none",
    transition: "box-shadow 0.15s",
});

const thStyle: React.CSSProperties = {
    padding: "8px 12px",
    textAlign: "center",
    fontSize: 12,
    fontWeight: 600,
    color: "#6b7280",
    borderBottom: "1px solid #e5e7eb",
    whiteSpace: "normal",
    wordBreak: "keep-all",
    background: "#f9fafb",
};

const tdStyle: React.CSSProperties = {
    padding: "9px 12px",
    textAlign: "center",
    fontSize: 13,
    color: "#374151",
};

// ─── 메인 컴포넌트 ────────────────────────────────────────────
export default function StatsClient() {
    const today = toYMD(new Date());
    const router = useRouter();
    const { showToast, ToastUI } = useToast();
    const supabase = createClient();

    // 날짜 선택 상태
    const [mode, setMode] = useState<Mode>("day");
    const [rangeFrom, setRangeFrom] = useState(today);
    const [rangeTo, setRangeTo] = useState(today);
    const [calMonth, setCalMonth] = useState(() => new Date());

    // 데이터 상태
    const [designers, setDesigners] = useState<Designer[]>([]);
    const [csMembers, setCsMembers] = useState<CsMember[]>([]);
    const [heatmap, setHeatmap] = useState<Record<string, number>>({});
    const [stats, setStats] = useState<RangeStats>({
        completed: 0,
        registered: 0,
        priorityRegistered: 0,
        deleted: 0,
        byMethod: {},
        designers: [],
        days: [],
    });
    const [csStats, setCsStats] = useState<CsMemberStat[]>([]);
    const [loading, setLoading] = useState(false);
    const [initLoaded, setInitLoaded] = useState(false);

    // ── 초기 로드: 디자이너 목록 + CS 목록 + 탭 순서 ──
    useEffect(() => {
        const init = async () => {
            const [desRes, csRes, orderRes] = await Promise.all([
                supabase
                    .from("designers")
                    .select("id, name, avatar_url, member_type")
                    .eq("is_active", true)
                    .order("name"),
                supabase
                    .from("designers")
                    .select("id, name, avatar_url")
                    .eq("is_active", true)
                    .eq("member_type", "cs")
                    .order("name"),
                supabase
                    .from("app_settings")
                    .select("value")
                    .eq("key", "designer_tab_order")
                    .single(),
            ]);
            const allMembers = desRes.data ?? [];
            // 디자이너만 필터 (member_type이 'cs'가 아닌 것)
            const raw: Designer[] = allMembers
                .filter(
                    (d) =>
                        (d as Designer & { member_type?: string })
                            .member_type !== "cs",
                )
                .map(({ id, name, avatar_url }) => ({ id, name, avatar_url }));
            const order: string[] = orderRes.data?.value ?? [];

            if (order.length > 0) {
                const map = new Map(raw.map((d) => [d.id, d]));
                const sorted: Designer[] = [];
                order.forEach((id) => {
                    const d = map.get(id);
                    if (d) sorted.push(d);
                });
                raw.forEach((d) => {
                    if (!order.includes(d.id)) sorted.push(d);
                });
                setDesigners(sorted);
            } else {
                setDesigners(raw);
            }
            setCsMembers(csRes.data ?? []);
            setInitLoaded(true);
        };
        init();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // ── 히트맵: 캘린더 이동 시 해당 월 완료 수 조회 ──
    const loadHeatmap = useCallback(async () => {
        const { from, to } = getMonthRange(
            calMonth.getFullYear(),
            calMonth.getMonth(),
        );
        const { data } = await supabase
            .from("tasks")
            .select("completed_at")
            .eq("status", "완료")
            .is("deleted_at", null)
            .gte("completed_at", `${from}T00:00:00`)
            .lte("completed_at", `${to}T23:59:59`)
            .limit(5000);
        const map: Record<string, number> = {};
        (data ?? []).forEach((r) => {
            if (r.completed_at) {
                const d = r.completed_at.split("T")[0];
                map[d] = (map[d] ?? 0) + 1;
            }
        });
        setHeatmap(map);
    }, [calMonth]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        loadHeatmap();
    }, [loadHeatmap]);

    // ── 통계: 선택 기간 변경 시 조회 ──
    const loadStats = useCallback(async () => {
        if (!initLoaded) return;
        setLoading(true);
        try {
            const fromTs = `${rangeFrom}T00:00:00`;
            const toTs = `${rangeTo}T23:59:59`;

            const [completedRes, registeredRes, deletedRes, csRegisteredRes] =
                await Promise.all([
                    supabase
                        .from("tasks")
                        .select(
                            "id, completed_at, assigned_designer_id, is_priority, order_method",
                        )
                        .eq("status", "완료")
                        .is("deleted_at", null)
                        .gte("completed_at", fromTs)
                        .lte("completed_at", toTs)
                        .limit(10000),
                    supabase
                        .from("tasks")
                        .select("id, is_priority")
                        .is("deleted_at", null)
                        .gte("created_at", fromTs)
                        .lte("created_at", toTs)
                        .limit(10000),
                    supabase
                        .from("tasks")
                        .select("id", { count: "exact", head: true })
                        .not("deleted_at", "is", null)
                        .gte("deleted_at", fromTs)
                        .lte("deleted_at", toTs),
                    // CS팀 등록 건: registered_by와 created_at 기준
                    csMembers.length > 0
                        ? supabase
                              .from("tasks")
                              .select(
                                  "id, registered_by, is_priority, order_method, created_at",
                              )
                              .is("deleted_at", null)
                              .gte("created_at", fromTs)
                              .lte("created_at", toTs)
                              .in(
                                  "registered_by",
                                  csMembers.map((c) => c.name),
                              )
                              .limit(10000)
                        : Promise.resolve({ data: [] }),
                ]);

            const completed = completedRes.data ?? [];
            const registered = registeredRes.data ?? [];
            const deletedCount = deletedRes.count ?? 0;
            const priorityRegistered = completed.filter(
                (r) => r.is_priority,
            ).length;
            const csRegistered =
                (
                    csRegisteredRes as {
                        data: {
                            id: string;
                            registered_by: string | null;
                            is_priority: boolean;
                            order_method: string | null;
                        }[];
                    }
                ).data ?? [];

            // 날짜별 집계
            const dayMap: Record<string, DayData> = {};
            const cur = new Date(rangeFrom + "T00:00:00");
            const end = new Date(rangeTo + "T00:00:00");
            while (cur <= end) {
                const d = toYMD(cur);
                dayMap[d] = { date: d, count: 0, priority: 0, normal: 0 };
                cur.setDate(cur.getDate() + 1);
            }
            completed.forEach((r) => {
                if (!r.completed_at) return;
                const d = r.completed_at.split("T")[0];
                if (dayMap[d]) {
                    dayMap[d].count++;
                    if (r.is_priority) dayMap[d].priority++;
                    else dayMap[d].normal++;
                }
            });
            const days = Object.values(dayMap);

            // 완료 집계 — 디자이너 + CS팀(담당 완료 포함) 모두 포함
            const dMap: Record<string, DesignerStat> = {};
            // 디자이너 먼저 (탭 순서 유지)
            designers.forEach((d) => {
                dMap[d.id] = {
                    ...d,
                    member_type: "designer",
                    total: 0,
                    byMethod: {},
                };
            });
            // CS팀도 추가 (완료 작업이 있을 수 있음)
            csMembers.forEach((c) => {
                if (!dMap[c.id])
                    dMap[c.id] = {
                        ...c,
                        member_type: "cs",
                        total: 0,
                        byMethod: {},
                    };
            });
            completed.forEach((r) => {
                if (!r.assigned_designer_id) return;
                const s = dMap[r.assigned_designer_id];
                if (!s) return;
                s.total++;
                const m = r.order_method ?? "기타";
                s.byMethod[m] = (s.byMethod[m] ?? 0) + 1;
            });
            // 디자이너 순서 우선, CS팀은 뒤에 붙임 (완료 있는 경우만)
            const designerStats = [
                ...designers.map((d) => dMap[d.id]),
                ...csMembers.map((c) => dMap[c.id]).filter((s) => s?.total > 0),
            ].filter(Boolean);

            // 주문방법별 전체 집계
            const totalByMethod: Record<string, number> = {};
            completed.forEach((r) => {
                const m = r.order_method ?? "기타";
                totalByMethod[m] = (totalByMethod[m] ?? 0) + 1;
            });

            setStats({
                completed: completed.length,
                registered: registered.length,
                priorityRegistered,
                deleted: deletedCount,
                byMethod: totalByMethod,
                designers: designerStats,
                days,
            });

            // CS팀 개인별 등록 집계 (총계만)
            if (csMembers.length > 0) {
                const csNameMap: Record<string, CsMemberStat> = {};
                csMembers.forEach((c) => {
                    csNameMap[c.name] = { ...c, total: 0 };
                });
                csRegistered.forEach((r) => {
                    const name = r.registered_by ?? "";
                    const s = csNameMap[name];
                    if (s) s.total++;
                });
                setCsStats(
                    csMembers.map((c) => csNameMap[c.name]).filter(Boolean),
                );
            } else {
                setCsStats([]);
            }
        } finally {
            setLoading(false);
        }
    }, [rangeFrom, rangeTo, designers, csMembers, initLoaded]); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        loadStats();
    }, [loadStats]);

    // ── 디자이너 완료 내역으로 이동 ──
    const goToDesigner = useCallback(
        (designerId: string) => {
            const params = new URLSearchParams({
                designer: designerId,
                tab: "done",
                dateFrom: rangeFrom,
                dateTo: rangeTo,
            });
            router.push(`/board?${params.toString()}`);
        },
        [rangeFrom, rangeTo, router],
    );

    // ── 날짜 선택 핸들러 ──
    const handleModeChange = (m: Mode) => {
        setMode(m);
        const now = new Date();
        if (m === "day") {
            setRangeFrom(today);
            setRangeTo(today);
            setCalMonth(now);
        } else if (m === "week") {
            const range = getWeekRange(today);
            setRangeFrom(range.from);
            setRangeTo(range.to);
            setCalMonth(now);
        } else {
            const range = getMonthRange(now.getFullYear(), now.getMonth());
            setRangeFrom(range.from);
            setRangeTo(range.to);
            setCalMonth(now);
        }
    };

    const handleDayClick = (dateStr: string) => {
        if (mode === "day") {
            setRangeFrom(dateStr);
            setRangeTo(dateStr);
        } else if (mode === "week") {
            const range = getWeekRange(dateStr);
            setRangeFrom(range.from);
            setRangeTo(range.to);
        }
        // month 모드에서는 월 네비게이션으로 선택
    };

    const handleMonthNav = (delta: number) => {
        const next = new Date(calMonth);
        next.setMonth(next.getMonth() + delta);
        setCalMonth(next);
        if (mode === "month") {
            const range = getMonthRange(next.getFullYear(), next.getMonth());
            setRangeFrom(range.from);
            setRangeTo(range.to);
        }
    };

    // ── 엑셀 다운로드 ──
    const downloadExcel = async () => {
        const fromTs = `${rangeFrom}T00:00:00`;
        const toTs = `${rangeTo}T23:59:59`;
        const { data } = await supabase
            .from("tasks")
            .select(
                "task_number, customer_name, order_source, order_method, order_method_note, print_items, post_processing, consult_path, file_paths, special_details, status, is_priority, created_at, completed_at, deleted_at, designer:designers(name)",
            )
            .eq("status", "완료")
            .is("deleted_at", null)
            .gte("completed_at", fromTs)
            .lte("completed_at", toTs)
            .order("completed_at", { ascending: false })
            .limit(10000);

        if (!data?.length) {
            showToast("다운로드할 데이터가 없습니다.", "info");
            return;
        }

        type Row = (typeof data)[0] & { designer: { name: string } | null };
        const detailRows = (data as Row[]).map((r) => ({
            번호: r.task_number || "-",
            고객이름: r.customer_name || "-",
            주문경로: r.order_source || "-",
            주문방법: r.order_method_note
                ? `${r.order_method} (${r.order_method_note})`
                : r.order_method || "-",
            인쇄항목: r.print_items || "-",
            후가공: r.post_processing || "없음",
            상담경로: r.consult_path || "없음",
            담당디자이너: r.designer?.name ?? "미배정",
            작업유형: r.is_priority ? "우선작업" : "일반작업",
            접수일시: r.created_at?.replace("T", " ").slice(0, 16) || "-",
            완료일시: r.completed_at?.replace("T", " ").slice(0, 16) || "-",
            특이사항: r.special_details || "없음",
        }));

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(detailRows);
        ws["!cols"] = [40, 80, 60, 120, 160, 80, 80, 80, 70, 130, 130, 200].map(
            (wpx) => ({ wpx }),
        );
        XLSX.utils.book_append_sheet(wb, ws, "완료 내역");
        XLSX.writeFile(wb, `작업통계_${rangeFrom}_${rangeTo}.xlsx`);
    };

    // ── 렌더 계산값 ──
    const calYear = calMonth.getFullYear();
    const calMon = calMonth.getMonth();
    const firstDay = new Date(calYear, calMon, 1).getDay();
    const daysInMonth = new Date(calYear, calMon + 1, 0).getDate();
    const heatmapMax = Math.max(...Object.values(heatmap), 1);
    const statsMax = Math.max(...stats.days.map((d) => d.count), 1);
    const designerMax = Math.max(...stats.designers.map((d) => d.total), 1);
    const periodLabel = fmtPeriodLabel(rangeFrom, rangeTo, mode);
    const isInRange = (d: string) => d >= rangeFrom && d <= rangeTo;
    const isEdge = (d: string) => d === rangeFrom || d === rangeTo;
    const hasDesignerData = stats.designers.some((d) => d.total > 0);
    const multiDay = stats.days.length > 1;

    return (
        <div
            style={{ maxWidth: 1260, margin: "0 auto", padding: "0 16px 40px" }}
        >
            {ToastUI}

            {/* ── 헤더 ── */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    flexWrap: "wrap",
                    gap: 12,
                    paddingTop: 24,
                    paddingBottom: 16,
                    borderBottom: "1px solid #e5e7eb",
                    marginBottom: 24,
                }}
            >
                <div>
                    <h2
                        style={{
                            margin: 0,
                            fontSize: 20,
                            fontWeight: 800,
                            color: "#111827",
                        }}
                    >
                        작업 통계
                    </h2>
                    <p
                        style={{
                            margin: "3px 0 0",
                            fontSize: 13,
                            color: "#9ca3af",
                        }}
                    >
                        {periodLabel}
                    </p>
                </div>
                {/* 모드 버튼 */}
                <div style={{ display: "flex", gap: 6 }}>
                    {(["day", "week", "month"] as Mode[]).map((m) => {
                        const labels = {
                            day: "일간",
                            week: "주간",
                            month: "월간",
                        };
                        const active = mode === m;
                        return (
                            <button
                                key={m}
                                onClick={() => handleModeChange(m)}
                                style={{
                                    padding: "6px 16px",
                                    borderRadius: 99,
                                    border: `1px solid ${active ? "#111827" : "#e5e7eb"}`,
                                    background: active ? "#111827" : "#fff",
                                    color: active ? "#fff" : "#6b7280",
                                    fontWeight: 600,
                                    fontSize: 13,
                                    cursor: "pointer",
                                    fontFamily: "inherit",
                                    transition: "all 0.15s",
                                }}
                            >
                                {labels[m]}
                            </button>
                        );
                    })}
                    <button
                        onClick={downloadExcel}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 5,
                            padding: "6px 14px",
                            borderRadius: 99,
                            border: "1px solid #e5e7eb",
                            background: "#fff",
                            color: "#6b7280",
                            fontWeight: 600,
                            fontSize: 13,
                            cursor: "pointer",
                            fontFamily: "inherit",
                        }}
                    >
                        <Download size={13} />
                        엑셀
                    </button>
                </div>
            </div>

            {/* ── 2열 그리드: 캘린더 + 통계카드 ── */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 20,
                    marginBottom: 20,
                }}
            >
                {/* 캘린더 히트맵 */}
                <div
                    style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: 20,
                    }}
                >
                    {/* 월 네비게이션 */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 12,
                        }}
                    >
                        <button
                            onClick={() => handleMonthNav(-1)}
                            style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontSize: 18,
                                color: "#6b7280",
                                lineHeight: 1,
                                padding: "2px 6px",
                            }}
                        >
                            ‹
                        </button>
                        <div style={{ textAlign: "center" }}>
                            <span
                                style={{
                                    fontWeight: 700,
                                    fontSize: 14,
                                    color: "#111827",
                                }}
                            >
                                {calYear}년 {calMon + 1}월
                            </span>
                            {mode === "month" && (
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "#9ca3af",
                                        marginTop: 2,
                                    }}
                                >
                                    ← → 화살표로 월 선택
                                </div>
                            )}
                            {mode === "week" && (
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "#9ca3af",
                                        marginTop: 2,
                                    }}
                                >
                                    날짜 클릭 시 해당 주 선택
                                </div>
                            )}
                            {mode === "day" && (
                                <div
                                    style={{
                                        fontSize: 12,
                                        color: "#9ca3af",
                                        marginTop: 2,
                                    }}
                                >
                                    날짜 클릭 시 해당 일 선택
                                </div>
                            )}
                        </div>
                        <button
                            onClick={() => handleMonthNav(1)}
                            style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                fontSize: 18,
                                color: "#6b7280",
                                lineHeight: 1,
                                padding: "2px 6px",
                            }}
                        >
                            ›
                        </button>
                    </div>

                    {/* 요일 헤더 */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(7, 1fr)",
                            gap: 2,
                            marginBottom: 4,
                        }}
                    >
                        {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                            <div
                                key={d}
                                style={{
                                    textAlign: "center",
                                    fontSize: 12,
                                    color: "#9ca3af",
                                    fontWeight: 600,
                                    paddingBottom: 2,
                                }}
                            >
                                {d}
                            </div>
                        ))}
                    </div>

                    {/* 날짜 셀 */}
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "repeat(7, 1fr)",
                            gap: 2,
                        }}
                    >
                        {Array.from({ length: firstDay }).map((_, i) => (
                            <div key={`e${i}`} />
                        ))}
                        {Array.from({ length: daysInMonth }).map((_, i) => {
                            const day = i + 1;
                            const dateStr = `${calYear}-${String(calMon + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                            const cnt = heatmap[dateStr] ?? 0;
                            const intensity =
                                cnt > 0 ? Math.max(0.15, cnt / heatmapMax) : 0;
                            const isToday = dateStr === today;
                            const inRange = isInRange(dateStr);
                            const isEdgeDay = isEdge(dateStr);
                            const singleDay = rangeFrom === rangeTo;

                            let bg = "transparent";
                            let textColor =
                                cnt > 0
                                    ? intensity > 0.5
                                        ? "#111827"
                                        : "#374151"
                                    : "#9ca3af";
                            let outline = "none";

                            if (inRange) {
                                bg = "#111827";
                                textColor = "#fff";
                            } else if (cnt > 0) {
                                bg = `rgba(30, 214, 125, ${intensity})`;
                            }
                            if (isToday && !inRange) {
                                outline = "2px solid #111827";
                                textColor = "#111827";
                            }

                            return (
                                <div
                                    key={dateStr}
                                    onClick={() => handleDayClick(dateStr)}
                                    title={
                                        cnt > 0
                                            ? `${fmtShortDate(dateStr)}: ${cnt}건 완료`
                                            : fmtShortDate(dateStr)
                                    }
                                    style={{
                                        aspectRatio: "1",
                                        borderRadius: 5,
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                        fontSize: 12,
                                        fontWeight: inRange ? 700 : 400,
                                        cursor: "pointer",
                                        background: bg,
                                        color: textColor,
                                        outline,
                                        outlineOffset: -2,
                                        transition: "background 0.1s",
                                    }}
                                >
                                    {day}
                                </div>
                            );
                        })}
                    </div>

                    {/* 히트맵 범례 */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                            marginTop: 12,
                            justifyContent: "flex-end",
                        }}
                    >
                        <span style={{ fontSize: 11, color: "#d1d5db" }}>
                            적음
                        </span>
                        {[0.15, 0.35, 0.55, 0.75, 1.0].map((op) => (
                            <div
                                key={op}
                                style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 2,
                                    background: `rgba(30, 214, 125, ${op})`,
                                }}
                            />
                        ))}
                        <span style={{ fontSize: 11, color: "#d1d5db" }}>
                            많음
                        </span>
                    </div>
                </div>

                {/* 통계 카드 */}
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    <div
                        style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 12,
                        }}
                    >
                        {[
                            {
                                label: "완료",
                                sublabel: "완료일 기준",
                                value: stats.completed,
                                color: "#15803d",
                                bg: "#f0fdf4",
                                border: "#bbf7d0",
                                href: "/board?tab=done",
                            },
                            {
                                label: "등록",
                                sublabel: "접수일 기준",
                                value: stats.registered,
                                color: "#111827",
                                bg: "#f9fafb",
                                border: "#e5e7eb",
                                href: "/board?tab=active",
                            },
                            {
                                label: "우선 완료",
                                sublabel: "완료일 기준",
                                value: stats.priorityRegistered,
                                color: "#dc2626",
                                bg: "#fef2f2",
                                border: "#fecaca",
                                href: "/board?tab=priority",
                            },
                            {
                                label: "삭제",
                                sublabel: "삭제일 기준",
                                value: stats.deleted,
                                color: "#9ca3af",
                                bg: "#f9fafb",
                                border: "#e5e7eb",
                                href: "/board/trash",
                            },
                        ].map(
                            ({
                                label,
                                sublabel,
                                value,
                                color,
                                bg,
                                border,
                                href,
                            }) => (
                                <a
                                    key={label}
                                    href={href}
                                    style={card(color, bg, border)}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            justifyContent: "space-between",
                                            alignItems: "center",
                                            marginBottom: 8,
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: 12,
                                                color: "#6b7280",
                                                fontWeight: 600,
                                            }}
                                        >
                                            {label}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 11,
                                                color: "#d1d5db",
                                                fontWeight: 400,
                                            }}
                                        >
                                            {sublabel}
                                        </span>
                                    </div>
                                    <div
                                        style={{
                                            fontSize: 30,
                                            fontWeight: 800,
                                            color: loading ? "#d1d5db" : color,
                                            letterSpacing: "-0.5px",
                                        }}
                                    >
                                        {loading ? "—" : value}
                                    </div>
                                </a>
                            ),
                        )}
                    </div>
                    {/* 주문방법별 완료 */}
                    {!loading && stats.completed > 0 && (
                        <div
                            style={{
                                padding: "14px 16px",
                                background: "#fff",
                                borderRadius: 10,
                                border: "1px solid #e5e7eb",
                            }}
                        >
                            <div
                                style={{
                                    fontSize: 12,
                                    color: "#9ca3af",
                                    fontWeight: 500,
                                    marginBottom: 10,
                                }}
                            >
                                주문방법별 완료
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 7,
                                }}
                            >
                                {ORDER_METHODS.filter(
                                    (m) => (stats.byMethod[m] ?? 0) > 0,
                                ).map((m) => {
                                    const cnt = stats.byMethod[m] ?? 0;
                                    const pct = Math.round(
                                        (cnt / stats.completed) * 100,
                                    );
                                    const barW = (cnt / stats.completed) * 100;
                                    return (
                                        <div key={m}>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    justifyContent:
                                                        "space-between",
                                                    alignItems: "center",
                                                    marginBottom: 3,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 5,
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            width: 7,
                                                            height: 7,
                                                            borderRadius: 2,
                                                            background:
                                                                METHOD_COLORS[
                                                                    m
                                                                ],
                                                            flexShrink: 0,
                                                        }}
                                                    />
                                                    <span
                                                        style={{
                                                            fontSize: 12,
                                                            color: "#374151",
                                                        }}
                                                    >
                                                        {m}
                                                    </span>
                                                </div>
                                                <span
                                                    style={{
                                                        fontSize: 12,
                                                        fontWeight: 700,
                                                        color: "#111827",
                                                    }}
                                                >
                                                    {cnt}
                                                    <span
                                                        style={{
                                                            fontWeight: 400,
                                                            color: "#9ca3af",
                                                            marginLeft: 3,
                                                        }}
                                                    >
                                                        {pct}%
                                                    </span>
                                                </span>
                                            </div>
                                            <div
                                                style={{
                                                    height: 5,
                                                    borderRadius: 3,
                                                    background: "#f3f4f6",
                                                    overflow: "hidden",
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        width: `${barW}%`,
                                                        height: "100%",
                                                        background:
                                                            METHOD_COLORS[m],
                                                        borderRadius: 3,
                                                        transition:
                                                            "width 0.3s",
                                                    }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* 기간 요약 */}
                    <div
                        style={{
                            padding: "14px 16px",
                            background: "#f9fafb",
                            borderRadius: 10,
                            border: "1px solid #e5e7eb",
                        }}
                    >
                        <div
                            style={{
                                fontSize: 12,
                                color: "#9ca3af",
                                marginBottom: 4,
                                fontWeight: 500,
                            }}
                        >
                            선택 기간
                        </div>
                        <div
                            style={{
                                fontSize: 15,
                                fontWeight: 700,
                                color: "#111827",
                            }}
                        >
                            {periodLabel}
                        </div>
                        {!loading && stats.completed > 0 && (
                            <div
                                style={{
                                    marginTop: 10,
                                    fontSize: 13,
                                    color: "#6b7280",
                                }}
                            >
                                완료{" "}
                                <strong style={{ color: "#15803d" }}>
                                    {stats.completed}
                                </strong>
                                건
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* ── 일별 완료 추이 (다일 기간일 때만) ── */}
            {multiDay && stats.days.length > 0 && (
                <div
                    style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: "20px 24px",
                        marginBottom: 20,
                    }}
                >
                    <div
                        style={{
                            fontWeight: 700,
                            fontSize: 14,
                            color: "#111827",
                            marginBottom: 16,
                        }}
                    >
                        일별 완료 추이
                    </div>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "flex-end",
                            gap: stats.days.length > 14 ? 2 : 6,
                            height: 90,
                            paddingBottom: 22,
                            position: "relative",
                        }}
                    >
                        {stats.days.map((d) => {
                            const h =
                                d.count > 0
                                    ? Math.max(5, (d.count / statsMax) * 80)
                                    : 0;
                            const isToday2 = d.date === today;
                            const showCount =
                                stats.days.length <= 14 || d.count > 0;
                            return (
                                <div
                                    key={d.date}
                                    style={{
                                        flex: 1,
                                        display: "flex",
                                        flexDirection: "column",
                                        alignItems: "center",
                                        position: "relative",
                                    }}
                                >
                                    {showCount && d.count > 0 && (
                                        <span
                                            style={{
                                                position: "absolute",
                                                top: -16,
                                                fontSize: 11,
                                                fontWeight: 700,
                                                color: isToday2
                                                    ? "#1ED67D"
                                                    : "#9ca3af",
                                            }}
                                        >
                                            {d.count}
                                        </span>
                                    )}
                                    <div
                                        style={{
                                            position: "absolute",
                                            bottom: 0,
                                            width: "80%",
                                            height: `${h}px`,
                                            background: isToday2
                                                ? "#1ED67D"
                                                : "#111827",
                                            borderRadius: "3px 3px 0 0",
                                            opacity: isToday2 ? 1 : 0.55,
                                            transition: "height 0.3s",
                                        }}
                                    />
                                    <span
                                        style={{
                                            position: "absolute",
                                            bottom: -18,
                                            fontSize: 11,
                                            color: isToday2
                                                ? "#1ED67D"
                                                : "#d1d5db",
                                            whiteSpace: "nowrap",
                                            fontWeight: isToday2 ? 700 : 400,
                                        }}
                                    >
                                        {fmtShortDate(d.date)}
                                    </span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* ── 디자이너 통계 테이블 ── */}
            {hasDesignerData && (
                <div
                    style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        overflow: "hidden",
                        marginBottom: 20,
                    }}
                >
                    <div
                        style={{
                            padding: "14px 20px",
                            borderBottom: "1px solid #f3f4f6",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                        }}
                    >
                        <span
                            style={{
                                fontWeight: 700,
                                fontSize: 14,
                                color: "#111827",
                            }}
                        >
                            디자이너별 완료 현황
                        </span>
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>
                            탭 순서 기준
                        </span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                            }}
                        >
                            <thead>
                                <tr>
                                    <th
                                        style={{
                                            ...thStyle,
                                            textAlign: "left",
                                            paddingLeft: 20,
                                            width: 130,
                                        }}
                                    >
                                        멤버
                                    </th>

                                    {ORDER_METHODS.map((m) => (
                                        <th
                                            key={m}
                                            style={{ ...thStyle, minWidth: 72 }}
                                        >
                                            <div
                                                style={{
                                                    display: "flex",
                                                    flexDirection: "column",
                                                    alignItems: "center",
                                                    gap: 3,
                                                }}
                                            >
                                                <span
                                                    style={{
                                                        display: "inline-block",
                                                        width: 7,
                                                        height: 7,
                                                        borderRadius: 2,
                                                        background:
                                                            METHOD_COLORS[m],
                                                        flexShrink: 0,
                                                    }}
                                                />
                                                <span>{m}</span>
                                            </div>
                                        </th>
                                    ))}
                                    <th
                                        style={{
                                            ...thStyle,
                                            width: 60,
                                            color: "#15803d",
                                        }}
                                    >
                                        완료
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {stats.designers
                                    .filter((d) => d.total > 0)
                                    .map((d, i) => (
                                        <tr
                                            key={d.id}
                                            onClick={() => goToDesigner(d.id)}
                                            style={{
                                                borderTop: "1px solid #f3f4f6",
                                                background:
                                                    i % 2 === 0
                                                        ? "#fff"
                                                        : "#fafafa",
                                                cursor: "pointer",
                                            }}
                                        >
                                            <td
                                                style={{
                                                    ...tdStyle,
                                                    textAlign: "left",
                                                    paddingLeft: 20,
                                                    fontWeight: 600,
                                                    width: 150,
                                                }}
                                            >
                                                <div
                                                    style={{
                                                        display: "flex",
                                                        alignItems: "center",
                                                        gap: 8,
                                                    }}
                                                >
                                                    {d.avatar_url ? (
                                                        <img
                                                            src={d.avatar_url}
                                                            style={{
                                                                width: 22,
                                                                height: 22,
                                                                borderRadius:
                                                                    "50%",
                                                                objectFit:
                                                                    "cover",
                                                                flexShrink: 0,
                                                            }}
                                                            alt={d.name}
                                                        />
                                                    ) : (
                                                        <div
                                                            style={{
                                                                width: 22,
                                                                height: 22,
                                                                borderRadius:
                                                                    "50%",
                                                                background:
                                                                    d.member_type ===
                                                                    "cs"
                                                                        ? "#dbeafe"
                                                                        : "#e5e7eb",
                                                                display: "flex",
                                                                alignItems:
                                                                    "center",
                                                                justifyContent:
                                                                    "center",
                                                                fontSize: 10,
                                                                fontWeight: 700,
                                                                color:
                                                                    d.member_type ===
                                                                    "cs"
                                                                        ? "#1d4ed8"
                                                                        : "#6b7280",
                                                                flexShrink: 0,
                                                            }}
                                                        >
                                                            {d.name[0]}
                                                        </div>
                                                    )}
                                                    {d.name}
                                                    {d.member_type === "cs" && (
                                                        <span
                                                            style={{
                                                                padding:
                                                                    "1px 6px",
                                                                borderRadius: 99,
                                                                background:
                                                                    "#eff6ff",
                                                                color: "#1d4ed8",
                                                                fontWeight: 700,
                                                                fontSize: 10,
                                                                border: "1px solid #bfdbfe",
                                                                flexShrink: 0,
                                                            }}
                                                        >
                                                            CS
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            {ORDER_METHODS.map((m) => {
                                                const v = d.byMethod[m] ?? 0;
                                                return (
                                                    <td
                                                        key={m}
                                                        style={{
                                                            ...tdStyle,
                                                            color:
                                                                v > 0
                                                                    ? "#374151"
                                                                    : "#e5e7eb",
                                                            fontWeight:
                                                                v > 0
                                                                    ? 600
                                                                    : 400,
                                                        }}
                                                    >
                                                        {v || "—"}
                                                    </td>
                                                );
                                            })}
                                            <td
                                                style={{
                                                    ...tdStyle,
                                                    fontWeight: 800,
                                                    color: "#15803d",
                                                    fontSize: 15,
                                                }}
                                            >
                                                {d.total}
                                            </td>
                                        </tr>
                                    ))}
                                {/* 합계 행 */}
                                {stats.designers.filter((d) => d.total > 0)
                                    .length > 1 && (
                                    <tr
                                        style={{
                                            borderTop: "2px solid #e5e7eb",
                                            background: "#f9fafb",
                                        }}
                                    >
                                        <td
                                            style={{
                                                ...tdStyle,
                                                textAlign: "left",
                                                paddingLeft: 20,
                                                fontWeight: 700,
                                                color: "#6b7280",
                                            }}
                                        >
                                            합계
                                        </td>

                                        {ORDER_METHODS.map((m) => {
                                            const v = stats.designers.reduce(
                                                (s, d) =>
                                                    s + (d.byMethod[m] ?? 0),
                                                0,
                                            );
                                            return (
                                                <td
                                                    key={m}
                                                    style={{
                                                        ...tdStyle,
                                                        fontWeight:
                                                            v > 0 ? 700 : 400,
                                                        color:
                                                            v > 0
                                                                ? "#374151"
                                                                : "#e5e7eb",
                                                    }}
                                                >
                                                    {v || "—"}
                                                </td>
                                            );
                                        })}

                                        <td
                                            style={{
                                                ...tdStyle,
                                                fontWeight: 800,
                                                color: "#15803d",
                                                fontSize: 15,
                                            }}
                                        >
                                            {stats.completed}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── 디자이너 가로 막대 그래프 ── */}
            {hasDesignerData && (
                <div
                    style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        padding: "20px 24px",
                        marginBottom: 20,
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 16,
                        }}
                    >
                        <span
                            style={{
                                fontWeight: 700,
                                fontSize: 14,
                                color: "#111827",
                            }}
                        >
                            디자이너별 완료 성과
                        </span>
                        {/* 범례 */}
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: "4px 12px",
                                justifyContent: "flex-end",
                            }}
                        >
                            {ORDER_METHODS.map((m) => (
                                <div
                                    key={m}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 4,
                                        fontSize: 12,
                                        color: "#6b7280",
                                    }}
                                >
                                    <div
                                        style={{
                                            width: 8,
                                            height: 8,
                                            borderRadius: 2,
                                            background: METHOD_COLORS[m],
                                            flexShrink: 0,
                                        }}
                                    />
                                    {m}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div
                        style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                        }}
                    >
                        {stats.designers
                            .filter((d) => d.total > 0)
                            .map((d) => (
                                <div
                                    key={d.id}
                                    onClick={() => goToDesigner(d.id)}
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 12,
                                        cursor: "pointer",
                                        borderRadius: 6,
                                        padding: "2px 4px",
                                        transition: "background 0.1s",
                                    }}
                                >
                                    {/* 이름 */}
                                    <div
                                        style={{
                                            width: 110,
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            flexShrink: 0,
                                        }}
                                    >
                                        {d.avatar_url ? (
                                            <img
                                                src={d.avatar_url}
                                                style={{
                                                    width: 22,
                                                    height: 22,
                                                    borderRadius: "50%",
                                                    objectFit: "cover",
                                                    flexShrink: 0,
                                                }}
                                                alt={d.name}
                                            />
                                        ) : (
                                            <div
                                                style={{
                                                    width: 22,
                                                    height: 22,
                                                    borderRadius: "50%",
                                                    background: "#e5e7eb",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    justifyContent: "center",
                                                    fontSize: 10,
                                                    fontWeight: 700,
                                                    color: "#6b7280",
                                                    flexShrink: 0,
                                                }}
                                            >
                                                {d.name[0]}
                                            </div>
                                        )}
                                        <span
                                            style={{
                                                fontSize: 13,
                                                fontWeight: 600,
                                                color: "#374151",
                                                overflow: "hidden",
                                                textOverflow: "ellipsis",
                                                whiteSpace: "nowrap",
                                            }}
                                        >
                                            {d.name}
                                        </span>
                                    </div>

                                    {/* 막대 */}
                                    <div
                                        style={{
                                            flex: 1,
                                            display: "flex",
                                            height: 22,
                                            borderRadius: 4,
                                            overflow: "hidden",
                                            background: "#f3f4f6",
                                            position: "relative",
                                        }}
                                    >
                                        {ORDER_METHODS.map((m) => {
                                            const cnt = d.byMethod[m] ?? 0;
                                            if (!cnt) return null;
                                            const pct =
                                                (cnt / designerMax) * 100;
                                            return (
                                                <div
                                                    key={m}
                                                    title={`${m}: ${cnt}건`}
                                                    style={{
                                                        width: `${pct}%`,
                                                        background:
                                                            METHOD_COLORS[m],
                                                        transition:
                                                            "width 0.3s",
                                                        flexShrink: 0,
                                                    }}
                                                />
                                            );
                                        })}
                                    </div>

                                    {/* 총 수 */}
                                    <div
                                        style={{
                                            width: 36,
                                            textAlign: "right",
                                            fontWeight: 800,
                                            fontSize: 14,
                                            color: "#15803d",
                                            flexShrink: 0,
                                        }}
                                    >
                                        {d.total}
                                    </div>
                                </div>
                            ))}
                    </div>
                </div>
            )}

            {/* ── CS팀 등록 통계 ── */}
            {csMembers.length > 0 && (
                <div
                    style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 12,
                        overflow: "hidden",
                        marginBottom: 20,
                    }}
                >
                    <div
                        style={{
                            padding: "14px 20px",
                            borderBottom: "1px solid #f3f4f6",
                            display: "flex",
                            alignItems: "center",
                            gap: 10,
                        }}
                    >
                        <span
                            style={{
                                fontWeight: 700,
                                fontSize: 14,
                                color: "#111827",
                            }}
                        >
                            CS팀 개인별 등록 현황
                        </span>
                        <span
                            style={{
                                padding: "2px 8px",
                                borderRadius: 99,
                                background: "#eff6ff",
                                color: "#1d4ed8",
                                fontWeight: 700,
                                fontSize: 11,
                                border: "1px solid #bfdbfe",
                            }}
                        >
                            접수일 기준
                        </span>
                        <span
                            style={{
                                marginLeft: "auto",
                                fontSize: 12,
                                color: "#9ca3af",
                            }}
                        >
                            합계{" "}
                            {loading
                                ? "—"
                                : csStats.reduce((s, c) => s + c.total, 0)}
                            건
                        </span>
                    </div>
                    <div style={{ overflowX: "auto" }}>
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                            }}
                        >
                            <thead>
                                <tr>
                                    <th
                                        style={{
                                            ...thStyle,
                                            textAlign: "left",
                                            paddingLeft: 20,
                                        }}
                                    >
                                        CS팀
                                    </th>
                                    <th
                                        style={{
                                            ...thStyle,
                                            width: 80,
                                            color: "#1d4ed8",
                                        }}
                                    >
                                        등록
                                    </th>
                                </tr>
                            </thead>
                            <tbody>
                                {loading ? (
                                    <tr>
                                        <td
                                            colSpan={2}
                                            style={{
                                                ...tdStyle,
                                                color: "#d1d5db",
                                                textAlign: "center",
                                            }}
                                        >
                                            로딩 중...
                                        </td>
                                    </tr>
                                ) : csStats.length === 0 ||
                                  csStats.every((c) => c.total === 0) ? (
                                    <tr>
                                        <td
                                            colSpan={2}
                                            style={{
                                                ...tdStyle,
                                                color: "#9ca3af",
                                                textAlign: "center",
                                                padding: "20px",
                                            }}
                                        >
                                            이 기간에 등록된 작업이 없습니다.
                                        </td>
                                    </tr>
                                ) : (
                                    <>
                                        {csStats.map((c, i) => (
                                            <tr
                                                key={c.id}
                                                style={{
                                                    borderTop:
                                                        "1px solid #f3f4f6",
                                                    background:
                                                        i % 2 === 0
                                                            ? "#fff"
                                                            : "#fafafa",
                                                }}
                                            >
                                                <td
                                                    style={{
                                                        ...tdStyle,
                                                        textAlign: "left",
                                                        paddingLeft: 20,
                                                        fontWeight: 600,
                                                    }}
                                                >
                                                    <div
                                                        style={{
                                                            display: "flex",
                                                            alignItems:
                                                                "center",
                                                            gap: 8,
                                                        }}
                                                    >
                                                        {c.avatar_url ? (
                                                            <img
                                                                src={
                                                                    c.avatar_url
                                                                }
                                                                style={{
                                                                    width: 22,
                                                                    height: 22,
                                                                    borderRadius:
                                                                        "50%",
                                                                    objectFit:
                                                                        "cover",
                                                                    flexShrink: 0,
                                                                }}
                                                                alt={c.name}
                                                            />
                                                        ) : (
                                                            <div
                                                                style={{
                                                                    width: 22,
                                                                    height: 22,
                                                                    borderRadius:
                                                                        "50%",
                                                                    background:
                                                                        "#dbeafe",
                                                                    display:
                                                                        "flex",
                                                                    alignItems:
                                                                        "center",
                                                                    justifyContent:
                                                                        "center",
                                                                    fontSize: 10,
                                                                    fontWeight: 700,
                                                                    color: "#1d4ed8",
                                                                    flexShrink: 0,
                                                                }}
                                                            >
                                                                {c.name[0]}
                                                            </div>
                                                        )}
                                                        {c.name}
                                                    </div>
                                                </td>
                                                <td
                                                    style={{
                                                        ...tdStyle,
                                                        fontWeight: 800,
                                                        color: "#1d4ed8",
                                                        fontSize: 15,
                                                    }}
                                                >
                                                    {c.total || "—"}
                                                </td>
                                            </tr>
                                        ))}
                                        {csStats.filter((c) => c.total > 0)
                                            .length > 1 && (
                                            <tr
                                                style={{
                                                    borderTop:
                                                        "2px solid #e5e7eb",
                                                    background: "#f0f7ff",
                                                }}
                                            >
                                                <td
                                                    style={{
                                                        ...tdStyle,
                                                        textAlign: "left",
                                                        paddingLeft: 20,
                                                        fontWeight: 700,
                                                        color: "#1d4ed8",
                                                    }}
                                                >
                                                    합계
                                                </td>
                                                <td
                                                    style={{
                                                        ...tdStyle,
                                                        fontWeight: 800,
                                                        color: "#1d4ed8",
                                                        fontSize: 15,
                                                    }}
                                                >
                                                    {csStats.reduce(
                                                        (s, c) => s + c.total,
                                                        0,
                                                    )}
                                                </td>
                                            </tr>
                                        )}
                                    </>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* 데이터 없음 */}
            {!loading && stats.completed === 0 && (
                <div
                    style={{
                        textAlign: "center",
                        padding: "60px 0",
                        color: "#9ca3af",
                    }}
                >
                    <div style={{ fontSize: 32, marginBottom: 10 }}>📊</div>
                    <div style={{ fontSize: 14 }}>
                        {periodLabel} 완료된 작업이 없습니다.
                    </div>
                </div>
            )}
        </div>
    );
}
