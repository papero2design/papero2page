// src/lib/ui/Skeleton.tsx
//
// 로딩 표시 프리미티브. "불러오는 중..." 텍스트와 복사된 회색 막대를 전부 이것으로 바꾼다.
//
// - MUI <Skeleton> 을 감싼다. keyframes 는 emotion 이 주입하므로 CSS 파일을 건드리지 않는다.
//   (기존 인라인 `animation: "pulse ..."` 는 @keyframes 가 어디에도 없어서 정지돼 있었다)
// - 색은 표(BoardTable) 가 쓰는 회색 계열(#f3f4f6 / #e5e7eb) 을 그대로 쓴다.
// - 치수는 완성 화면과 같아야 한다. 데이터 도착 순간 레이아웃이 튀면 스켈레톤의 의미가 없다.
//   그래서 조합 컴포넌트는 각각 대상 화면의 실제 패딩·높이를 주석으로 적어 두었다.
"use client";

import MuiSkeleton from "@mui/material/Skeleton";
import type { CSSProperties } from "react";

const BASE = "#f3f4f6";   // BoardTable 행 배경 회색과 동일
const LINE = "#e5e7eb";   // BoardTable 행 구분선과 동일

// ─────────────────────────────────────────────────────────────
// 기본 조각
// ─────────────────────────────────────────────────────────────

type SkeletonProps = {
    w?: number | string;
    h?: number | string;
    r?: number;             // borderRadius. 기본 6 = 이 프로젝트 카드·칩 반경
    circle?: boolean;
    style?: CSSProperties;
};

/** 막대 하나. 폭·높이만 넘긴다. */
export function Skeleton({ w = "100%", h = 14, r = 6, circle, style }: SkeletonProps) {
    return (
        <MuiSkeleton
            variant={circle ? "circular" : "rectangular"}
            animation="wave"
            width={w}
            height={h}
            sx={{ bgcolor: BASE, borderRadius: circle ? "50%" : r, flexShrink: 0, ...style }}
        />
    );
}

/** 텍스트 줄 여러 개. 마지막 줄은 짧게 끊어 문단처럼 보이게 한다. */
export function SkeletonLines({
                                  lines = 2,
                                  h = 12,
                                  gap = 8,
                                  lastWidth = "60%",
                              }: {
    lines?: number;
    h?: number;
    gap?: number;
    lastWidth?: number | string;
}) {
    return (
        <div style={{ display: "grid", gap }}>
            {Array.from({ length: lines }).map((_, i) => (
                <Skeleton key={i} h={h} w={i === lines - 1 ? lastWidth : "100%"} />
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 조합 ① 표 — BoardClient · DesignerBoardClient · SearchClient 의 initialLoad
//
// 대상: BoardTable. 실측치
//   thead: borderTop 2px #111827, background #f9fafb, th padding "10px 12px"
//   tr   : borderBottom 1px #e5e7eb, td padding "8px 8px"  → 행 높이 약 52px
//   열   : [체크 50][순번 52][내용 auto][… 뱃지·담당·날짜]
// 상단 툴바(FilterBar + 등록 버튼) 자리도 같이 잡아야 표가 아래로 밀리지 않는다.
// ─────────────────────────────────────────────────────────────

export function TableRowsSkeleton({
                                      rows = 8,
                                      toolbar = true,
                                      bare = false,
                                  }: {
    rows?: number;
    /** FilterBar + WriteButton 줄. 검색 결과처럼 툴바가 없는 화면은 false */
    toolbar?: boolean;
    /** 부모가 이미 maxWidth 1260 래퍼를 갖고 있으면 true — 이중 패딩 방지 */
    bare?: boolean;
}) {
    return (
        <div
            aria-busy="true"
            aria-label="불러오는 중"
            style={bare ? undefined : { width: "100%", maxWidth: 1260, margin: "0 auto", padding: "0 16px 40px" }}
        >
            {toolbar && (
                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        paddingTop: 16,
                        marginBottom: 12,
                        gap: 8,
                    }}
                >
                    <div style={{ display: "flex", gap: 6 }}>
                        <Skeleton w={72} h={32} r={8} />
                        <Skeleton w={88} h={32} r={8} />
                        <Skeleton w={64} h={32} r={8} />
                    </div>
                    <Skeleton w={96} h={36} r={8} />
                </div>
            )}

            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                <tr style={{ borderTop: "2px solid #111827", borderBottom: `1px solid ${LINE}`, background: "#f9fafb" }}>
                    <th style={{ padding: "10px 12px", width: 50 }}><Skeleton w={16} h={16} r={3} style={{ margin: "0 auto" }} /></th>
                    <th style={{ padding: "10px 12px", width: 52 }}><Skeleton w={28} h={12} style={{ margin: "0 auto" }} /></th>
                    <th style={{ padding: "10px 12px", textAlign: "left" }}><Skeleton w={40} h={12} /></th>
                    <th style={{ padding: "10px 12px", width: 120 }}><Skeleton w={56} h={12} style={{ margin: "0 auto" }} /></th>
                    <th style={{ padding: "10px 12px", width: 120 }}><Skeleton w={48} h={12} style={{ margin: "0 auto" }} /></th>
                </tr>
                </thead>
                <tbody>
                {Array.from({ length: rows }).map((_, i) => (
                    <tr key={i} style={{ borderBottom: `1px solid ${LINE}` }}>
                        <td style={{ padding: "8px 8px" }}><Skeleton w={16} h={16} r={3} style={{ margin: "0 auto" }} /></td>
                        <td style={{ padding: "8px 8px" }}><Skeleton w={24} h={12} style={{ margin: "0 auto" }} /></td>
                        <td style={{ padding: "8px 8px" }}>
                            <div style={{ display: "grid", gap: 6, padding: "4px 0" }}>
                                <Skeleton w={`${45 + ((i * 17) % 35)}%`} h={14} />
                                <Skeleton w={`${25 + ((i * 11) % 25)}%`} h={11} />
                            </div>
                        </td>
                        <td style={{ padding: "8px 8px" }}><Skeleton w={64} h={22} r={11} style={{ margin: "0 auto" }} /></td>
                        <td style={{ padding: "8px 8px" }}><Skeleton w={72} h={12} style={{ margin: "0 auto" }} /></td>
                    </tr>
                ))}
                </tbody>
            </table>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 조합 ② 카드 — /outsourcing 의 AvailableCard · MyTaskCard, /board/outsourcing 의 목록
// 대상 실측: border 1px, borderRadius 10, padding "14px 16px", 헤더 한 줄 + 뱃지
// ─────────────────────────────────────────────────────────────

export function CardSkeleton({ lines = 2 }: { lines?: number }) {
    return (
        <div
            aria-busy="true"
            style={{
                border: `1px solid ${LINE}`,
                borderRadius: 10,
                padding: "14px 16px",
                background: "#fff",
                display: "grid",
                gap: 10,
            }}
        >
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <Skeleton w={56} h={20} r={10} />
                <Skeleton w={40} h={20} r={10} />
                <Skeleton w={"38%"} h={16} style={{ marginLeft: 4 }} />
                <Skeleton w={64} h={14} style={{ marginLeft: "auto" }} />
            </div>
            <SkeletonLines lines={lines} />
        </div>
    );
}

/** 카드 여러 개를 세로로. 기본 gap 12 = 외주 화면 카드 간격 */
export function CardListSkeleton({ count = 3, lines }: { count?: number; lines?: number }) {
    return (
        <div style={{ display: "grid", gap: 12 }}>
            {Array.from({ length: count }).map((_, i) => (
                <CardSkeleton key={i} lines={lines} />
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 조합 ③ 타임라인 — 드로어 "로그" 탭 (BoardTable LogTimeline)
// 대상 실측: 컨테이너 padding "20px 18px", 항목마다 점 + 시각 + 내용
// ─────────────────────────────────────────────────────────────

export function TimelineSkeleton({ items = 4 }: { items?: number }) {
    return (
        <div aria-busy="true" style={{ padding: "20px 18px", display: "grid", gap: 16 }}>
            {Array.from({ length: items }).map((_, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <Skeleton w={8} h={8} circle style={{ marginTop: 4 }} />
                    <div style={{ flex: 1, display: "grid", gap: 6 }}>
                        <Skeleton w={96} h={11} />
                        <Skeleton w={`${55 + ((i * 13) % 35)}%`} h={13} />
                    </div>
                </div>
            ))}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// 조합 ④ 채팅 — ChatWidget 메시지 영역 · 참여자 시트
// 말풍선은 좌우 번갈아. 폭은 매번 다르게 해서 실제 대화처럼 보이게 한다.
// ─────────────────────────────────────────────────────────────

export function ChatLinesSkeleton({ count = 4 }: { count?: number }) {
    const widths = ["48%", "62%", "36%", "55%", "44%", "70%"];
    return (
        <div aria-busy="true" style={{ display: "grid", gap: 10, padding: "16px 0" }}>
            {Array.from({ length: count }).map((_, i) => {
                const mine = i % 2 === 1;
                return (
                    <div key={i} style={{ display: "flex", justifyContent: mine ? "flex-end" : "flex-start", gap: 8 }}>
                        {!mine && <Skeleton w={28} h={28} circle />}
                        <Skeleton w={widths[i % widths.length]} h={34} r={14} />
                    </div>
                );
            })}
        </div>
    );
}

/** 아바타 + 이름 행. 참여자 시트·명단 */
export function PeopleRowsSkeleton({ rows = 4 }: { rows?: number }) {
    return (
        <div aria-busy="true" style={{ display: "grid", gap: 4, padding: "8px 0" }}>
            {Array.from({ length: rows }).map((_, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px" }}>
                    <Skeleton w={32} h={32} circle />
                    <Skeleton w={`${35 + ((i * 19) % 30)}%`} h={13} />
                </div>
            ))}
        </div>
    );
}