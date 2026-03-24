// src/app/(classic)/board/designers/[id]/DesignerProfilePanel.tsx
"use client";

import { useState, useTransition } from "react";
import { uploadToR2 } from "@/lib/r2/upload";
import { useToast } from "../../Toast";
import {
    updateMyProfile,
    updateMyAvatar,
    updateMyMusic,
    updateMyBanner,
} from "./actions";

type Designer = {
    id: string;
    name: string;
    status: string;
    avatar_url: string | null;
    music_title: string | null;
    music_link: string | null;
    banner_color?: string | null; // "0"~"11" 팔레트 인덱스, null/undefined이면 ID 기반 자동 배정
};

const STATUSES = ["연차", "반차", "외출", "작업중", "바쁨"] as const;

const BANNER_GRADIENTS = [
    "linear-gradient(135deg, #667eea 0%, #764ba2 100%)",
    "linear-gradient(135deg, #f093fb 0%, #f5576c 100%)",
    "linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)",
    "linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)",
    "linear-gradient(135deg, #fa709a 0%, #fee140 100%)",
    "linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)",
    "linear-gradient(135deg, #f6d365 0%, #fda085 100%)",
    "linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%)",
    "linear-gradient(135deg, #fddb92 0%, #d1fdff 100%)",
    "linear-gradient(135deg, #a1c4fd 0%, #c2e9fb 100%)",
    "linear-gradient(135deg, #fccb90 0%, #d57eeb 100%)",
    "linear-gradient(135deg, #e0c3fc 0%, #8ec5fc 100%)",
];

function getBannerGradient(id: string, bannerColor: string | null): string {
    if (bannerColor !== null) {
        const idx = parseInt(bannerColor, 10);
        if (!isNaN(idx) && idx >= 0 && idx < BANNER_GRADIENTS.length)
            return BANNER_GRADIENTS[idx];
    }
    const sum = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
    return BANNER_GRADIENTS[sum % BANNER_GRADIENTS.length];
}

const STATUS_COLOR: Record<
    string,
    { dot: string; bg: string; text: string; border: string }
> = {
    연차: { dot: "#94a3b8", bg: "#f8fafc", text: "#475569", border: "#cbd5e1" },
    반차: { dot: "#a78bfa", bg: "#f5f3ff", text: "#6d28d9", border: "#ddd6fe" },
    외출: { dot: "#f97316", bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
    작업중: {
        dot: "#f59e0b",
        bg: "#fffbeb",
        text: "#b45309",
        border: "#fde68a",
    },
    바쁨: { dot: "#ef4444", bg: "#fef2f2", text: "#dc2626", border: "#fecaca" },
};

interface Stats {
    active: number;
    done: number;
    priority: number;
    statusMap: Record<string, number>;
}

function getYouTubeId(url: string): string | null {
    const m = url.match(
        /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([^&\n?#]{11})/,
    );
    return m ? m[1] : null;
}

// ─── 뮤직 카드 ──────────────────────────────────────────────────────

function MusicCard({
    title,
    link,
    isOwn,
    designerId,
}: {
    title: string | null;
    link: string | null;
    isOwn: boolean;
    designerId: string;
}) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({ title: title ?? "", link: link ?? "" });
    const [isPending, startTransition] = useTransition();
    const { showToast, ToastUI } = useToast();

    const ytId = link ? getYouTubeId(link) : null;
    const previewYtId = form.link ? getYouTubeId(form.link) : null;

    const handleSave = () => {
        startTransition(async () => {
            try {
                await updateMyMusic(designerId, {
                    music_title: form.title.trim() || null,
                    music_link: form.link.trim() || null,
                });
                setEditing(false);
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    const handleClear = () => {
        startTransition(async () => {
            await updateMyMusic(designerId, {
                music_title: null,
                music_link: null,
            });
            setForm({ title: "", link: "" });
        });
    };

    // ── 편집 모드 ──
    if (editing) {
        const previewThumb = previewYtId
            ? `https://img.youtube.com/vi/${previewYtId}/mqdefault.jpg`
            : null;

        return (
            <div style={musicCardBase}>
                {ToastUI}
                <p
                    style={{
                        margin: "0 0 14px",
                        fontWeight: 700,
                        color: "#111827",
                        fontSize: 13,
                    }}
                >
                    🎵 지금 듣는 음악 설정
                </p>
                <div
                    style={{
                        display: "flex",
                        gap: 16,
                        alignItems: "flex-start",
                    }}
                >
                    {previewThumb && (
                        <img
                            src={previewThumb}
                            alt="preview"
                            style={{
                                width: 88,
                                height: 60,
                                objectFit: "cover",
                                borderRadius: 8,
                                flexShrink: 0,
                                opacity: 0.85,
                            }}
                        />
                    )}
                    <div
                        style={{
                            flex: 1,
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                        }}
                    >
                        <input
                            value={form.title}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    title: e.target.value,
                                }))
                            }
                            placeholder="곡 제목"
                            style={{ ...inputStyle, width: "100%" }}
                        />
                        <input
                            value={form.link}
                            onChange={(e) =>
                                setForm((p) => ({ ...p, link: e.target.value }))
                            }
                            placeholder="YouTube / Spotify 링크"
                            style={{ ...inputStyle, width: "100%" }}
                        />
                        <div style={{ display: "flex", gap: 6 }}>
                            <button
                                onClick={() => {
                                    setEditing(false);
                                    setForm({
                                        title: title ?? "",
                                        link: link ?? "",
                                    });
                                }}
                                style={darkBtn(false)}
                            >
                                취소
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isPending}
                                style={{
                                    ...darkBtn(true),
                                    opacity: isPending ? 0.7 : 1,
                                }}
                            >
                                {isPending ? "저장 중..." : "저장"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    // ── 음악 없고 본인 아님 ──
    if (!title && !link) {
        if (!isOwn) return null;
        return (
            <button
                onClick={() => setEditing(true)}
                style={{
                    width: "100%",
                    padding: "13px",
                    border: "1.5px dashed #d1d5db",
                    borderRadius: 14,
                    background: "transparent",
                    color: "#9ca3af",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13,
                    textAlign: "center",
                    marginBottom: 20,
                    transition: "border-color 0.15s, color 0.15s",
                }}
                onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "#9ca3af";
                    (e.currentTarget as HTMLButtonElement).style.color =
                        "#6b7280";
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "#d1d5db";
                    (e.currentTarget as HTMLButtonElement).style.color =
                        "#9ca3af";
                }}
            >
                🎵 지금 듣는 음악 추가하기
            </button>
        );
    }

    // ── 음악 있음 — 제목/링크 중심 카드 ──
    const thumbUrl = ytId
        ? `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`
        : null;

    return (
        <div
            style={{
                ...musicCardBase,
                display: "flex",
                alignItems: "center",
                gap: 16,
                marginBottom: 20,
            }}
        >
            {/* 좌측 — 아이콘 + 제목 + 링크 */}
            <div style={{ flex: 1, minWidth: 0 }}>
                <span
                    style={{
                        display: "inline-block",
                        fontSize: 10,
                        fontWeight: 700,
                        letterSpacing: "0.1em",
                        textTransform: "uppercase",
                        color: "#4b5563",
                        marginBottom: 6,
                    }}
                >
                    🎵 Now Playing
                </span>
                {link ? (
                    <a
                        href={link}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            display: "block",
                            fontSize: 18,
                            fontWeight: 900,
                            color: "#111827",
                            textDecoration: "none",
                            lineHeight: 1.3,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginBottom: 10,
                            transition: "color 0.15s",
                        }}
                        onMouseEnter={(e) =>
                            ((
                                e.currentTarget as HTMLAnchorElement
                            ).style.color = "#1ED67D")
                        }
                        onMouseLeave={(e) =>
                            ((
                                e.currentTarget as HTMLAnchorElement
                            ).style.color = "#111827")
                        }
                    >
                        {title || link}
                    </a>
                ) : (
                    <div
                        style={{
                            fontSize: 18,
                            fontWeight: 900,
                            color: "#111827",
                            lineHeight: 1.3,
                            marginBottom: 10,
                        }}
                    >
                        {title}
                    </div>
                )}
                <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {link && (
                        <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "4px 12px",
                                borderRadius: 99,
                                background: "#111827",
                                color: "#f9fafb",
                                fontSize: 12,
                                fontWeight: 700,
                                textDecoration: "none",
                                transition: "opacity 0.15s",
                            }}
                            onMouseEnter={(e) =>
                                ((
                                    e.currentTarget as HTMLAnchorElement
                                ).style.opacity = "0.85")
                            }
                            onMouseLeave={(e) =>
                                ((
                                    e.currentTarget as HTMLAnchorElement
                                ).style.opacity = "1")
                            }
                        >
                            <svg
                                width="10"
                                height="10"
                                viewBox="0 0 24 24"
                                fill="currentColor"
                            >
                                <path d="M8 5v14l11-7z" />
                            </svg>
                            열기
                        </a>
                    )}
                    {isOwn && (
                        <>
                            <button
                                onClick={() => setEditing(true)}
                                style={darkBtn(false)}
                            >
                                수정
                            </button>
                            <button
                                onClick={handleClear}
                                disabled={isPending}
                                style={{
                                    ...darkBtn(false),
                                    opacity: isPending ? 0.5 : 1,
                                }}
                            >
                                삭제
                            </button>
                        </>
                    )}
                </div>
            </div>

            {/* 우측 — 썸네일 (보조) */}
            {thumbUrl && (
                <div style={{ position: "relative", flexShrink: 0 }}>
                    <img
                        src={thumbUrl}
                        alt={title ?? ""}
                        style={{
                            width: 120,
                            height: 80,
                            objectFit: "cover",
                            borderRadius: 10,
                            opacity: 0.6,
                            display: "block",
                        }}
                    />
                    {/* 살짝 어두운 오버레이 */}
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            borderRadius: 10,
                            background:
                                "linear-gradient(135deg, #0f172a55 0%, transparent 60%)",
                        }}
                    />
                </div>
            )}
        </div>
    );
}

// ─── 메인 프로필 패널 ────────────────────────────────────────────────

export default function DesignerProfilePanel({
    designer,
    stats,
    isOwn,
    onRefresh,
}: {
    designer: Designer;
    stats: Stats;
    isOwn: boolean;
    onRefresh?: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        name: designer.name,
        status: designer.status,
    });
    const [bannerColor, setBannerColor] = useState<string | null>(
        designer.banner_color ?? null,
    );
    const [uploading, setUploading] = useState(false);
    const [isPending, startTransition] = useTransition();
    const { showToast, ToastUI } = useToast();

    const sc = STATUS_COLOR[designer.status] ?? STATUS_COLOR["작업중"];

    const handleAvatarChange = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const { publicUrl } = await uploadToR2("avatars", file);
            await updateMyAvatar(designer.id, publicUrl);
            onRefresh?.();
        } catch (err) {
            showToast("업로드 실패: " + (err as Error).message);
        } finally {
            setUploading(false);
        }
    };

    const handleSave = () => {
        if (!form.name.trim()) {
            showToast("이름을 입력해주세요.");
            return;
        }
        startTransition(async () => {
            try {
                await updateMyProfile(designer.id, form);
                if (
                    designer.banner_color !== undefined &&
                    bannerColor !== (designer.banner_color ?? null)
                ) {
                    await updateMyBanner(designer.id, {
                        banner_color: bannerColor,
                    });
                }
                setEditing(false);
                onRefresh?.();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    const STAT_ITEMS = [
        {
            label: "진행 중",
            value: stats.active,
            color: "#111827",
            bg: "#f9fafb",
            border: "#e5e7eb",
        },
        {
            label: "완료",
            value: stats.done,
            color: "#15803d",
            bg: "#f0fdf4",
            border: "#bbf7d0",
        },
        {
            label: "우선작업",
            value: stats.priority,
            color: "#dc2626",
            bg: "#fef2f2",
            border: "#fecaca",
        },
    ];

    return (
        <div style={{ marginBottom: 4 }}>
            {ToastUI}
            {/* ── 프로필 카드 ──────────────────────────────────────── */}
            <div
                style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 16,
                    // overflow: hidden 제거 — 배너 z-index가 통계를 가리는 버그 방지
                    marginBottom: 12,
                    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
                }}
            >
                {/* 배너 — borderRadius를 직접 지정해 카드 상단 모서리 유지 */}
                <div
                    style={{
                        height: 140,
                        borderRadius: "15px 15px 0 0",
                        background: getBannerGradient(designer.id, bannerColor),
                        position: "relative",
                        overflow: "hidden", // 배너 내부 장식만 클리핑
                    }}
                >
                    {/* 장식용 원 */}
                    <div
                        style={{
                            position: "absolute",
                            top: -50,
                            right: -30,
                            width: 180,
                            height: 180,
                            borderRadius: "50%",
                            background: "rgba(255,255,255,0.04)",
                            display: "flex",
                            justifyContent: "center",
                            alignItems: "center",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            bottom: -70,
                            right: 100,
                            width: 160,
                            height: 160,
                            borderRadius: "50%",
                            background: "rgba(255,255,255,0.03)",
                        }}
                    />
                    {/* 배너 색상 선택 (편집 모드 + 본인) */}
                    {editing && isOwn && (
                        <div
                            style={{
                                position: "absolute",
                                bottom: 10,
                                left: "50%",
                                transform: "translateX(-50%)",
                                display: "flex",
                                gap: 6,
                                alignItems: "center",
                                background: "rgba(0,0,0,0.35)",
                                padding: "6px 10px",
                                borderRadius: 99,
                                zIndex: 3,
                            }}
                        >
                            {/* 자동(ID 기반) */}
                            <button
                                type="button"
                                title="자동 색상"
                                onClick={() => setBannerColor(null)}
                                style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: "50%",
                                    border:
                                        bannerColor === null
                                            ? "2.5px solid #fff"
                                            : "2px solid rgba(255,255,255,0.4)",
                                    background: "#6b7280",
                                    cursor: "pointer",
                                    fontSize: 10,
                                    color: "#fff",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    flexShrink: 0,
                                }}
                            >
                                A
                            </button>
                            {BANNER_GRADIENTS.map((g, idx) => (
                                <button
                                    key={idx}
                                    type="button"
                                    title={`색상 ${idx + 1}`}
                                    onClick={() => setBannerColor(String(idx))}
                                    style={{
                                        width: 22,
                                        height: 22,
                                        borderRadius: "50%",
                                        border:
                                            bannerColor === String(idx)
                                                ? "2.5px solid #fff"
                                                : "2px solid rgba(255,255,255,0.3)",
                                        background: g,
                                        cursor: "pointer",
                                        flexShrink: 0,
                                    }}
                                />
                            ))}
                        </div>
                    )}
                </div>

                {/* 본문 — position:relative + zIndex:1 로 배너 위에 렌더링 보장 */}
                <div
                    style={{
                        padding: "0 24px 18px",
                        position: "relative",
                        zIndex: 1,
                    }}
                >
                    {/* 아바타 + 통계 행 */}
                    <div
                        style={{
                            display: "flex",
                            alignItems: "flex-end",
                            justifyContent: "space-between",
                            marginTop: -40, // 배너와 겹치는 만큼
                            gap: 12,
                        }}
                    >
                        {/* 아바타 */}
                        <div style={{ position: "relative", flexShrink: 0 }}>
                            <div
                                style={{
                                    width: 80,
                                    height: 80,
                                    borderRadius: "50%",
                                    border: "4px solid #fff",
                                    boxShadow: "0 2px 10px rgba(0,0,0,0.14)",
                                    overflow: "hidden",
                                    background: "#334155",
                                }}
                            >
                                {designer.avatar_url ? (
                                    <img
                                        src={designer.avatar_url}
                                        alt={designer.name}
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            objectFit: "cover",
                                            display: "block",
                                        }}
                                    />
                                ) : (
                                    <div
                                        style={{
                                            width: "100%",
                                            height: "100%",
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            fontWeight: 900,
                                            color: "#fff",
                                            fontSize: 28,
                                        }}
                                    >
                                        {designer.name[0]}
                                    </div>
                                )}
                                {/* 호버 업로드 오버레이 */}
                                {isOwn && (
                                    <label
                                        style={{
                                            position: "absolute",
                                            inset: 0,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            background: "rgba(0,0,0,0)",
                                            color: "transparent",
                                            cursor: "pointer",
                                            fontSize: 16,
                                            fontWeight: 700,
                                            transition:
                                                "background 0.2s, color 0.2s",
                                            borderRadius: "50%",
                                        }}
                                        onMouseEnter={(e) => {
                                            (
                                                e.currentTarget as HTMLLabelElement
                                            ).style.background =
                                                "rgba(0,0,0,0.45)";
                                            (
                                                e.currentTarget as HTMLLabelElement
                                            ).style.color = "#fff";
                                        }}
                                        onMouseLeave={(e) => {
                                            (
                                                e.currentTarget as HTMLLabelElement
                                            ).style.background =
                                                "rgba(0,0,0,0)";
                                            (
                                                e.currentTarget as HTMLLabelElement
                                            ).style.color = "transparent";
                                        }}
                                    >
                                        {uploading ? "…" : "✎"}
                                        <input
                                            type="file"
                                            accept="image/*"
                                            onChange={handleAvatarChange}
                                            style={{ display: "none" }}
                                            disabled={uploading}
                                        />
                                    </label>
                                )}
                            </div>
                            {/* 상태 도트 */}
                            <span
                                style={{
                                    position: "absolute",
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    bottom: 5,
                                    right: 5,
                                    width: 14,
                                    height: 14,
                                    borderRadius: "50%",
                                    background: sc.dot,
                                    border: "2.5px solid #fff",
                                    boxShadow: `0 0 0 2px ${sc.dot}55`,
                                }}
                            />
                        </div>

                        {/* 통계 카드 — z-index 명시적으로 설정 */}
                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                paddingBottom: 2,
                                position: "relative",
                                zIndex: 2,
                            }}
                        >
                            {STAT_ITEMS.map(
                                ({ label, value, color, bg, border }) => (
                                    <div
                                        key={label}
                                        style={{
                                            display: "flex",
                                            flexDirection: "column",
                                            alignItems: "center",
                                            minWidth: 68,
                                            padding: "9px 14px",
                                            background: bg,
                                            border: `1px solid ${border}`,
                                            borderRadius: 12,
                                        }}
                                    >
                                        <span
                                            style={{
                                                fontSize: 22,
                                                fontWeight: 900,
                                                color,
                                                lineHeight: 1,
                                                letterSpacing: "-0.02em",
                                            }}
                                        >
                                            {value}
                                        </span>
                                        <span
                                            style={{
                                                fontSize: 10,
                                                color: "#6b7280",
                                                marginTop: 4,
                                                whiteSpace: "nowrap",
                                                fontWeight: 500,
                                            }}
                                        >
                                            {label}
                                        </span>
                                    </div>
                                ),
                            )}
                        </div>
                    </div>

                    {/* 이름 & 상태 행 */}
                    {editing ? (
                        <div
                            style={{
                                marginTop: 12,
                                display: "flex",
                                gap: 8,
                                alignItems: "center",
                                flexWrap: "wrap",
                            }}
                        >
                            <input
                                value={form.name}
                                onChange={(e) =>
                                    setForm((p) => ({
                                        ...p,
                                        name: e.target.value,
                                    }))
                                }
                                style={{
                                    ...inputStyle,
                                    fontSize: 16,
                                    fontWeight: 700,
                                    width: 160,
                                }}
                            />
                            <div style={{ display: "flex", gap: 5 }}>
                                {STATUSES.map((s) => {
                                    const c = STATUS_COLOR[s];
                                    const active = form.status === s;
                                    return (
                                        <button
                                            key={s}
                                            type="button"
                                            onClick={() =>
                                                setForm((p) => ({
                                                    ...p,
                                                    status: s,
                                                }))
                                            }
                                            style={{
                                                display: "inline-flex",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: 4,
                                                padding: "4px 12px",
                                                borderRadius: 99,
                                                cursor: "pointer",
                                                fontFamily: "inherit",
                                                fontSize: 12,
                                                fontWeight: active ? 700 : 500,
                                                border: `1.5px solid ${active ? c.border : "#e5e7eb"}`,
                                                background: active
                                                    ? c.bg
                                                    : "#fff",
                                                color: active
                                                    ? c.text
                                                    : "#9ca3af",
                                                transition: "all 0.1s",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    width: 6,
                                                    height: 6,
                                                    borderRadius: "50%",
                                                    background: active
                                                        ? c.dot
                                                        : "#d1d5db",
                                                    display: "inline-block",
                                                }}
                                            />
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>
                            <div
                                style={{
                                    display: "flex",
                                    gap: 6,
                                    marginLeft: "auto",
                                }}
                            >
                                <button
                                    onClick={() => {
                                        setEditing(false);
                                        setForm({
                                            name: designer.name,
                                            status: designer.status,
                                        });
                                        setBannerColor(
                                            designer.banner_color ?? null,
                                        );
                                    }}
                                    style={btn(false)}
                                >
                                    취소
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isPending}
                                    style={{
                                        ...btn(true),
                                        opacity: isPending ? 0.7 : 1,
                                    }}
                                >
                                    {isPending ? "저장 중..." : "저장"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div
                            style={{
                                marginTop: 10,
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                flexWrap: "wrap",
                            }}
                        >
                            <h2
                                style={{
                                    margin: 0,
                                    fontSize: 20,
                                    fontWeight: 900,
                                    color: "#111827",
                                    letterSpacing: "-0.02em",
                                }}
                            >
                                {designer.name}
                            </h2>
                            <span
                                style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 5,
                                    padding: "3px 11px",
                                    borderRadius: 99,
                                    fontSize: 12,
                                    fontWeight: 700,
                                    background: sc.bg,
                                    color: sc.text,
                                    border: `1px solid ${sc.border}`,
                                }}
                            >
                                <span
                                    style={{
                                        width: 6,
                                        height: 6,
                                        borderRadius: "50%",
                                        background: sc.dot,
                                        display: "inline-block",
                                    }}
                                />
                                {designer.status}
                            </span>
                            {isOwn && (
                                <button
                                    onClick={() => setEditing(true)}
                                    style={{
                                        marginLeft: "auto",
                                        padding: "4px 12px",
                                        border: "1px solid #e5e7eb",
                                        borderRadius: 7,
                                        background: "#fff",
                                        color: "#6b7280",
                                        fontWeight: 600,
                                        fontSize: 12,
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                        transition:
                                            "border-color 0.15s, color 0.15s",
                                    }}
                                    onMouseEnter={(e) => {
                                        (
                                            e.currentTarget as HTMLButtonElement
                                        ).style.borderColor = "#9ca3af";
                                        (
                                            e.currentTarget as HTMLButtonElement
                                        ).style.color = "#374151";
                                    }}
                                    onMouseLeave={(e) => {
                                        (
                                            e.currentTarget as HTMLButtonElement
                                        ).style.borderColor = "#e5e7eb";
                                        (
                                            e.currentTarget as HTMLButtonElement
                                        ).style.color = "#6b7280";
                                    }}
                                >
                                    ✎ 수정
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* ── 뮤직 카드 ── */}
            <MusicCard
                title={designer.music_title}
                link={designer.music_link}
                isOwn={isOwn}
                designerId={designer.id}
            />
        </div>
    );
}

// ─── 공통 스타일 ─────────────────────────────────────────────────────

const musicCardBase: React.CSSProperties = {
    background: "#f8fafc",
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    padding: "16px 20px",
    boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
};

const inputStyle: React.CSSProperties = {
    padding: "6px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 7,
    outline: "none",
    fontFamily: "inherit",
    fontSize: 13,
    color: "#111827",
    background: "#fff",
    boxSizing: "border-box",
};

function btn(primary: boolean): React.CSSProperties {
    return {
        padding: "5px 13px",
        fontWeight: 600,
        border: "1px solid",
        borderColor: primary ? "#111827" : "#e5e7eb",
        borderRadius: 7,
        cursor: "pointer",
        background: primary ? "#111827" : "#fff",
        color: primary ? "#fff" : "#374151",
        fontFamily: "inherit",
        fontSize: 12,
    };
}

function darkBtn(primary: boolean): React.CSSProperties {
    return {
        padding: "4px 11px",
        fontWeight: 600,
        border: "1px solid",
        borderColor: primary ? "#f9fafb" : "#e5e7eb",
        borderRadius: 7,
        cursor: "pointer",
        background: primary ? "#111827" : "#fff",
        color: primary ? "#f9fafb" : "#374151",
        fontFamily: "inherit",
        fontSize: 12,
    };
}
