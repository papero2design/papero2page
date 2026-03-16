export const fontSize = {
    display: 48, // Hero 큰 숫자
    h1: 30, // Hero 제목
    h2: 24, // 예비
    h3: 20, // 섹션 타이틀 "🚨 우선 작업"
    h4: 17, // 카드 제목, 모달 제목
    h5: 16, // 고객명, 작업명 강조
    h6: 15, // 보조 강조, 디자이너 이름
    body1: 15, // 일반 본문
    body2: 14, // 보조 본문, 테이블 셀
    caption: 13, // 날짜, 주문경로, 보조 설명
    label: 12, // 상태 뱃지, 필터 칩, 태그
    tiny: 12, // 최소 크기 (접근성 기준 하한선)
} as const;

export const fontWeight = {
    black: 900, // Hero 숫자
    extrabold: 800, // 섹션 타이틀
    bold: 700, // 고객명, 강조
    semibold: 600, // 보조 강조, 링크
    medium: 500, // 일반 강조
    regular: 400, // 본문
} as const;
