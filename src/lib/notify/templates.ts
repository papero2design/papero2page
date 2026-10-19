// src/lib/notify/templates.ts
// 알림톡 템플릿 매핑 — 문서 13-7-4 · 13-7-5
//
// ★ 승인된 템플릿은 문구 · 변수 · 버튼을 못 고친다.
//   문구를 바꾸려면 새 템플릿 → 재심사 → 여기 templateId 교체.
// ★ 변수 키는 승인된 템플릿과 글자 하나까지 같아야 치환된다 → 이 파일 밖에서 문자열로 쓰지 않는다.
// 이 파일은 "use server" 가 없는 순수 모듈이다. 비밀값이 없다 (templateId 는 비밀이 아님).

import type { NotifyEvent } from "@/types/database";

export const VAR = {
    작업자명: "#{작업자명}",
    고객명: "#{고객명}",
    주문방법: "#{주문방법}",
    단가: "#{단가}",
    회차: "#{회차}",
    승인일: "#{승인일}",
    건수: "#{건수}",
    정산금액: "#{정산금액}",
    처리일: "#{처리일}",
    해제일: "#{해제일}",
    변경전단가: "#{변경전단가}",
    변경후단가: "#{변경후단가}",
} as const;

export interface TemplateDef {
    code: string;          // 솔라피 콘솔에서 보이는 이름
    templateId: string;    // 승인된 템플릿 ID
    enabled: boolean;      // false 면 dispatch 가 skipped 로 넘긴다
}

export const TEMPLATES: Record<NotifyEvent, TemplateDef> = {
    // ── 1차 ──
    assign:         { code: "OS_ASSIGN",         templateId: "KA01TP260916031430345vqxxK3aK3Tu", enabled: false }, // 작업 배정 (사내 -> 외주)
    review_request: { code: "OS_REVIEW_REQUEST", templateId: "KA01TP260916031714363NRxsyKw7wkz", enabled: false }, // 검수 요청 (외주 -> 사내)
    rework:         { code: "OS_REWORK",         templateId: "KA01TP260916032540103xSBwcdYXV4G", enabled: true }, // 수정 요청
    approved:       { code: "OS_APPROVED",       templateId: "KA01TP260916032048913vu7UmEbFohW", enabled: false }, // 작업 승인
    settled:        { code: "OS_SETTLED",        templateId: "KA01TP260916032704164kqxL7CTp6YJ", enabled: true }, // 정산 완료
    // ── 2차 — 승인은 받아둠. 켜려면 enabled 만 true 로 ──
    released:       { code: "OS_RELEASED",       templateId: "KA01TP260916032917412QTKVknszPau", enabled: false }, // 배정 해제
    price_changed:  { code: "OS_PRICE_CHANGED",  templateId: "KA01TP260916033035604oyXmtcGNbTt", enabled: false }, // 단가 변경
};
