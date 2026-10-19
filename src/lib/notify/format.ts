// src/lib/notify/format.ts
// 알림톡 변수 값 만들기. 순수 함수만 — 테스트하기 쉽게.

/**
 * 고객명 마스킹 (결정 13-7-2 ④ — 외주 수신은 가린다. 업체명도 같은 규칙)
 *   한 글자 → 그대로 · 두 글자 → 김* · 세 글자 이상 → 첫 · 끝만 남김 (김*지, O**사)
 * 한글 · 이모지가 섞여도 글자 단위로 자르도록 Array.from 을 쓴다.
 */
export function maskName(name: string | null | undefined): string {
    const chars = Array.from((name ?? "").trim());
    if (chars.length === 0) return "-";
    if (chars.length === 1) return chars[0];
    if (chars.length === 2) return `${chars[0]}*`;
    return chars[0] + "*".repeat(chars.length - 2) + chars[chars.length - 1];
}

/** 50000 → "50,000" ("원"은 템플릿 고정 문구) */
export function won(n: number): string {
    return Math.round(n).toLocaleString("ko-KR");
}

/** ISO → KST 기준 "YYYY-MM-DD". UTC 로 자르면 자정 전후 날짜가 밀린다 (13-3) */
export function kstDate(iso: string | Date): string {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(iso));
}

/** "010-1234-5678" → "01012345678". 형식이 이상하면 null */
export function normalizePhone(v: string | null | undefined): string | null {
    const d = (v ?? "").replace(/\D/g, "");
    return /^0\d{8,10}$/.test(d) ? d : null;
}

/** 빈 값이 템플릿에 들어가면 발송이 거절될 수 있다 → 대체 문자 */
export function orDash(v: string | null | undefined): string {
    const t = (v ?? "").trim();
    return t === "" ? "-" : t;
}
