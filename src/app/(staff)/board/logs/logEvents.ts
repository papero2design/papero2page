// ─────────────────────────────────────────────────────────────
// logEvents.ts — 변경 로그 페이지 전용: 분류 · 묶기 · 문장 만들기
//
// task_logs 한 줄 = 칸 하나의 변경이라, 한 번 저장하면 여러 줄이 생긴다.
// 관리자가 읽기 쉽게 "같은 사람 · 같은 작업 · 같은 순간" 의 줄을 이벤트 하나로 묶고
// 각 줄을 짧은 동작 문구("김디자이너에게 배정", "완료 처리")로 바꾼다.
// ─────────────────────────────────────────────────────────────

import { FIELD_LABELS, formatLogChange, logFieldKey } from "@/lib/tasks/logFormat";
import type { TaskWithDesigner } from "@/types/database";

export type LogRow = {
    id: string;
    task_id: string | null;
    changed_field: string;
    old_value: string | null;
    new_value: string | null;
    reason: string | null;
    changed_by_name: string | null;
    created_at: string;
    task: TaskWithDesigner | null;
};

// ── 분류 ─────────────────────────────────────────────────────

export type CategoryKey = "created" | "complete" | "assign" | "outsourcing" | "print" | "edit" | "trash";

export const CATEGORIES: {
    key: CategoryKey;
    label: string;
    hint: string;
    color: string;
    bg: string;
    border: string;
    fields?: string[];
}[] = [
    { key: "created", label: "등록", hint: "새로 등록된 작업", color: "#0369a1", bg: "#f0f9ff", border: "#bae6fd" },
    { key: "complete", label: "완료", hint: "완료 처리 · 완료 취소", color: "#15803d", bg: "#f0fdf4", border: "#bbf7d0" },
    {
        key: "assign",
        label: "배정",
        hint: "디자이너 배정 · 직접 가져감 · 우선작업",
        color: "#1d4ed8",
        bg: "#eff6ff",
        border: "#bfdbfe",
        fields: ["assigned_designer", "is_priority"],
    },
    {
        key: "outsourcing",
        label: "외주",
        hint: "외주 공개 · 진행단계 · 단가 · 정산",
        color: "#a21caf",
        bg: "#faf5ff",
        border: "#e9d5ff",
        fields: ["outsourcing_open", "outsourcing_price", "outsourcing_status", "outsourcing_settled_at"],
    },
    {
        key: "print",
        label: "인쇄 접수",
        hint: "인쇄 접수완료 · 해제",
        color: "#b45309",
        bg: "#fffbeb",
        border: "#fde68a",
        fields: ["print_received_at"],
    },
    {
        key: "edit",
        label: "내용 수정",
        hint: "고객이름 · 인쇄항목 · 후가공 등 주문 내용",
        color: "#374151",
        bg: "#f9fafb",
        border: "#e5e7eb",
        fields: [
            "order_source", "customer_name", "order_method", "order_method_note", "print_items",
            "post_processing", "consult_path", "special_details", "registered_by",
        ],
    },
    {
        key: "trash",
        label: "휴지통",
        hint: "휴지통 이동 · 복구",
        color: "#dc2626",
        bg: "#fef2f2",
        border: "#fecaca",
        fields: ["deleted", "restored"],
    },
];

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.key, c])) as Record<
    CategoryKey,
    (typeof CATEGORIES)[number]
>;

/** PostgREST or() 조각 — 작업 등록 / 완료는 둘 다 changed_field = status 라 이전값 유무로 나눈다 */
export function categoryCond(key: CategoryKey): string {
    if (key === "created") return "and(changed_field.eq.status,old_value.is.null)";
    if (key === "complete") return "and(changed_field.eq.status,old_value.not.is.null)";
    return `changed_field.in.(${CATEGORY_MAP[key].fields!.join(",")})`;
}

/** 라벨 없는 필드(구 DB 등)는 내용 수정으로 본다 */
export function categoryOf(log: Pick<LogRow, "changed_field" | "old_value">): CategoryKey {
    const key = logFieldKey(log.changed_field, log.old_value);
    if (key === "created") return "created";
    if (key === "status") return "complete";
    return CATEGORIES.find((c) => c.fields?.includes(key))?.key ?? "edit";
}

// ── 이벤트로 묶기 ─────────────────────────────────────────────

export type LogEvent = {
    id: string;
    taskId: string | null;
    task: TaskWithDesigner | null;
    actor: string | null;
    at: string;
    category: CategoryKey;
    logs: LogRow[];
};

/** 한 번 저장할 때 같이 남는 줄들은 수 ms 차이 — 넉넉히 3초 안이면 같은 이벤트 */
const SAME_EVENT_MS = 3000;

/** 대표 분류 — 여러 종류가 섞이면 더 중요한 쪽 색/아이콘을 쓴다 */
const CATEGORY_PRIORITY: CategoryKey[] = ["created", "complete", "trash", "outsourcing", "assign", "print", "edit"];

export function groupEvents(rows: LogRow[]): LogEvent[] {
    const events: LogEvent[] = [];
    for (const row of rows) {
        const last = events[events.length - 1];
        if (
            last &&
            last.taskId === row.task_id &&
            last.actor === row.changed_by_name &&
            Math.abs(new Date(last.logs[last.logs.length - 1].created_at).getTime() - new Date(row.created_at).getTime()) <
                SAME_EVENT_MS
        ) {
            last.logs.push(row);
            continue;
        }
        events.push({
            id: row.id,
            taskId: row.task_id,
            task: row.task,
            actor: row.changed_by_name,
            at: row.created_at,
            category: categoryOf(row),
            logs: [row],
        });
    }
    for (const ev of events) {
        const cats = new Set(ev.logs.map(categoryOf));
        ev.category = CATEGORY_PRIORITY.find((c) => cats.has(c)) ?? "edit";
    }
    return events;
}

// ── 문장 만들기 ───────────────────────────────────────────────

/** 동작 문구로 이미 드러나는 자동 사유 — 화면에서 반복하지 않는다 */
const AUTO_REASONS = new Set([
    "작업 등록",
    "작업 등록 시 배정",
    "우선작업 등록",
    "우선작업 해제",
    "단가 수정",
    "외주 검수 승인",
    "외주 배정 해제",
    "인쇄 접수완료",
    "인쇄 접수완료 해제",
    "외주 작업자가 직접 가져감",
]);

/** 로그 한 줄 → 동작 문구. 내용 수정 항목은 null (이벤트에서 모아서 표시) */
export function describeLog(log: LogRow): string | null {
    const { old_value: o, new_value: n } = log;
    switch (logFieldKey(log.changed_field, o)) {
        case "created":
            return "작업 등록";
        case "status":
            if (n === "완료") return "완료 처리";
            if (o === "완료") return "완료 취소";
            return `완료 상태 ${o ?? "—"} → ${n ?? "—"}`;
        case "assigned_designer":
            if (!n) return o ? `${o} 배정 해제` : "배정 해제";
            // 변경한 사람 = 새 담당 → 본인이 가져간 것 (이름 기준)
            if (log.changed_by_name && log.changed_by_name === n) return o ? `${o}에게서 직접 가져감` : "직접 가져감";
            return o ? `담당 변경 ${o} → ${n}` : `${n}에게 배정`;
        case "is_priority":
            return n === "true" ? "우선작업 지정" : "우선작업 해제";
        case "print_received_at":
            return n ? "인쇄 접수완료" : "인쇄 접수 해제";
        case "outsourcing_open":
            if (n === "공개") return "외주로 공개";
            if (n === "사내") return "사내 작업으로 전환";
            return `외주 맡김 ${o ?? "—"} → ${n ?? "—"}`;
        case "outsourcing_price": {
            const c = formatLogChange(log.changed_field, o, n);
            return `외주 단가 ${c.from?.text ?? "없음"} → ${c.to?.text ?? "없음"}`;
        }
        case "outsourcing_status":
            if (n === "작업 중" && o === "작업 대기") return "외주 작업자가 가져감";
            if (n === "검수 요청") return "외주 검수 요청";
            if (n === "수정 요청") return "외주 수정 요청";
            if (n === "고객 확인중") return "고객 확인 요청";
            if (n === "완료") return "외주 검수 승인";
            if (n === "작업 대기") return "외주 배정 해제";
            return `외주 ${o ?? "—"} → ${n ?? "—"}`;
        case "outsourcing_settled_at":
            return n ? "외주 정산 완료" : "외주 정산 해제";
        case "deleted":
            return "휴지통으로 이동";
        case "restored":
            return "휴지통에서 복구";
        default:
            return null;
    }
}

export function describeEvent(ev: LogEvent): { phrases: string[]; edits: LogRow[]; reasons: string[] } {
    const phrases: string[] = [];
    const edits: LogRow[] = [];
    for (const log of ev.logs) {
        const p = describeLog(log);
        if (p === null) edits.push(log);
        else if (!phrases.includes(p)) phrases.push(p);
    }
    if (edits.length) {
        const labels = [...new Set(edits.map((l) => FIELD_LABELS[l.changed_field] ?? l.changed_field))];
        phrases.push(`내용 수정 · ${labels.join(", ")}`);
    }
    const reasons = [
        ...new Set(ev.logs.map((l) => l.reason?.trim()).filter((r): r is string => !!r && !AUTO_REASONS.has(r))),
    ];
    return { phrases, edits, reasons };
}
