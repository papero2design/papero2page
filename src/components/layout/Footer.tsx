import { Box, Typography, Link, Divider, Chip } from "@mui/material";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";

const QUICK_LINKS = [
    {
        label: "네이버 스마트스토어",
        href: "https://smartstore.naver.com/",
        external: true,
    },
    { label: "고객 문의 채널", href: "#", external: true },
    { label: "작업 가이드", href: "#", external: false },
    { label: "견적 안내", href: "#", external: false },
];

const SUPPORT_LINKS = [
    { label: "카카오 채널", href: "#" },
    { label: "이메일 문의", href: "#" },
    { label: "작업 현황", href: "/tasks" },
];

export default function Footer() {
    return (
        <Box
            component="footer"
            sx={{
                bgcolor: "secondary.dark",
                borderTop: "1px solid",
                borderColor: "divider",
                mt: 10,
                pt: 5,
                pb: 4,
                px: 3,
            }}
        >
            <Box sx={{ maxWidth: 1200, mx: "auto" }}>
                {/* 상단 */}
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: 4,
                    }}
                >
                    {/* 브랜드 */}
                    <Box>
                        <Box
                            sx={{
                                display: "flex",
                                alignItems: "center",
                                gap: 1,
                                mb: 1.5,
                            }}
                        >
                            <Box
                                sx={{
                                    width: 28,
                                    height: 28,
                                    borderRadius: 1.75,
                                    bgcolor: "primary.main",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    fontSize: 14,
                                }}
                            >
                                ✦
                            </Box>
                            <Typography
                                fontWeight={800}
                                fontSize={15}
                                color="white"
                                letterSpacing="-0.03em"
                            >
                                design
                                <Box component="span" color="primary.main">
                                    hub
                                </Box>
                            </Typography>
                        </Box>
                        <Typography
                            fontSize={12}
                            color="#A1A1AA"
                            lineHeight={1.8}
                        >
                            디자인 작업 관리 시스템
                            <br />© 2025 designhub. All rights reserved.
                        </Typography>
                    </Box>

                    {/* 링크 */}
                    <Box sx={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        <Box>
                            <Typography
                                fontSize={11}
                                fontWeight={700}
                                sx={{
                                    color: "#52525B",
                                    letterSpacing: "0.1em",
                                    mb: 1.5,
                                }}
                            >
                                QUICK LINKS
                            </Typography>
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                }}
                            >
                                {QUICK_LINKS.map((l) => (
                                    <Link
                                        key={l.label}
                                        href={l.href}
                                        target={
                                            l.external ? "_blank" : undefined
                                        }
                                        rel={
                                            l.external
                                                ? "noopener noreferrer"
                                                : undefined
                                        }
                                        underline="none"
                                        sx={{
                                            fontSize: 13,
                                            color: "#A1A1AA",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 0.5,
                                            transition: "color 0.15s",
                                            "&:hover": {
                                                color: "primary.main",
                                            },
                                        }}
                                    >
                                        {l.external && (
                                            <OpenInNewIcon
                                                sx={{ fontSize: 12 }}
                                            />
                                        )}
                                        {l.label}
                                    </Link>
                                ))}
                            </Box>
                        </Box>

                        <Box>
                            <Typography
                                fontSize={11}
                                fontWeight={700}
                                sx={{
                                    color: "#52525B",
                                    letterSpacing: "0.1em",
                                    mb: 1.5,
                                }}
                            >
                                SUPPORT
                            </Typography>
                            <Box
                                sx={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 1,
                                }}
                            >
                                {SUPPORT_LINKS.map((l) => (
                                    <Link
                                        key={l.label}
                                        href={l.href}
                                        underline="none"
                                        sx={{
                                            fontSize: 13,
                                            color: "#A1A1AA",
                                            transition: "color 0.15s",
                                            "&:hover": {
                                                color: "primary.main",
                                            },
                                        }}
                                    >
                                        {l.label}
                                    </Link>
                                ))}
                            </Box>
                        </Box>
                    </Box>
                </Box>

                {/* 하단 */}
                <Divider sx={{ borderColor: "#27272A", mt: 4, mb: 2.5 }} />
                <Box
                    sx={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <Typography fontSize={11} color="#3F3F46">
                        네이버 스마트스토어 입점 업체 전용 관리 시스템
                    </Typography>
                    <Chip
                        label="v1.0.0"
                        size="small"
                        sx={{
                            fontSize: 11,
                            bgcolor: "#27272A",
                            color: "#52525B",
                            height: 22,
                        }}
                    />
                </Box>
            </Box>
        </Box>
    );
}
