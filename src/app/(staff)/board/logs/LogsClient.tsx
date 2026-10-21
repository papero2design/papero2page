// src/app/(staff)/board/logs/LogsClient.tsx
// 변경 로그 — 관리자용 활동 피드.
//   위: 기간 안의 분류별 건수 카드 (누르면 그 분류만)
//   아래: 같은 순간의 변경을 묶은 이벤트를 날짜별(시간순) 또는 작업별로 보여준다.
// 필터는 URL 쿼리(from · to · cat · q · who · reason · view)에 담아 새로고침/공유해도 유지된다.
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    BarChart3,
    FilePlus2,
    CheckCircle2,
    UserCheck,
    Handshake,
    Printer,
    PencilLine,
    Trash2,
    ChevronDown,
    ChevronRight,
    List,
    LayoutList,
    type LucideIcon,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { TASK_SELECT, type TaskWithDesigner } from "@/types/database";
import { TaskDetailModal, getTaskLocation } from "../BoardTable";
import { TableRowsSkeleton } from "@/lib/ui/Skeleton";
import { FIELD_LABELS, formatLogChange } from "@/lib/tasks/logFormat";
import {
    CATEGORIES,
    CATEGORY_MAP,
    categoryCond,
    groupEvents,
    describeEvent,
    type CategoryKey,
    type LogEvent,
    type LogRow,
} from "./logEvents";

const BATCH = 100;
const DEFAULT_DAYS = 7;
const RANGES = [
    { label: "오늘", days: 1 },
    { label: "7일", days: 7 },
    { label: "30일", days: 30 },
    { label: "90일", days: 90 },
];

const CATEGORY_ICON: Record<CategoryKey, LucideIcon> = {
    created: FilePlus2,
    complete: CheckCircle2,
    assign: UserCheck,
    outsourcing: Handshake,
    print: Printer,
    edit: PencilLine,
    trash: Trash2,
};

// ── 날짜 헬퍼 (YYYY-MM-DD, 로컬 기준) ──────────────────────────
function ymd(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function daysAgo(n: number) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return ymd(d);
}
function fmtTime(iso: string) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function fmtMonthDay(iso: string) {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
}
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];
function dayLabel(day: string) {
    const d = new Date(`${day}T00:00:00`);
    const base = `${d.getMonth() + 1}월 ${d.getDate()}일 (${WEEKDAY[d.getDay()]})`;
    if (day === ymd(new Date())) return `오늘 · ${base}`;
    if (day === daysAgo(1)) return `어제 · ${base}`;
    return base;
}

// ── 쿼리 필터 ─────────────────────────────────────────────────
type Filters = { start: string; end: string; who: string; reason: string; q: string; cats: CategoryKey[] };

// select 문자열마다 builder 제네릭이 달라서 필요한 메서드만 가진 모양으로 다룬다
type FilterLike = {
    gte(c: string, v: string): FilterLike;
    lt(c: string, v: string): FilterLike;
    eq(c: string, v: unknown): FilterLike;
    ilike(c: string, p: string): FilterLike;
    or(f: string): FilterLike;
};
function applyFilters<T>(builder: T, f: Filters, cats: CategoryKey[]): T {
    let b = (builder as unknown as FilterLike).gte("created_at", f.start).lt("created_at", f.end);
    if (f.who) b = b.eq("changed_by_name", f.who);
    if (f.reason) b = b.ilike("reason", `%${f.reason}%`);
    if (f.q) {
        const n = Number(f.q);
        b = Number.isInteger(n) && n > 0 ? b.eq("task.task_number", n) : b.ilike("task.customer_name", `%${f.q}%`);
    }
    if (cats.length) b = b.or(cats.map(categoryCond).join(","));
    return b as unknown as T;
}

export default function LogsClient() {
    const searchParams = useSearchParams();
    const router = useRouter();

    const from = searchParams.get("from") ?? daysAgo(DEFAULT_DAYS - 1);
    const to = searchParams.get("to") ?? ymd(new Date());
    const cat = searchParams.get("cat") ?? "";
    const who = (searchParams.get("who") ?? "").trim();
    const q = (searchParams.get("q") ?? "").trim();
    const reason = (searchParams.get("reason") ?? "").trim();
    const view = searchParams.get("view") === "task" ? "task" : "time";
    const cats = useMemo(
        () => (cat ? cat.split(",").filter((c): c is CategoryKey => c in CATEGORY_MAP) : []),
        [cat],
    );

    // 입력 중인 값 — "조회"를 눌러야 URL 에 반영된다
    // URL 이 바뀌면(뒤로가기 · 초기화) 렌더 중에 입력값을 다시 맞춘다
    const urlKey = `${from}|${to}|${q}|${who}|${reason}`;
    const [draft, setDraft] = useState({ from, to, q, who, reason });
    const [draftKey, setDraftKey] = useState(urlKey);
    if (draftKey !== urlKey) {
        setDraftKey(urlKey);
        setDraft({ from, to, q, who, reason });
    }

    const [rows, setRows] = useState<LogRow[]>([]);
    const [total, setTotal] = useState(0);
    const [counts, setCounts] = useState<Partial<Record<CategoryKey, number>>>({});
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [errMsg, setErrMsg] = useState<string | null>(null);
    const [allowed, setAllowed] = useState<boolean | null>(null);
    const [designers, setDesigners] = useState<{ id: string; name: string }[]>([]);
    const [people, setPeople] = useState<string[]>([]);
    const [modalTask, setModalTask] = useState<TaskWithDesigner | null>(null);

    // 관리자만 접근 (작업통계 → 변경로그 버튼으로 진입)
    useEffect(() => {
        const supabase = createClient();
        (async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;
            const [profileRes, designersRes, peopleRes] = await Promise.all([
                supabase.from("profiles").select("role").eq("id", user.id).single(),
                supabase.from("designers").select("id, name, is_active, user_id").order("name"),
                supabase.from("profiles").select("id, name"),
            ]);
            const role = profileRes.data?.role;
            const ok = role === "admin";
            setAllowed(ok);
            const ds = designersRes.data ?? [];
            const active = ds.filter((d) => d.is_active !== false);
            setDesigners(active.map(({ id, name }) => ({ id, name })));
            // 담당자 후보 — 활성 멤버만. 비활성 디자이너와 그 로그인 계정은 뺀다
            // (디자이너 행이 없는 관리자 계정은 그대로 둔다)
            const inactiveUserIds = new Set(
                ds.filter((d) => d.is_active === false && d.user_id).map((d) => d.user_id as string),
            );
            const names = new Set<string>();
            for (const p of peopleRes.data ?? []) if (p.name && !inactiveUserIds.has(p.id)) names.add(p.name);
            for (const d of active) if (d.name) names.add(d.name);
            setPeople([...names].sort((a, b) => a.localeCompare(b, "ko")));
            if (!ok) router.replace("/board");
        })();
    }, [router]);

    const filters = useMemo<Filters>(() => {
        const start = new Date(`${from}T00:00:00`);
        const end = new Date(`${to}T00:00:00`);
        end.setDate(end.getDate() + 1);
        return { start: start.toISOString(), end: end.toISOString(), who, reason, q, cats };
    }, [from, to, who, reason, q, cats]);

    const fetchRows = useCallback(
        async (offset: number) => {
            const supabase = createClient();
            // 작업 검색어가 있을 때만 inner join — 없으면 task 가 사라진 로그도 보인다
            const taskEmbed = filters.q ? `task:tasks!inner(${TASK_SELECT})` : `task:tasks(${TASK_SELECT})`;
            const base = supabase
                .from("task_logs")
                .select(
                    `id, task_id, changed_field, old_value, new_value, reason, changed_by_name, created_at, ${taskEmbed}`,
                    { count: "exact" },
                );
            const { data, count, error } = await applyFilters(base, filters, filters.cats)
                .order("created_at", { ascending: false })
                .range(offset, offset + BATCH - 1);
            if (error) throw new Error(error.message);
            return { data: (data ?? []) as unknown as LogRow[], count: count ?? 0 };
        },
        [filters],
    );

    // 분류별 건수 — 분류 선택과 무관하게 나머지 필터만 적용
    const fetchCounts = useCallback(async () => {
        const supabase = createClient();
        const sel = filters.q ? "id, task:tasks!inner(id)" : "id";
        const results = await Promise.all(
            CATEGORIES.map(async (c) => {
                const base = supabase.from("task_logs").select(sel, { count: "exact", head: true });
                const { count } = await applyFilters(base, filters, [c.key]);
                return [c.key, count ?? 0] as const;
            }),
        );
        return Object.fromEntries(results) as Record<CategoryKey, number>;
    }, [filters]);

    const load = useCallback(async () => {
        setLoading(true);
        setErrMsg(null);
        try {
            const [{ data, count }, c] = await Promise.all([fetchRows(0), fetchCounts()]);
            setRows(data);
            setTotal(count);
            setCounts(c);
        } catch (err) {
            setErrMsg((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [fetchRows, fetchCounts]);

    const loadMore = async () => {
        setLoadingMore(true);
        try {
            const { data } = await fetchRows(rows.length);
            setRows((prev) => [...prev, ...data]);
        } catch (err) {
            setErrMsg((err as Error).message);
        } finally {
            setLoadingMore(false);
        }
    };

    useEffect(() => {
        if (allowed) load();
    }, [allowed, load]);

    const events = useMemo(() => groupEvents(rows), [rows]);

    // ── URL 갱신 ──
    const push = (next: Partial<{ from: string; to: string; cat: string; q: string; who: string; reason: string; view: string }>) => {
        const v = { from, to, cat, q, who, reason, view, ...next };
        const params = new URLSearchParams();
        params.set("from", v.from);
        params.set("to", v.to);
        if (v.cat) params.set("cat", v.cat);
        if (v.q.trim()) params.set("q", v.q.trim());
        if (v.who) params.set("who", v.who);
        if (v.reason.trim()) params.set("reason", v.reason.trim());
        if (v.view === "task") params.set("view", "task");
        router.push(`/board/logs?${params.toString()}`);
    };
    const applyDraft = () => push({ ...draft });
    const toggleCat = (key: CategoryKey) => {
        const next = cats.includes(key) ? cats.filter((c) => c !== key) : [...cats, key];
        push({ cat: next.join(",") });
    };

    const today = ymd(new Date());
    const activeRange = to === today ? RANGES.find((r) => from === daysAgo(r.days - 1))?.days ?? null : null;
    const sumAll = CATEGORIES.reduce((s, c) => s + (counts[c.key] ?? 0), 0);
    const hasFilter = !!(cat || who || q || reason || searchParams.get("from") || searchParams.get("to"));

    if (allowed === null) return <TableRowsSkeleton rows={8} toolbar={false} />;
    if (!allowed) return null;

    return (
        <div style={{ maxWidth: 1260, margin: "0 auto", padding: "0 16px 40px" }}>
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
                    marginBottom: 20,
                }}
            >
                <div>
                    <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: "#111827" }}>변경 로그</h2>
                    <p style={{ margin: "3px 0 0", fontSize: 13, color: "#9ca3af" }}>
                        {from === to ? from : `${from} ~ ${to}`}
                    </p>
                </div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {RANGES.map((r) => (
                        <button
                            key={r.label}
                            onClick={() => push({ from: daysAgo(r.days - 1), to: today })}
                            style={pillBtn(activeRange === r.days)}
                        >
                            {r.label}
                        </button>
                    ))}
                    <button
                        onClick={() => router.push("/board/stats")}
                        style={{ ...pillBtn(false), display: "flex", alignItems: "center", gap: 5 }}
                    >
                        <BarChart3 size={13} />
                        작업통계
                    </button>
                </div>
            </div>

            {/* ── 분류별 건수 카드 ── */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(128px, 1fr))",
                    gap: 8,
                    marginBottom: 16,
                }}
            >
                <SummaryCard
                    label="전체"
                    hint="모든 활동"
                    count={sumAll}
                    active={cats.length === 0}
                    color="#111827"
                    bg="#fff"
                    border="#e5e7eb"
                    Icon={List}
                    loading={loading}
                    onClick={() => push({ cat: "" })}
                />
                {CATEGORIES.map((c) => (
                    <SummaryCard
                        key={c.key}
                        label={c.label}
                        hint={c.hint}
                        count={counts[c.key] ?? 0}
                        active={cats.includes(c.key)}
                        color={c.color}
                        bg={c.bg}
                        border={c.border}
                        Icon={CATEGORY_ICON[c.key]}
                        loading={loading}
                        onClick={() => toggleCat(c.key)}
                    />
                ))}
            </div>

            {/* ── 검색 바 ── */}
            <form
                onSubmit={(e) => {
                    e.preventDefault();
                    applyDraft();
                }}
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    alignItems: "center",
                    gap: 8,
                    marginBottom: 20,
                }}
            >
                <input
                    type="text"
                    placeholder="고객이름 또는 작업번호"
                    value={draft.q}
                    onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))}
                    style={{ ...input, width: 180 }}
                />
                <select
                    value={draft.who}
                    onChange={(e) => push({ ...draft, who: e.target.value })}
                    style={{ ...input, width: 130, color: draft.who ? "#111827" : "#9ca3af" }}
                >
                    <option value="">담당자 전체</option>
                    {people.map((n) => (
                        <option key={n} value={n}>
                            {n}
                        </option>
                    ))}
                </select>
                <input
                    type="text"
                    placeholder="사유"
                    value={draft.reason}
                    onChange={(e) => setDraft((d) => ({ ...d, reason: e.target.value }))}
                    style={{ ...input, width: 140 }}
                />
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                    <input
                        type="date"
                        value={draft.from}
                        max={draft.to}
                        onChange={(e) => setDraft((d) => ({ ...d, from: e.target.value }))}
                        style={input}
                    />
                    <span style={{ color: "#9ca3af" }}>~</span>
                    <input
                        type="date"
                        value={draft.to}
                        min={draft.from}
                        onChange={(e) => setDraft((d) => ({ ...d, to: e.target.value }))}
                        style={input}
                    />
                </span>
                <button type="submit" style={btn(true)}>
                    조회
                </button>
                {hasFilter && (
                    <button type="button" onClick={() => router.push("/board/logs")} style={btn(false)}>
                        초기화
                    </button>
                )}

                {/* 보기 전환 */}
                <div
                    style={{
                        marginLeft: "auto",
                        display: "inline-flex",
                        border: "1px solid #e5e7eb",
                        borderRadius: 99,
                        padding: 2,
                        background: "#fff",
                    }}
                >
                    {[
                        { key: "time", label: "시간순", Icon: List },
                        { key: "task", label: "작업별", Icon: LayoutList },
                    ].map(({ key, label, Icon }) => (
                        <button
                            key={key}
                            type="button"
                            onClick={() => push({ view: key })}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 4,
                                padding: "4px 12px",
                                borderRadius: 99,
                                border: "none",
                                background: view === key ? "#111827" : "transparent",
                                color: view === key ? "#fff" : "#6b7280",
                                fontWeight: 600,
                                fontSize: 13,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            <Icon size={13} />
                            {label}
                        </button>
                    ))}
                </div>
            </form>

            {modalTask && (
                <TaskDetailModal
                    task={modalTask}
                    onClose={() => setModalTask(null)}
                    onDeleted={() => {
                        setModalTask(null);
                        load();
                    }}
                    designers={designers}
                    canEditDesigner
                    onMutate={load}
                />
            )}

            {/* ── 목록 ── */}
            {errMsg ? (
                <div style={{ padding: "16px 0", color: "#dc2626" }}>
                    ⚠ 로그 조회 실패: {errMsg}
                    <button onClick={load} style={{ ...btn(false), marginLeft: 10 }}>
                        다시 시도
                    </button>
                </div>
            ) : loading ? (
                <TableRowsSkeleton rows={8} toolbar={false} bare />
            ) : events.length === 0 ? (
                <div
                    style={{
                        textAlign: "center",
                        padding: "60px 0",
                        color: "#9ca3af",
                        border: "1px dashed #e5e7eb",
                        borderRadius: 12,
                    }}
                >
                    <p style={{ margin: 0, fontWeight: 600 }}>이 기간에 해당하는 활동이 없습니다</p>
                    <p style={{ margin: "4px 0 0", color: "#d1d5db" }}>기간을 넓히거나 필터를 초기화해 보세요</p>
                </div>
            ) : (
                <>
                    {view === "time" ? (
                        <TimelineView events={events} onOpen={setModalTask} />
                    ) : (
                        <TaskView events={events} onOpen={setModalTask} />
                    )}

                    <div style={{ textAlign: "center", marginTop: 20, color: "#9ca3af", fontSize: 13 }}>
                        {rows.length < total ? (
                            <button onClick={loadMore} disabled={loadingMore} style={btn(false)}>
                                {loadingMore ? "불러오는 중…" : `더 보기 (${(total - rows.length).toLocaleString()}건 남음)`}
                            </button>
                        ) : (
                            <span>기록 {total.toLocaleString()}건을 모두 불러왔습니다</span>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 분류 카드
// ─────────────────────────────────────────────────────────────

function SummaryCard({
    label,
    hint,
    count,
    active,
    color,
    bg,
    border,
    Icon,
    loading,
    onClick,
}: {
    label: string;
    hint: string;
    count: number;
    active: boolean;
    color: string;
    bg: string;
    border: string;
    Icon: LucideIcon;
    loading: boolean;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            title={hint}
            style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-start",
                gap: 6,
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${active ? color : "#e5e7eb"}`,
                boxShadow: active ? `0 0 0 1px ${color}` : "none",
                background: active ? bg : "#fff",
                cursor: "pointer",
                fontFamily: "inherit",
                textAlign: "left",
                transition: "all 0.15s",
            }}
        >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color, fontWeight: 700, fontSize: 13 }}>
                <span
                    style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        width: 22,
                        height: 22,
                        borderRadius: 99,
                        background: bg,
                        border: `1px solid ${border}`,
                    }}
                >
                    <Icon size={12} />
                </span>
                {label}
            </span>
            <span style={{ fontSize: 22, fontWeight: 800, color: "#111827", lineHeight: 1 }}>
                {loading ? "·" : count.toLocaleString()}
            </span>
        </button>
    );
}

// ─────────────────────────────────────────────────────────────
// 시간순 — 날짜 구분선 + 이벤트
// ─────────────────────────────────────────────────────────────

function TimelineView({ events, onOpen }: { events: LogEvent[]; onOpen: (t: TaskWithDesigner) => void }) {
    const days = useMemo(() => {
        const map = new Map<string, LogEvent[]>();
        for (const ev of events) {
            const day = ymd(new Date(ev.at));
            if (!map.has(day)) map.set(day, []);
            map.get(day)!.push(ev);
        }
        return [...map.entries()];
    }, [events]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            {days.map(([day, list]) => (
                <section key={day}>
                    <div
                        style={{
                            display: "flex",
                            alignItems: "baseline",
                            gap: 8,
                            padding: "0 4px 8px",
                            position: "sticky",
                            top: 0,
                            background: "#fff",
                            zIndex: 1,
                        }}
                    >
                        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: "#111827" }}>{dayLabel(day)}</h3>
                        <span style={{ fontSize: 12, color: "#9ca3af" }}>{list.length}건</span>
                    </div>
                    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}>
                        {list.map((ev, i) => (
                            <EventRow key={ev.id} ev={ev} first={i === 0} showTask onOpen={onOpen} />
                        ))}
                    </div>
                </section>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 작업별 — 작업 한 건이 거쳐 온 과정
// ─────────────────────────────────────────────────────────────

function TaskView({ events, onOpen }: { events: LogEvent[]; onOpen: (t: TaskWithDesigner) => void }) {
    const groups = useMemo(() => {
        const map = new Map<string, LogEvent[]>();
        for (const ev of events) {
            const key = ev.taskId ?? `none-${ev.id}`;
            if (!map.has(key)) map.set(key, []);
            map.get(key)!.push(ev);
        }
        return [...map.entries()];
    }, [events]);

    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 380px), 1fr))",
                gap: 12,
                alignItems: "start",
            }}
        >
            {groups.map(([key, list]) => {
                const task = list[0].task;
                const loc = task ? getTaskLocation(task) : null;
                return (
                    <section
                        key={key}
                        style={{ border: "1px solid #e5e7eb", borderRadius: 12, overflow: "hidden", background: "#fff" }}
                    >
                        <button
                            type="button"
                            onClick={() => task && onOpen(task)}
                            disabled={!task}
                            style={{
                                width: "100%",
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                padding: "12px 14px",
                                background: "#f9fafb",
                                border: "none",
                                borderBottom: "1px solid #e5e7eb",
                                cursor: task ? "pointer" : "default",
                                fontFamily: "inherit",
                                textAlign: "left",
                            }}
                        >
                            <span style={{ fontWeight: 800, color: task ? "#111827" : "#9ca3af", fontSize: 15 }}>
                                {task?.customer_name ?? "삭제된 작업"}
                            </span>
                            {task?.task_number != null && (
                                <span style={{ color: "#9ca3af", fontSize: 12 }}>#{task.task_number}</span>
                            )}
                            <span
                                style={{
                                    color: "#6b7280",
                                    fontSize: 12,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                    minWidth: 0,
                                    flex: 1,
                                }}
                            >
                                {task?.print_items ?? ""}
                            </span>
                            {loc && <LocationBadge loc={loc} />}
                            {task && <ChevronRight size={14} color="#9ca3af" />}
                        </button>
                        {list.map((ev, i) => (
                            <EventRow key={ev.id} ev={ev} first={i === 0} showDate onOpen={onOpen} />
                        ))}
                    </section>
                );
            })}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 이벤트 한 줄
// ─────────────────────────────────────────────────────────────

function EventRow({
    ev,
    first,
    showTask = false,
    showDate = false,
    onOpen,
}: {
    ev: LogEvent;
    first: boolean;
    showTask?: boolean;
    showDate?: boolean;
    onOpen: (t: TaskWithDesigner) => void;
}) {
    const [open, setOpen] = useState(false);
    const { phrases, edits, reasons } = describeEvent(ev);
    const c = CATEGORY_MAP[ev.category];
    const Icon = CATEGORY_ICON[ev.category];
    const task = ev.task;
    const clickable = showTask && !!task;

    return (
        <div
            onClick={clickable ? () => onOpen(task!) : undefined}
            style={{
                display: "flex",
                alignItems: "flex-start",
                flexWrap: "wrap",
                gap: 12,
                padding: "12px 14px",
                borderTop: first ? "none" : "1px solid #f3f4f6",
                cursor: clickable ? "pointer" : "default",
            }}
            onMouseEnter={(e) => {
                if (clickable) e.currentTarget.style.background = "#fafafa";
            }}
            onMouseLeave={(e) => {
                e.currentTarget.style.background = "";
            }}
        >
            {/* 시각 */}
            <div
                style={{
                    width: showDate ? 74 : 40,
                    flexShrink: 0,
                    paddingTop: 4,
                    color: "#9ca3af",
                    fontSize: 12,
                    fontVariantNumeric: "tabular-nums",
                }}
            >
                {showDate && `${fmtMonthDay(ev.at)} `}
                {fmtTime(ev.at)}
            </div>

            {/* 분류 아이콘 */}
            <span
                title={c.label}
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 26,
                    height: 26,
                    flexShrink: 0,
                    borderRadius: 99,
                    background: c.bg,
                    border: `1px solid ${c.border}`,
                    color: c.color,
                }}
            >
                <Icon size={13} />
            </span>

            {/* 내용 */}
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
                <div style={{ color: "#111827", fontSize: 14, lineHeight: 1.5, wordBreak: "keep-all" }}>
                    {phrases.map((p, i) => (
                        <span key={p}>
                            {i > 0 && <span style={{ color: "#d1d5db", margin: "0 6px" }}>·</span>}
                            <span style={{ fontWeight: i === 0 ? 700 : 500 }}>{p}</span>
                        </span>
                    ))}
                </div>
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        alignItems: "center",
                        gap: 6,
                        marginTop: 2,
                        fontSize: 12,
                        color: "#6b7280",
                    }}
                >
                    <span style={{ fontWeight: 600, color: ev.actor ? "#374151" : "#d1d5db" }}>
                        {ev.actor ?? "알 수 없음"}
                    </span>
                    {reasons.map((r) => (
                        <span key={r}>· “{r}”</span>
                    ))}
                    {edits.length > 0 && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                setOpen((v) => !v);
                            }}
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 2,
                                padding: "0 6px",
                                border: "1px solid #e5e7eb",
                                borderRadius: 99,
                                background: "#fff",
                                color: "#6b7280",
                                fontSize: 11,
                                fontWeight: 600,
                                cursor: "pointer",
                                fontFamily: "inherit",
                            }}
                        >
                            변경 내용
                            <ChevronDown
                                size={11}
                                style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s" }}
                            />
                        </button>
                    )}
                </div>

                {open && edits.length > 0 && (
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            marginTop: 8,
                            padding: "8px 10px",
                            background: "#f9fafb",
                            borderRadius: 8,
                            display: "grid",
                            gridTemplateColumns: "auto 1fr",
                            columnGap: 12,
                            rowGap: 4,
                            fontSize: 12,
                        }}
                    >
                        {edits.map((l) => {
                            const ch = formatLogChange(l.changed_field, l.old_value, l.new_value);
                            return (
                                <EditLine
                                    key={l.id}
                                    label={FIELD_LABELS[l.changed_field] ?? l.changed_field}
                                    from={ch.from}
                                    to={ch.to}
                                />
                            );
                        })}
                    </div>
                )}
            </div>

            {/* 작업 */}
            {showTask && (
                <div
                    style={{
                        marginLeft: "auto",
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        paddingTop: 2,
                        justifyContent: "flex-end",
                        flexWrap: "wrap",
                    }}
                >
                    {task ? (
                        <>
                            <span style={{ fontWeight: 700, color: "#111827", fontSize: 13 }}>{task.customer_name}</span>
                            {task.task_number != null && (
                                <span style={{ color: "#9ca3af", fontSize: 12 }}>#{task.task_number}</span>
                            )}
                            <LocationBadge loc={getTaskLocation(task)} />
                        </>
                    ) : (
                        <span style={{ color: "#d1d5db", fontSize: 12 }}>삭제된 작업</span>
                    )}
                </div>
            )}
        </div>
    );
}

function EditLine({
    label,
    from,
    to,
}: {
    label: string;
    from: { text: string; empty: boolean } | null;
    to: { text: string; empty: boolean } | null;
}) {
    return (
        <>
            <span style={{ color: "#6b7280", fontWeight: 600, whiteSpace: "nowrap" }}>{label}</span>
            <span style={{ minWidth: 0, wordBreak: "break-all" }}>
                {from && (
                    <>
                        <span
                            style={{
                                color: from.empty ? "#d1d5db" : "#9ca3af",
                                textDecoration: from.empty ? "none" : "line-through",
                                fontStyle: from.empty ? "italic" : "normal",
                            }}
                        >
                            {from.text}
                        </span>
                        <span style={{ color: "#d1d5db", margin: "0 6px" }}>→</span>
                    </>
                )}
                {to && (
                    <span
                        style={{
                            color: to.empty ? "#d1d5db" : "#111827",
                            fontWeight: 600,
                            fontStyle: to.empty ? "italic" : "normal",
                        }}
                    >
                        {to.text}
                    </span>
                )}
            </span>
        </>
    );
}

/** 작업의 현재 위치 (BoardTable getTaskLocation 과 같은 색) */
function LocationBadge({ loc }: { loc: { label: string; bg: string; color: string; border: string } }) {
    return (
        <span
            style={{
                padding: "1px 7px",
                borderRadius: 99,
                background: loc.bg,
                color: loc.color,
                border: `1px solid ${loc.border}`,
                fontSize: 11,
                fontWeight: 700,
                whiteSpace: "nowrap",
            }}
        >
            {loc.label}
        </span>
    );
}

const input: React.CSSProperties = {
    height: 34,
    padding: "0 10px",
    border: "1px solid #e5e7eb",
    borderRadius: 8,
    background: "#fff",
    color: "#111827",
    fontFamily: "inherit",
};
const btn = (primary: boolean): React.CSSProperties => ({
    height: 34,
    padding: "0 16px",
    fontWeight: 600,
    border: "1px solid",
    borderColor: primary ? "#111827" : "#e5e7eb",
    borderRadius: 8,
    cursor: "pointer",
    background: primary ? "#111827" : "#fff",
    color: primary ? "#fff" : "#374151",
    fontFamily: "inherit",
});
// 작업통계 헤더의 모드 버튼과 같은 모양
const pillBtn = (active: boolean): React.CSSProperties => ({
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
});
