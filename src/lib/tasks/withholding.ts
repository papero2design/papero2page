/**
 * 사업소득 원천징수 3.3% — 외주 작업자에게 실제로 지급되는 금액 계산.
 *
 * - 소득세 3%, 지방소득세 = 소득세의 10% (합계 3.3%)
 * - 각 세액은 10원 미만 절사
 * - 인적용역 사업소득은 '24.7.1 지급분부터 소액부징수(세액 1천원 미만 면제)가 적용되지 않는다
 *   → 금액이 작아도 뗀다
 *
 * ★ 지급(정산) 단위로 계산한다. 건별로 떼서 더하면 절사 때문에 몇십 원 어긋난다.
 *   카드 한 장의 금액은 "이 건만 따로 받는다면"의 참고값이다.
 *
 * 이 파일은 "use server" 가 없는 순수 모듈이라 클라이언트에서도 import 된다.
 */
export interface Withholding {
    gross: number;      // 세전 (단가 합계)
    incomeTax: number;  // 소득세 3%
    localTax: number;   // 지방소득세 0.3%
    tax: number;        // 합계
    net: number;        // 실수령
}

export function withholding33(gross: number): Withholding {
    const g = Math.max(0, Math.round(gross));
    const incomeTax = Math.floor((g * 3) / 1000) * 10;   // g × 3% 를 10원 단위 절사
    const localTax = Math.floor(incomeTax / 100) * 10;   // 소득세 × 10% 를 10원 단위 절사
    const tax = incomeTax + localTax;
    return { gross: g, incomeTax, localTax, tax, net: g - tax };
}