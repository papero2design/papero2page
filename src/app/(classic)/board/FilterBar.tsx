// src/app/(classic)/board/FilterBar.tsx
"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback } from "react";

const STATUSES = ["대기중", "진행중", "검수대기"];
const ORDER_METHODS = [
    "샘플디자인 의뢰",
    "재주문(글자수정)",
    "인쇄만",
    "재주문(수정X)",
    "디자인 복원",
    "신규 디자인",
    "디자인 수정",
    "기타",
];
const ORDER_SOURCES = ["홈페이지", "스토어팜"];
const POST_PROCESSINGS = ["없음", "단면박", "양면박", "귀도리", "기타"];
const CONSULT_PATHS = ["네이버톡톡", "카카오톡채널", "메일", "없음"];

interface Props {
    designers: { id: string; name: string }[];
    currentStatus: string;
    currentDesigner: string;
    currentMethod: string;
    currentSource: string;
    currentPrint: string;
    currentPost: string;
    currentConsult: string;
    currentDateFrom: string;
    currentDateTo: string;
}

export default function FilterBar({
    designers,
    currentStatus,
    currentDesigner,
    currentMethod,
    currentSource,
    currentPrint,
    currentPost,
    currentConsult,
    currentDateFrom,
    currentDateTo,
}: Props) {
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const setParam = useCallback(
        (key: string, value: string) => {
            const params = new URLSearchParams(searchParams.toString());
            if (value) params.set(key, value);
            else params.delete(key);
            params.delete("page");
            router.push(`${pathname}?${params.toString()}`);
        },
        [router, pathname, searchParams],
    );

    const clearAll = useCallback(() => {
        const params = new URLSearchParams(searchParams.toString());
        [
            "status",
            "designer",
            "method",
            "source",
            "print",
            "post",
            "consult",
            "dateFrom",
            "dateTo",
        ].forEach((k) => params.delete(k));
        params.delete("page");
        router.push(`${pathname}?${params.toString()}`);
    }, [router, pathname, searchParams]);

    const active = [
        currentStatus,
        currentDesigner,
        currentMethod,
        currentSource,
        currentPrint,
        currentPost,
        currentConsult,
        currentDateFrom,
        currentDateTo,
    ].filter(Boolean);
    const hasFilter = active.length > 0;

    return (
        <div style={{ marginBottom: 12 }}>
            {/* 필터 행 */}
            <div
                style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 6,
                    alignItems: "center",
                    padding: "8px 0",
                }}
            >
                <Sel
                    value={currentStatus}
                    onChange={(v) => setParam("status", v)}
                    placeholder="상태"
                    options={STATUSES.map((s) => ({ value: s, label: s }))}
                />
                <Sel
                    value={currentDesigner}
                    onChange={(v) => setParam("designer", v)}
                    placeholder="담당 디자이너"
                    options={designers.map((d) => ({
                        value: d.id,
                        label: d.name,
                    }))}
                />
                <Sel
                    value={currentMethod}
                    onChange={(v) => setParam("method", v)}
                    placeholder="주문방법"
                    options={ORDER_METHODS.map((m) => ({ value: m, label: m }))}
                />
                <Sel
                    value={currentSource}
                    onChange={(v) => setParam("source", v)}
                    placeholder="주문경로"
                    options={ORDER_SOURCES.map((s) => ({ value: s, label: s }))}
                />
                <Sel
                    value={currentPost}
                    onChange={(v) => setParam("post", v)}
                    placeholder="후가공"
                    options={POST_PROCESSINGS.map((p) => ({
                        value: p,
                        label: p,
                    }))}
                />
                <Sel
                    value={currentConsult}
                    onChange={(v) => setParam("consult", v)}
                    placeholder="상담경로"
                    options={CONSULT_PATHS.map((c) => ({ value: c, label: c }))}
                />

                {/* 인쇄항목 텍스트 검색 */}
                <input
                    value={currentPrint}
                    onChange={(e) => setParam("print", e.target.value)}
                    placeholder="인쇄항목 검색"
                    style={{
                        padding: "5px 10px",
                        border: `1px solid ${currentPrint ? "#1ED67D" : "#e5e7eb"}`,
                        borderRadius: 6,
                        background: currentPrint ? "#f0fdf4" : "#fff",
                        color: currentPrint ? "#15803d" : "#6b7280",
                        outline: "none",
                        fontFamily: "inherit",
                        width: 120,
                    }}
                />

                {/* 날짜 범위 */}
                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                    <input
                        type="date"
                        value={currentDateFrom}
                        onChange={(e) => setParam("dateFrom", e.target.value)}
                        style={dateInput(!!currentDateFrom)}
                        title="시작일"
                    />
                    <span style={{ color: "#9ca3af" }}>~</span>
                    <input
                        type="date"
                        value={currentDateTo}
                        onChange={(e) => setParam("dateTo", e.target.value)}
                        style={dateInput(!!currentDateTo)}
                        title="종료일"
                    />
                </div>

                {hasFilter && (
                    <button
                        onClick={clearAll}
                        style={{
                            padding: "4px 10px",
                            border: "1px solid #fecaca",
                            borderRadius: 6,
                            background: "#fff",
                            color: "#ef4444",
                            cursor: "pointer",
                            fontWeight: 600,
                            fontFamily: "inherit",
                        }}
                    >
                        초기화 ✕
                    </button>
                )}
            </div>

            {/* 활성 필터 뱃지 */}
            {hasFilter && (
                <div
                    style={{
                        display: "flex",
                        gap: 4,
                        flexWrap: "wrap",
                        paddingBottom: 6,
                    }}
                >
                    {currentStatus && (
                        <Badge
                            label={`상태: ${currentStatus}`}
                            onRemove={() => setParam("status", "")}
                        />
                    )}
                    {currentDesigner && (
                        <Badge
                            label={`디자이너: ${designers.find((d) => d.id === currentDesigner)?.name ?? currentDesigner}`}
                            onRemove={() => setParam("designer", "")}
                        />
                    )}
                    {currentMethod && (
                        <Badge
                            label={`주문방법: ${currentMethod}`}
                            onRemove={() => setParam("method", "")}
                        />
                    )}
                    {currentSource && (
                        <Badge
                            label={`주문경로: ${currentSource}`}
                            onRemove={() => setParam("source", "")}
                        />
                    )}
                    {currentPrint && (
                        <Badge
                            label={`인쇄항목: ${currentPrint}`}
                            onRemove={() => setParam("print", "")}
                        />
                    )}
                    {currentPost && (
                        <Badge
                            label={`후가공: ${currentPost}`}
                            onRemove={() => setParam("post", "")}
                        />
                    )}
                    {currentConsult && (
                        <Badge
                            label={`상담경로: ${currentConsult}`}
                            onRemove={() => setParam("consult", "")}
                        />
                    )}
                    {currentDateFrom && (
                        <Badge
                            label={`${currentDateFrom}~`}
                            onRemove={() => setParam("dateFrom", "")}
                        />
                    )}
                    {currentDateTo && (
                        <Badge
                            label={`~${currentDateTo}`}
                            onRemove={() => setParam("dateTo", "")}
                        />
                    )}
                </div>
            )}
        </div>
    );
}

function Sel({
    value,
    onChange,
    placeholder,
    options,
}: {
    value: string;
    onChange: (v: string) => void;
    placeholder: string;
    options: { value: string; label: string }[];
}) {
    return (
        <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            style={{
                padding: "5px 24px 5px 10px",
                border: `1px solid ${value ? "#1ED67D" : "#e5e7eb"}`,
                borderRadius: 6,
                backgroundColor: value ? "#f0fdf4" : "#fff",
                backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24'%3E%3Cpath fill='%239ca3af' d='M7 10l5 5 5-5z'/%3E%3C/svg%3E")`,
                backgroundRepeat: "no-repeat",
                backgroundPosition: "right 6px center",
                color: value ? "#15803d" : "#6b7280",
                fontWeight: value ? 700 : 400,
                cursor: "pointer",
                outline: "none",
                fontFamily: "inherit",
                appearance: "none",
            }}
        >
            <option value="">{placeholder}</option>
            {options.map((o) => (
                <option key={o.value} value={o.value}>
                    {o.label}
                </option>
            ))}
        </select>
    );
}

function Badge({ label, onRemove }: { label: string; onRemove: () => void }) {
    return (
        <span
            style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 99,
                background: "#f0fdf4",
                border: "1px solid #86efac",
                color: "#15803d",
                fontWeight: 600,
            }}
        >
            {label}
            <button
                onClick={onRemove}
                style={{
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    color: "#15803d",
                    padding: 0,
                    lineHeight: 1,
                }}
            >
                ✕
            </button>
        </span>
    );
}

function dateInput(active: boolean): React.CSSProperties {
    return {
        padding: "4px 8px",
        border: `1px solid ${active ? "#1ED67D" : "#e5e7eb"}`,
        borderRadius: 6,
        outline: "none",
        fontFamily: "inherit",
        background: active ? "#f0fdf4" : "#fff",
        color: "#374151",
    };
}
