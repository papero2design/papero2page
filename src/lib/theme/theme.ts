import { createTheme } from "@mui/material/styles";

// 속성 추가하려면 선언 추가 해야함 ts란 깐깐하도다

// text 타입
declare module "@mui/material/styles" {
    interface TypeText {
        disabled: string; // 기본 포함은 명시적으로 써두면 좋음
        hint: string; // 커스텀 추가
    }
}

// typography 스타일
declare module "@mui/material/styles" {
    interface TypographyVariants {
        display: React.CSSProperties;
    }
    interface TypographyVariantsOptions {
        display?: React.CSSProperties;
    }
}
declare module "@mui/material/Typography" {
    interface TypographyPropsVariantOverrides {
        display: true;
    }
}

const theme = createTheme({
    // 1. 타이포그래피 폰트 설정
    // theme.ts의 typography 섹션 교체용
    typography: {
        fontFamily: '"Pretendard", "Roboto", "Helvetica", "Arial", sans-serif',
        button: { fontWeight: 600, textTransform: "none" },

        // display — Hero 큰 숫자 (48px)
        display: {
            fontSize: "3rem", // 48px
            fontWeight: 900,
            letterSpacing: "-0.05em",
            lineHeight: 1,
        },

        // h1 — Hero 제목 (30px)
        h1: {
            fontSize: "1.875rem", // 30px
            fontWeight: 900,
            letterSpacing: "-0.04em",
            lineHeight: 1.15,
        },

        // h2 — 예비 (24px)
        h2: {
            fontSize: "1.5rem", // 24px
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.2,
        },

        // h3 — 섹션 타이틀 (20px)
        h3: {
            fontSize: "1.25rem", // 20px
            fontWeight: 800,
            letterSpacing: "-0.03em",
            lineHeight: 1.3,
        },

        // h4 — 카드 제목, 모달 제목 (17px)
        h4: {
            fontSize: "1.0625rem", // 17px
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.4,
        },

        // h5 — 고객명, 작업명 강조 (16px)
        h5: {
            fontSize: "1rem", // 16px
            fontWeight: 700,
            letterSpacing: "-0.02em",
            lineHeight: 1.4,
        },

        // h6 — 보조 강조, 디자이너 이름 (15px)
        h6: {
            fontSize: "0.9375rem", // 15px
            fontWeight: 600,
            letterSpacing: "-0.01em",
            lineHeight: 1.5,
        },

        // body1 — 일반 본문 (15px)
        body1: {
            fontSize: "0.9375rem", // 15px
            letterSpacing: "-0.01em",
            lineHeight: 1.6,
        },

        // body2 — 보조 본문, 테이블 셀 (14px)
        body2: {
            fontSize: "0.875rem", // 14px
            letterSpacing: "-0.01em",
            lineHeight: 1.6,
        },

        // caption — 날짜, 주문경로, 보조 설명 (13px)
        caption: {
            fontSize: "0.8125rem", // 13px
            letterSpacing: "0em",
            lineHeight: 1.5,
        },

        // overline — 상태 뱃지, 태그, 라벨 (12px ← 접근성 최소)
        overline: {
            fontSize: "0.75rem", // 12px
            fontWeight: 600,
            letterSpacing: "0.06em",
            textTransform: "none" as const, // 기본 uppercase 제거
            lineHeight: 1.5,
        },
    },

    // 색상 팔레트
    // 대시보드는 눈에 띄게라지만 촌스럽지 않은 조합 찾기가 어렵다
    palette: {
        primary: {
            main: "#1ED67D",
            light: "#7EEDBA",
            dark: "#13A361",
            contrastText: "#071A0F",
        },
        secondary: {
            main: "#27272A",
            light: "#52525B",
            dark: "#09090B",
            contrastText: "#ffffff",
        },
        error: {
            main: "#DC2626",
            light: "#FEF2F2",
        },
        success: {
            main: "#16A34A",
            light: "#F0FDF4",
        },
        warning: {
            main: "#D97706",
            light: "#FFFBEB",
        },
        info: {
            main: "#2563EB",
            light: "#EFF6FF",
        },
        background: {
            default: "#FAFAF9",
            paper: "#FFFFFF",
        },
        text: {
            primary: "#18181B",
            secondary: "#71717A",
            disabled: "#A1A1AA", // 비활성, 미배정
            hint: "#D4D4D8", // 힌트 등
        },
        divider: "#E4E4E7",
    },
    // 3. 모서리 둥글기와 컴포넌트 디테일 (Google 느낌 쫙 빼기)
    shape: {
        borderRadius: 8, // 기본보다 살짝 더 둥글려서 부드럽게
    },
    components: {
        MuiButton: {
            styleOverrides: {
                root: {
                    boxShadow: "none", // 붕 뜨는 그림자 제거 (요즘 트렌드인 Flat 디자인)
                    "&:hover": {
                        boxShadow: "none",
                    },
                },
            },
        },
        MuiCard: {
            styleOverrides: {
                root: {
                    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.03)", // 아주 은은하고 퍼지는 고급스러운 그림자
                    border: "1px solid #f4f4f5", // 얇은 테두리로 윤곽선만 잡아줌
                },
            },
        },
    },
});

export default theme;
