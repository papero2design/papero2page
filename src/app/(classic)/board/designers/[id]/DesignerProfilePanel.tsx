// src/app/(classic)/board/designers/[id]/DesignerProfilePanel.tsx
"use client";

import { useState, useTransition } from "react";
import { uploadToR2 } from "@/lib/r2/upload";
import { updateMyProfile, updateMyAvatar, updateMyMusic } from "./actions";

type Designer = {
    id: string;
    name: string;
    status: string;
    avatar_url: string | null;
    music_title: string | null;
    music_link: string | null;
};

const STATUSES = ["여유", "작업중", "바쁨"] as const;
const STATUS_COLOR: Record<
    string,
    { dot: string; bg: string; text: string; border: string }
> = {
    여유: { dot: "#1ED67D", bg: "#f0fdf4", text: "#15803d", border: "#86efac" },
    작업중: { dot: "#f59e0b", bg: "#fffbeb", text: "#b45309", border: "#fde68a" },
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

    const ytId = form.link ? getYouTubeId(form.link) : null;
    const savedYtId = link ? getYouTubeId(link) : null;
    const thumbUrl = savedYtId
        ? `https://img.youtube.com/vi/${savedYtId}/mqdefault.jpg`
        : null;

    const handleSave = () => {
        startTransition(async () => {
            try {
                await updateMyMusic(designerId, {
                    music_title: form.title.trim() || null,
                    music_link: form.link.trim() || null,
                });
                setEditing(false);
            } catch (err) {
                alert((err as Error).message);
            }
        });
    };

    const handleClear = () => {
        startTransition(async () => {
            await updateMyMusic(designerId, { music_title: null, music_link: null });
            setForm({ title: "", link: "" });
        });
    };

    if (editing) {
        const previewYtId = form.link ? getYouTubeId(form.link) : null;
        const previewThumb = previewYtId
            ? `https://img.youtube.com/vi/${previewYtId}/mqdefault.jpg`
            : null;

        return (
            <div
                style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: 16,
                    display: "flex",
                    flexDirection: "column",
                    gap: 10,
                }}
            >
                <p style={{ margin: 0, fontWeight: 700, color: "#374151", fontSize: 13 }}>
                    🎵 지금 듣는 음악
                </p>

                {previewThumb && (
                    <img
                        src={previewThumb}
                        alt="preview"
                        style={{ width: "100%", borderRadius: 8, objectFit: "cover", maxHeight: 120 }}
                    />
                )}

                <input
                    value={form.title}
                    onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                    placeholder="곡 제목"
                    style={inputStyle}
                />
                <input
                    value={form.link}
                    onChange={(e) => setForm((p) => ({ ...p, link: e.target.value }))}
                    placeholder="YouTube / Spotify 링크"
                    style={inputStyle}
                />

                <div style={{ display: "flex", gap: 6 }}>
                    <button
                        onClick={() => { setEditing(false); setForm({ title: title ?? "", link: link ?? "" }); }}
                        style={btn(false)}
                    >
                        취소
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isPending}
                        style={{ ...btn(true), flex: 1, opacity: isPending ? 0.7 : 1 }}
                    >
                        {isPending ? "저장 중..." : "저장"}
                    </button>
                </div>
            </div>
        );
    }

    if (!title && !link) {
        if (!isOwn) return null;
        return (
            <button
                onClick={() => setEditing(true)}
                style={{
                    width: "100%",
                    padding: "12px",
                    border: "1.5px dashed #d1d5db",
                    borderRadius: 12,
                    background: "transparent",
                    color: "#9ca3af",
                    cursor: "pointer",
                    fontFamily: "inherit",
                    fontSize: 13,
                    textAlign: "center",
                    transition: "border-color 0.1s, color 0.1s",
                }}
                onMouseEnter={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#6b7280";
                    (e.currentTarget as HTMLButtonElement).style.color = "#374151";
                }}
                onMouseLeave={(e) => {
                    (e.currentTarget as HTMLButtonElement).style.borderColor = "#d1d5db";
                    (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af";
                }}
            >
                🎵 지금 듣는 음악 추가하기
            </button>
        );
    }

    return (
        <div
            style={{
                background: "#111827",
                borderRadius: 12,
                overflow: "hidden",
                position: "relative",
            }}
        >
            {thumbUrl && (
                <div style={{ position: "relative" }}>
                    <img
                        src={thumbUrl}
                        alt={title ?? ""}
                        style={{ width: "100%", display: "block", opacity: 0.7 }}
                    />
                    {/* 재생 오버레이 */}
                    <a
                        href={link ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        <div
                            style={{
                                width: 44,
                                height: 44,
                                borderRadius: "50%",
                                background: "rgba(255,255,255,0.9)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                boxShadow: "0 2px 12px rgba(0,0,0,0.3)",
                            }}
                        >
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="#111827">
                                <path d="M8 5v14l11-7z" />
                            </svg>
                        </div>
                    </a>
                </div>
            )}

            <div
                style={{
                    padding: "12px 14px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                }}
            >
                <div style={{ minWidth: 0 }}>
                    <div
                        style={{
                            fontSize: 10,
                            color: "#6b7280",
                            fontWeight: 600,
                            letterSpacing: "0.05em",
                            textTransform: "uppercase",
                            marginBottom: 2,
                        }}
                    >
                        🎵 Now Playing
                    </div>
                    {link ? (
                        <a
                            href={link}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: "#fff",
                                fontWeight: 700,
                                fontSize: 13,
                                textDecoration: "none",
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {title || link}
                        </a>
                    ) : (
                        <span
                            style={{
                                color: "#fff",
                                fontWeight: 700,
                                fontSize: 13,
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                            }}
                        >
                            {title}
                        </span>
                    )}
                </div>

                {isOwn && (
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                        <button
                            onClick={() => setEditing(true)}
                            style={{
                                padding: "4px 8px",
                                border: "1px solid #374151",
                                borderRadius: 6,
                                background: "transparent",
                                color: "#9ca3af",
                                cursor: "pointer",
                                fontSize: 11,
                                fontFamily: "inherit",
                            }}
                        >
                            수정
                        </button>
                        <button
                            onClick={handleClear}
                            style={{
                                padding: "4px 8px",
                                border: "1px solid #374151",
                                borderRadius: 6,
                                background: "transparent",
                                color: "#6b7280",
                                cursor: "pointer",
                                fontSize: 11,
                                fontFamily: "inherit",
                            }}
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

export default function DesignerProfilePanel({
    designer,
    stats,
    isOwn,
}: {
    designer: Designer;
    stats: Stats;
    isOwn: boolean;
}) {
    const [editing, setEditing] = useState(false);
    const [form, setForm] = useState({
        name: designer.name,
        status: designer.status,
    });
    const [uploading, setUploading] = useState(false);
    const [isPending, startTransition] = useTransition();

    const sc = STATUS_COLOR[designer.status] ?? STATUS_COLOR["여유"];

    const handleAvatarChange = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const { publicUrl } = await uploadToR2("avatars", file);
            await updateMyAvatar(designer.id, publicUrl);
        } catch (err) {
            alert("업로드 실패: " + (err as Error).message);
        } finally {
            setUploading(false);
        }
    };

    const handleSave = () => {
        if (!form.name.trim()) {
            alert("이름을 입력해주세요.");
            return;
        }
        startTransition(async () => {
            try {
                await updateMyProfile(designer.id, form);
                setEditing(false);
            } catch (err) {
                alert((err as Error).message);
            }
        });
    };

    return (
        <div
            style={{
                display: "grid",
                gridTemplateColumns: "200px 1fr 220px",
                gap: 16,
                marginBottom: 24,
                alignItems: "start",
            }}
        >
            {/* 1. 프로필 카드 */}
            <div
                style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: "20px 16px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                }}
            >
                {/* 아바타 */}
                <div style={{ position: "relative" }}>
                    {designer.avatar_url ? (
                        <img
                            src={designer.avatar_url}
                            alt={designer.name}
                            style={{
                                width: 88,
                                height: 88,
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "3px solid #fff",
                                boxShadow: "0 0 0 2px #e5e7eb",
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                width: 88,
                                height: 88,
                                borderRadius: "50%",
                                background: "#e5e7eb",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 800,
                                color: "#6b7280",
                                fontSize: 30,
                                border: "3px solid #fff",
                                boxShadow: "0 0 0 2px #e5e7eb",
                            }}
                        >
                            {designer.name[0]}
                        </div>
                    )}
                    {isOwn && (
                        <label
                            style={{
                                position: "absolute",
                                bottom: 2,
                                right: 2,
                                width: 24,
                                height: 24,
                                borderRadius: "50%",
                                background: "#111827",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                border: "2px solid #fff",
                                fontSize: 12,
                            }}
                            title="사진 변경"
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

                {editing ? (
                    <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: 8 }}>
                        <input
                            value={form.name}
                            onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                            style={{ ...inputStyle, textAlign: "center", fontWeight: 700 }}
                        />
                        <div style={{ display: "flex", gap: 4, justifyContent: "center", flexWrap: "wrap" }}>
                            {STATUSES.map((s) => {
                                const c = STATUS_COLOR[s];
                                return (
                                    <button
                                        key={s}
                                        type="button"
                                        onClick={() => setForm((p) => ({ ...p, status: s }))}
                                        style={{
                                            padding: "3px 10px",
                                            borderRadius: 99,
                                            border: "1px solid",
                                            borderColor: form.status === s ? c.border : "#e5e7eb",
                                            background: form.status === s ? c.bg : "#fff",
                                            color: form.status === s ? c.text : "#6b7280",
                                            fontWeight: form.status === s ? 700 : 400,
                                            cursor: "pointer",
                                            fontFamily: "inherit",
                                        }}
                                    >
                                        {s}
                                    </button>
                                );
                            })}
                        </div>
                        <div style={{ display: "flex", gap: 6 }}>
                            <button
                                onClick={() => { setEditing(false); setForm({ name: designer.name, status: designer.status }); }}
                                style={btn(false)}
                            >
                                취소
                            </button>
                            <button
                                onClick={handleSave}
                                disabled={isPending}
                                style={{ ...btn(true), flex: 1, opacity: isPending ? 0.7 : 1 }}
                            >
                                {isPending ? "저장 중..." : "저장"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <span style={{ fontWeight: 800, color: "#111827", fontSize: 16 }}>
                            {designer.name}
                        </span>
                        <span
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "3px 12px",
                                borderRadius: 99,
                                background: sc.bg,
                                color: sc.text,
                                fontWeight: 700,
                                border: `1px solid ${sc.border}`,
                                fontSize: 13,
                            }}
                        >
                            <span
                                style={{
                                    width: 7,
                                    height: 7,
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
                                style={{ ...btn(false), width: "100%", textAlign: "center" }}
                            >
                                ✎ 프로필 수정
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* 2. 통계 카드 */}
            <div
                style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: 10,
                    alignContent: "start",
                }}
            >
                {[
                    { label: "진행 중", value: stats.active, color: "#111827", bg: "#f9fafb" },
                    { label: "완료", value: stats.done, color: "#15803d", bg: "#f0fdf4" },
                    { label: "우선작업", value: stats.priority, color: "#dc2626", bg: "#fef2f2" },
                ].map(({ label, value, color, bg }) => (
                    <div
                        key={label}
                        style={{
                            padding: "16px 12px",
                            background: bg,
                            border: "1px solid #e5e7eb",
                            borderRadius: 10,
                            textAlign: "center",
                        }}
                    >
                        <div style={{ fontWeight: 800, fontSize: 28, color }}>{value}</div>
                        <div style={{ color: "#6b7280", marginTop: 2, fontSize: 12 }}>{label}</div>
                    </div>
                ))}
            </div>

            {/* 3. 음악 카드 */}
            <MusicCard
                title={designer.music_title}
                link={designer.music_link}
                isOwn={isOwn}
                designerId={designer.id}
            />
        </div>
    );
}

const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "6px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
};

function btn(primary: boolean): React.CSSProperties {
    return {
        padding: "6px 12px",
        fontWeight: 600,
        border: "1px solid",
        borderColor: primary ? "#111827" : "#e5e7eb",
        borderRadius: 6,
        cursor: "pointer",
        background: primary ? "#111827" : "#fff",
        color: primary ? "#fff" : "#374151",
        fontFamily: "inherit",
        fontSize: 13,
    };
}
