// src/app/(classic)/board/designers/[id]/DesignerProfilePanel.tsx
"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { updateMyProfile, updateMyAvatar } from "./actions";

type Designer = {
    id: string;
    name: string;
    status: string;
    avatar_url: string | null;
};

const STATUSES = ["여유", "작업중", "바쁨"] as const;
const STATUS_COLOR: Record<
    string,
    { dot: string; bg: string; text: string; border: string }
> = {
    여유: { dot: "#1ED67D", bg: "#f0fdf4", text: "#15803d", border: "#86efac" },
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
    const supabase = createClient();

    const sc = STATUS_COLOR[designer.status] ?? STATUS_COLOR["여유"];

    const handleAvatarChange = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const ext = file.name.split(".").pop();
            const path = `${designer.id}.${ext}?t=${Date.now()}`;
            const { error } = await supabase.storage
                .from("avatars")
                .upload(path, file, { upsert: true });
            if (error) throw error;
            const { data } = supabase.storage
                .from("avatars")
                .getPublicUrl(path);
            await updateMyAvatar(designer.id, data.publicUrl);
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
                display: "flex",
                gap: 20,
                flexWrap: "wrap",
                marginBottom: 24,
            }}
        >
            {/* 프로필 카드 */}
            <div
                style={{
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: "24px 20px",
                    minWidth: 220,
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 12,
                }}
            >
                {/* 아바타 */}
                <div style={{ position: "relative" }}>
                    {designer.avatar_url ? (
                        <img
                            src={designer.avatar_url}
                            alt={designer.name}
                            style={{
                                width: 96,
                                height: 96,
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "3px solid #fff",
                                boxShadow: "0 0 0 2px #e5e7eb",
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                width: 96,
                                height: 96,
                                borderRadius: "50%",
                                background: "#e5e7eb",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 800,
                                color: "#6b7280",
                                fontSize: 32,
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
                                width: 26,
                                height: 26,
                                borderRadius: "50%",
                                background: "#111827",
                                color: "#fff",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                border: "2px solid #fff",
                                fontSize: 13,
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

                {/* 이름 + 상태 */}
                {editing ? (
                    <div
                        style={{
                            width: "100%",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                        }}
                    >
                        <input
                            value={form.name}
                            onChange={(e) =>
                                setForm((p) => ({ ...p, name: e.target.value }))
                            }
                            style={{
                                width: "100%",
                                padding: "6px 10px",
                                border: "1px solid #d1d5db",
                                borderRadius: 6,
                                outline: "none",
                                fontFamily: "inherit",
                                textAlign: "center",
                                fontWeight: 700,
                                boxSizing: "border-box",
                            }}
                        />
                        <div
                            style={{
                                display: "flex",
                                gap: 4,
                                justifyContent: "center",
                                flexWrap: "wrap",
                            }}
                        >
                            {STATUSES.map((s) => {
                                const c = STATUS_COLOR[s];
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
                                            padding: "3px 10px",
                                            borderRadius: 99,
                                            border: "1px solid",
                                            borderColor:
                                                form.status === s
                                                    ? c.border
                                                    : "#e5e7eb",
                                            background:
                                                form.status === s
                                                    ? c.bg
                                                    : "#fff",
                                            color:
                                                form.status === s
                                                    ? c.text
                                                    : "#6b7280",
                                            fontWeight:
                                                form.status === s ? 700 : 400,
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
                                onClick={() => {
                                    setEditing(false);
                                    setForm({
                                        name: designer.name,
                                        status: designer.status,
                                    });
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
                                    flex: 1,
                                    opacity: isPending ? 0.7 : 1,
                                }}
                            >
                                {isPending ? "저장 중..." : "저장"}
                            </button>
                        </div>
                    </div>
                ) : (
                    <>
                        <span
                            style={{
                                fontWeight: 800,
                                color: "#111827",
                                fontSize: 17,
                            }}
                        >
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
                                style={{
                                    ...btn(false),
                                    width: "100%",
                                    textAlign: "center",
                                }}
                            >
                                ✎ 프로필 수정
                            </button>
                        )}
                    </>
                )}
            </div>

            {/* 통계 카드들 */}
            <div
                style={{
                    flex: 1,
                    display: "flex",
                    flexDirection: "column",
                    gap: 12,
                    minWidth: 260,
                }}
            >
                {/* 요약 */}
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(3, 1fr)",
                        gap: 10,
                    }}
                >
                    {[
                        {
                            label: "진행 중",
                            value: stats.active,
                            color: "#111827",
                            bg: "#f9fafb",
                        },
                        {
                            label: "완료",
                            value: stats.done,
                            color: "#15803d",
                            bg: "#f0fdf4",
                        },
                        {
                            label: "우선작업",
                            value: stats.priority,
                            color: "#dc2626",
                            bg: "#fef2f2",
                        },
                    ].map(({ label, value, color, bg }) => (
                        <div
                            key={label}
                            style={{
                                padding: "14px 16px",
                                background: bg,
                                border: "1px solid #e5e7eb",
                                borderRadius: 10,
                                textAlign: "center",
                            }}
                        >
                            <div
                                style={{ fontWeight: 800, fontSize: 24, color }}
                            >
                                {value}
                            </div>
                            <div
                                style={{
                                    color: "#6b7280",
                                    marginTop: 2,
                                    fontSize: 13,
                                }}
                            >
                                {label}
                            </div>
                        </div>
                    ))}
                </div>

                {/* 상태별 */}
                <div
                    style={{
                        background: "#fff",
                        border: "1px solid #e5e7eb",
                        borderRadius: 10,
                        padding: "14px 16px",
                    }}
                >
                    <p
                        style={{
                            margin: "0 0 10px",
                            fontWeight: 700,
                            color: "#374151",
                        }}
                    >
                        상태별 작업
                    </p>
                    <div style={{ display: "flex", gap: 8 }}>
                        {[
                            {
                                label: "대기중",
                                bg: "#f4f4f5",
                                color: "#71717a",
                                border: "#e4e4e7",
                            },
                            {
                                label: "진행중",
                                bg: "#fffbeb",
                                color: "#b45309",
                                border: "#fde68a",
                            },
                            {
                                label: "검수대기",
                                bg: "#eff6ff",
                                color: "#1d4ed8",
                                border: "#bfdbfe",
                            },
                        ].map(({ label, bg, color, border }) => (
                            <div
                                key={label}
                                style={{
                                    flex: 1,
                                    padding: "10px 8px",
                                    background: bg,
                                    border: `1px solid ${border}`,
                                    borderRadius: 8,
                                    textAlign: "center",
                                }}
                            >
                                <div
                                    style={{
                                        fontWeight: 800,
                                        fontSize: 20,
                                        color,
                                    }}
                                >
                                    {stats.statusMap[label] ?? 0}
                                </div>
                                <div
                                    style={{
                                        color,
                                        fontSize: 12,
                                        fontWeight: 600,
                                        marginTop: 2,
                                    }}
                                >
                                    {label}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}

function btn(primary: boolean): React.CSSProperties {
    return {
        padding: "6px 14px",
        fontWeight: 600,
        border: "1px solid",
        borderColor: primary ? "#111827" : "#e5e7eb",
        borderRadius: 6,
        cursor: "pointer",
        background: primary ? "#111827" : "#fff",
        color: primary ? "#fff" : "#374151",
        fontFamily: "inherit",
    };
}
