// src/app/(classic)/board/FileUploadField.tsx
"use client";

import { useState } from "react";
import { uploadToR2 } from "@/lib/r2/upload";

// 이미 업로드된 파일 (DB에서 조회)
export interface ExistingFile {
    id: string;
    name: string;
    url: string;
    size?: number | null;
}

interface Props {
    // 새로 추가할 파일 (아직 업로드 전)
    files: File[];
    onChange: (files: File[]) => void;
    // 이미 업로드된 파일 (선택)
    existingFiles?: ExistingFile[];
    onDeleteExisting?: (id: string) => void;
}

export default function FileUploadField({
    files,
    onChange,
    existingFiles,
    onDeleteExisting,
}: Props) {
    const [inputKey, setInputKey] = useState(0);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const picked = Array.from(e.target.files ?? []);
        if (picked.length > 0) onChange([...files, ...picked]);
        setInputKey((k) => k + 1);
    };

    const removeNew = (i: number, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onChange(files.filter((_, j) => j !== i));
    };

    const removeExisting = (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onDeleteExisting?.(id);
    };

    const fmtSize = (bytes?: number | null) => {
        if (!bytes) return "";
        return bytes >= 1024 * 1024
            ? `${(bytes / 1024 / 1024).toFixed(1)}MB`
            : `${Math.round(bytes / 1024)}KB`;
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {/* 이미 업로드된 파일 */}
            {existingFiles?.map((f) => (
                <div
                    key={f.id}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 10px",
                        borderRadius: 6,
                        background: "#f9fafb",
                        border: "1px solid #e5e7eb",
                    }}
                >
                    <span style={{ fontSize: 14 }}>📄</span>
                    <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            flex: 1,
                            wordBreak: "break-all",
                            color: "#374151",
                            fontSize: 13,
                            textDecoration: "none",
                            fontWeight: 500,
                        }}
                        onMouseEnter={(e) =>
                            (e.currentTarget.style.color = "#1ED67D")
                        }
                        onMouseLeave={(e) =>
                            (e.currentTarget.style.color = "#374151")
                        }
                    >
                        {f.name}
                    </a>
                    {f.size && (
                        <span
                            style={{
                                color: "#9ca3af",
                                fontSize: 12,
                                flexShrink: 0,
                            }}
                        >
                            {fmtSize(f.size)}
                        </span>
                    )}
                    <a
                        href={f.url}
                        download={f.name}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            color: "#1ED67D",
                            fontSize: 12,
                            fontWeight: 600,
                            flexShrink: 0,
                            textDecoration: "none",
                        }}
                    >
                        ↓
                    </a>
                    {onDeleteExisting && (
                        <button
                            type="button"
                            onClick={(e) => removeExisting(f.id, e)}
                            style={{
                                background: "none",
                                border: "none",
                                cursor: "pointer",
                                color: "#d1d5db",
                                padding: "0 2px",
                                lineHeight: 1,
                                flexShrink: 0,
                            }}
                        >
                            ✕
                        </button>
                    )}
                </div>
            ))}

            {/* 새로 추가할 파일 */}
            {files.map((f, i) => (
                <div
                    key={i}
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 10px",
                        borderRadius: 6,
                        background: "#f0fdf4",
                        border: "1px solid #86efac",
                    }}
                >
                    <span style={{ fontSize: 14 }}>📎</span>
                    <span
                        style={{
                            flex: 1,
                            wordBreak: "break-all",
                            color: "#15803d",
                            fontSize: 13,
                        }}
                    >
                        {f.name}
                    </span>
                    <span
                        style={{
                            color: "#9ca3af",
                            fontSize: 12,
                            flexShrink: 0,
                        }}
                    >
                        {fmtSize(f.size)}
                    </span>
                    <button
                        type="button"
                        onClick={(e) => removeNew(i, e)}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#9ca3af",
                            padding: "0 2px",
                            lineHeight: 1,
                            flexShrink: 0,
                        }}
                    >
                        ✕
                    </button>
                </div>
            ))}

            {/* 파일 선택 버튼 */}
            <label
                style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "6px 14px",
                    border: "1px dashed #d1d5db",
                    borderRadius: 6,
                    background: "#f9fafb",
                    cursor: "pointer",
                    color: "#6b7280",
                    userSelect: "none",
                    width: "fit-content",
                }}
            >
                <span>📎</span>
                <span>
                    {existingFiles !== undefined
                        ? "+ 파일 추가"
                        : "파일 선택 (복수 가능)"}
                </span>
                <input
                    key={inputKey}
                    type="file"
                    multiple
                    style={{
                        position: "absolute",
                        opacity: 0,
                        width: 0,
                        height: 0,
                        pointerEvents: "none",
                    }}
                    onChange={handleChange}
                />
            </label>
        </div>
    );
}

export { uploadToR2 };
