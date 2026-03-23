// src/app/(classic)/board/designers/DesignerManageClient.tsx
"use client";

import { useState, useEffect, useTransition } from "react";
import { uploadToR2 } from "@/lib/r2/upload";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "../Toast";
import {
    createDesignerAccount,
    updateDesigner,
    updateDesignerAvatar,
    deactivateDesigner,
    resetDesignerPassword,
    linkDesignerAccount,
    reactivateDesigner,
    changeDesignerEmail,
    hardDeleteDesigner,
} from "./actions";

type Designer = {
    id: string;
    name: string;
    status: string;
    is_active: boolean;
    avatar_url: string | null;
    user_id: string | null;
    email: string;
};

const STATUSES = ["연차", "반차", "외출", "작업중", "바쁨"] as const;
const STATUS_COLOR: Record<string, { dot: string; bg: string; text: string }> =
    {
        연차: { dot: "#94a3b8", bg: "#f8fafc", text: "#475569" },
        반차: { dot: "#a78bfa", bg: "#f5f3ff", text: "#6d28d9" },
        외출: { dot: "#f97316", bg: "#fff7ed", text: "#c2410c" },
        작업중: { dot: "#f59e0b", bg: "#fffbeb", text: "#b45309" },
        바쁨: { dot: "#ef4444", bg: "#fef2f2", text: "#dc2626" },
    };

// ─── 계정 생성 모달 ───────────────────────────────────────────
function CreateModal({
    onClose,
    onCreated,
}: {
    onClose: () => void;
    onCreated: () => void;
}) {
    const [form, setForm] = useState({
        name: "",
        email: "",
        password: "",
    });
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState("");

    const handleCreate = () => {
        if (!form.name.trim() || !form.email.trim() || !form.password.trim()) {
            setError("이름, 이메일, 비밀번호는 필수입니다.");
            return;
        }
        if (form.password.length < 6) {
            setError("비밀번호는 6자 이상이어야 합니다.");
            return;
        }
        setError("");
        startTransition(async () => {
            try {
                await createDesignerAccount({ ...form, status: "작업중" });
                onCreated();
                onClose();
            } catch (err) {
                setError((err as Error).message);
            }
        });
    };

    return (
        <div
            onClick={onClose}
            style={{
                position: "fixed",
                inset: 0,
                background: "rgba(0,0,0,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: 16,
            }}
        >
            <div
                onClick={(e) => e.stopPropagation()}
                style={{
                    background: "#fff",
                    borderRadius: 8,
                    width: "100%",
                    maxWidth: 440,
                    boxShadow: "0 20px 60px rgba(0,0,0,0.2)",
                    fontFamily: "inherit",
                }}
            >
                <div
                    style={{
                        padding: "16px 20px",
                        borderBottom: "1px solid #e5e7eb",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                    }}
                >
                    <span style={{ fontWeight: 800, color: "#111827" }}>
                        디자이너 계정 추가
                    </span>
                    <button
                        onClick={onClose}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#9ca3af",
                        }}
                    >
                        ✕
                    </button>
                </div>
                <div
                    style={{
                        padding: "16px 20px",
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    {error && (
                        <div
                            style={{
                                padding: "8px 12px",
                                background: "#fef2f2",
                                border: "1px solid #fecaca",
                                borderRadius: 6,
                                color: "#dc2626",
                                fontWeight: 600,
                            }}
                        >
                            ⚠ {error}
                        </div>
                    )}
                    <label className="flex justify-center " style={labelStyle}>
                        <span className="w-15 flex self-center">이름</span>
                        <span style={{ color: "#ef4444" }}>*</span>
                        <input
                            value={form.name}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    name: e.target.value,
                                }))
                            }
                            placeholder="홍길동"
                            style={inputStyle}
                        />
                    </label>
                    <label style={labelStyle}>
                        <span className="w-15 self-center">이메일</span>
                        <span style={{ color: "#ef4444" }}>*</span>
                        <input
                            type="email"
                            value={form.email}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    email: e.target.value,
                                }))
                            }
                            placeholder="designer@example.com"
                            style={inputStyle}
                        />
                    </label>
                    <label style={labelStyle}>
                        <span className="w-15 self-center">비밀번호</span>

                        <span style={{ color: "#ef4444" }}>*</span>
                        <input
                            type="password"
                            value={form.password}
                            onChange={(e) =>
                                setForm((p) => ({
                                    ...p,
                                    password: e.target.value,
                                }))
                            }
                            placeholder="6자 이상"
                            style={inputStyle}
                        />
                    </label>
                </div>
                <div
                    style={{
                        padding: "12px 20px",
                        borderTop: "1px solid #e5e7eb",
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 8,
                    }}
                >
                    <button onClick={onClose} style={btn(false)}>
                        취소
                    </button>
                    <button
                        onClick={handleCreate}
                        disabled={isPending}
                        style={{ ...btn(true), opacity: isPending ? 0.7 : 1 }}
                    >
                        {isPending ? "생성 중..." : "계정 생성"}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── 디자이너 카드 ────────────────────────────────────────────
function DesignerCard({
    designer,
    onRefresh,
}: {
    designer: Designer;
    onRefresh: () => void;
}) {
    const [editing, setEditing] = useState(false);
    const [editForm, setEditForm] = useState({
        name: designer.name,
        status: designer.status,
    });
    const [pwModal, setPwModal] = useState(false);
    const [newPw, setNewPw] = useState("");
    const [linkModal, setLinkModal] = useState(false);
    const [linkForm, setLinkForm] = useState({ email: "", password: "" });
    const [emailModal, setEmailModal] = useState(false);
    const [newEmail, setNewEmail] = useState("");
    const [isPending, startTransition] = useTransition();
    const [uploading, setUploading] = useState(false);
    const { showToast, ToastUI } = useToast();

    const sc = STATUS_COLOR[designer.status] ?? STATUS_COLOR["작업중"];

    // 아바타 업로드
    const handleAvatarChange = async (
        e: React.ChangeEvent<HTMLInputElement>,
    ) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        try {
            const { publicUrl } = await uploadToR2("avatars", file);
            await updateDesignerAvatar(designer.id, publicUrl);
            onRefresh();
        } catch (err) {
            showToast("업로드 실패: " + (err as Error).message);
        } finally {
            setUploading(false);
        }
    };

    const handleSave = () => {
        startTransition(async () => {
            try {
                await updateDesigner(designer.id, {
                    ...editForm,
                    is_active: designer.is_active,
                });
                setEditing(false);
                onRefresh();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    const handleDeactivate = () => {
        if (!confirm(`"${designer.name}" 계정을 비활성화할까요?`)) return;
        startTransition(async () => {
            try {
                await deactivateDesigner(designer.id);
                onRefresh();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    const handleReactivate = () => {
        if (!confirm(`"${designer.name}" 계정을 다시 활성화할까요?`)) return;
        startTransition(async () => {
            try {
                await reactivateDesigner(designer.id);
                onRefresh();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    const handleHardDelete = () => {
        if (
            !confirm(
                `"${designer.name}"을(를) 영구삭제할까요?\n\n담당 작업은 모두 미배정으로 변경되며, 이 작업은 되돌릴 수 없습니다.`,
            )
        )
            return;
        startTransition(async () => {
            try {
                await hardDeleteDesigner(designer.id);
                onRefresh();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    const handleLink = () => {
        if (!linkForm.email.trim() || linkForm.password.length < 6) {
            showToast("이메일과 비밀번호(6자 이상)를 입력하세요.");
            return;
        }
        startTransition(async () => {
            try {
                await linkDesignerAccount(designer.id, linkForm);
                setLinkModal(false);
                setLinkForm({ email: "", password: "" });
                onRefresh();
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    const handleChangeEmail = () => {
        if (!newEmail.trim()) {
            showToast("새 이메일을 입력하세요.");
            return;
        }
        startTransition(async () => {
            try {
                await changeDesignerEmail(designer.user_id!, newEmail.trim());
                setEmailModal(false);
                setNewEmail("");
                showToast("이메일이 변경됐습니다.", "success");
                onRefresh();
            } catch (err) {
                const msg = (err as Error).message;
                showToast(msg);
                // user_id가 초기화된 경우 UI도 갱신
                if (msg.includes("계정 연결이 초기화")) {
                    setEmailModal(false);
                    onRefresh();
                }
            }
        });
    };

    const handlePwReset = () => {
        if (!designer.user_id) {
            showToast("연결된 계정이 없습니다.");
            return;
        }
        if (newPw.length < 6) {
            showToast("6자 이상 입력하세요.");
            return;
        }
        startTransition(async () => {
            try {
                await resetDesignerPassword(designer.user_id!, newPw);
                setPwModal(false);
                setNewPw("");
                showToast("비밀번호가 변경됐습니다.", "success");
            } catch (err) {
                showToast((err as Error).message);
            }
        });
    };

    return (
        <>
        {ToastUI}
        <div
            style={{
                background: "#fff",
                border: "1px solid #e5e7eb",
                borderRadius: 10,
                overflow: "hidden",
                opacity: designer.is_active ? 1 : 0.5,
                transition: "box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow =
                    "0 4px 16px rgba(0,0,0,0.08)";
            }}
            onMouseLeave={(e) => {
                (e.currentTarget as HTMLElement).style.boxShadow = "none";
            }}
        >
            {/* 프로필 상단 */}
            <div
                style={{
                    padding: "20px 20px 16px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                    background: "#f9fafb",
                    borderBottom: "1px solid #e5e7eb",
                }}
            >
                {/* 아바타 */}
                <div style={{ position: "relative" }}>
                    {designer.avatar_url ? (
                        <img
                            src={designer.avatar_url}
                            alt={designer.name}
                            style={{
                                width: 80,
                                height: 80,
                                borderRadius: "50%",
                                objectFit: "cover",
                                border: "3px solid #fff",
                                boxShadow: "0 0 0 2px #e5e7eb",
                            }}
                        />
                    ) : (
                        <div
                            style={{
                                width: 80,
                                height: 80,
                                borderRadius: "50%",
                                background: "#e5e7eb",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontWeight: 800,
                                color: "#6b7280",
                                fontSize: 28,
                                border: "3px solid #fff",
                                boxShadow: "0 0 0 2px #e5e7eb",
                            }}
                        >
                            {designer.name[0]}
                        </div>
                    )}
                    {/* 사진 변경 버튼 */}
                    <label
                        style={{
                            position: "absolute",
                            bottom: 0,
                            right: 0,
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
                            fontSize: 13,
                        }}
                        title="사진 변경"
                    >
                        {uploading ? "..." : "✎"}
                        <input
                            type="file"
                            accept="image/*"
                            onChange={handleAvatarChange}
                            style={{ display: "none" }}
                            disabled={uploading}
                        />
                    </label>
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
                            value={editForm.name}
                            onChange={(e) =>
                                setEditForm((p) => ({
                                    ...p,
                                    name: e.target.value,
                                }))
                            }
                            style={{
                                ...inputStyle,
                                textAlign: "center",
                                fontWeight: 700,
                            }}
                        />
                        <div
                            style={{
                                display: "flex",
                                flexWrap: "wrap",
                                gap: 5,
                                justifyContent: "center",
                            }}
                        >
                            {STATUSES.map((s) => (
                                <button
                                    key={s}
                                    type="button"
                                    onClick={() =>
                                        setEditForm((p) => ({
                                            ...p,
                                            status: s,
                                        }))
                                    }
                                    style={{
                                        padding: "4px 12px",
                                        borderRadius: 99,
                                        border: "1px solid",
                                        borderColor:
                                            editForm.status === s
                                                ? STATUS_COLOR[s].dot
                                                : "#e5e7eb",
                                        background:
                                            editForm.status === s
                                                ? STATUS_COLOR[s].bg
                                                : "#fff",
                                        color:
                                            editForm.status === s
                                                ? STATUS_COLOR[s].text
                                                : "#6b7280",
                                        fontWeight:
                                            editForm.status === s ? 700 : 400,
                                        cursor: "pointer",
                                        fontFamily: "inherit",
                                        whiteSpace: "nowrap",
                                    }}
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <span style={{ fontWeight: 800, color: "#111827" }}>
                            {designer.name}
                        </span>
                        <span
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 5,
                                padding: "3px 10px",
                                borderRadius: 99,
                                background: sc.bg,
                                color: sc.text,
                                fontWeight: 700,
                                border: "1px solid",
                                borderColor: sc.dot + "66",
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
                    </>
                )}

                {!designer.is_active && (
                    <span
                        style={{
                            padding: "2px 8px",
                            borderRadius: 99,
                            background: "#f3f4f6",
                            color: "#9ca3af",
                            fontWeight: 600,
                        }}
                    >
                        비활성
                    </span>
                )}
            </div>

            {/* 하단 액션 */}
            <div
                style={{
                    padding: "12px 16px",
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                }}
            >
                {/* 계정 연결 상태 */}
                <div
                    style={{
                        padding: "8px 0",
                        borderBottom: "1px solid #f3f4f6",
                    }}
                >
                    <div
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                            marginBottom: designer.user_id ? 6 : 0,
                        }}
                    >
                        <span
                            style={{
                                width: 7,
                                height: 7,
                                borderRadius: "50%",
                                background: designer.user_id
                                    ? "#1ED67D"
                                    : "#d1d5db",
                                display: "inline-block",
                                flexShrink: 0,
                            }}
                        />
                        <span
                            style={{
                                color: designer.user_id ? "#15803d" : "#9ca3af",
                                fontWeight: 600,
                            }}
                        >
                            {designer.user_id ? "계정 연결됨" : "계정 없음"}
                        </span>
                        {!designer.user_id && (
                            <button
                                onClick={() => setLinkModal(true)}
                                style={{
                                    marginLeft: "auto",
                                    padding: "2px 10px",
                                    border: "1px solid #bfdbfe",
                                    borderRadius: 6,
                                    background: "#eff6ff",
                                    color: "#1d4ed8",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                    fontFamily: "inherit",
                                }}
                            >
                                계정 연결
                            </button>
                        )}
                    </div>
                    {/* 연결된 이메일 표시 */}
                    {designer.user_id && designer.email && (
                        <div
                            style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 6,
                                padding: "4px 8px",
                                background: "#f9fafb",
                                borderRadius: 6,
                            }}
                        >
                            <span style={{ fontSize: 12, color: "#9ca3af" }}>
                                ✉
                            </span>
                            <span
                                style={{
                                    fontSize: 13,
                                    color: "#374151",
                                    fontWeight: 500,
                                    wordBreak: "break-all",
                                }}
                            >
                                {designer.email}
                            </span>
                        </div>
                    )}
                    {designer.user_id && !designer.email && (
                        <div
                            style={{
                                fontSize: 12,
                                color: "#d1d5db",
                                padding: "2px 0",
                            }}
                        >
                            이메일 정보 없음
                        </div>
                    )}
                </div>

                {editing ? (
                    <div style={{ display: "flex", gap: 6 }}>
                        <button
                            onClick={() => {
                                setEditing(false);
                                setEditForm({
                                    name: designer.name,
                                    status: designer.status,
                                });
                            }}
                            style={{
                                ...btn(false),
                                flex: 1,
                                textAlign: "center",
                            }}
                        >
                            취소
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={isPending}
                            style={{
                                ...btn(true),
                                flex: 1,
                                textAlign: "center",
                                opacity: isPending ? 0.7 : 1,
                            }}
                        >
                            {isPending ? "저장 중..." : "저장"}
                        </button>
                    </div>
                ) : (
                    <>
                        <button
                            onClick={() => setEditing(true)}
                            style={{
                                ...btn(false),
                                width: "100%",
                                textAlign: "center",
                            }}
                        >
                            ✎ 수정
                        </button>
                        {designer.user_id && (
                            <>
                                <button
                                    onClick={() => setEmailModal(true)}
                                    style={{
                                        ...btn(false),
                                        width: "100%",
                                        textAlign: "center",
                                        color: "#1d4ed8",
                                    }}
                                >
                                    계정 변경
                                </button>
                                <button
                                    onClick={() => setPwModal(true)}
                                    style={{
                                        ...btn(false),
                                        width: "100%",
                                        textAlign: "center",
                                        color: "#6b7280",
                                    }}
                                >
                                    비밀번호 변경
                                </button>
                            </>
                        )}
                        {designer.is_active ? (
                            <button
                                onClick={handleDeactivate}
                                disabled={isPending}
                                style={{
                                    width: "100%",
                                    padding: "6px",
                                    border: "1px solid #fecaca",
                                    borderRadius: 6,
                                    background: "#fff",
                                    color: "#ef4444",
                                    cursor: "pointer",
                                    fontWeight: 600,
                                    fontFamily: "inherit",
                                    opacity: isPending ? 0.5 : 1,
                                }}
                            >
                                비활성화
                            </button>
                        ) : (
                            <>
                                <button
                                    onClick={handleReactivate}
                                    disabled={isPending}
                                    style={{
                                        width: "100%",
                                        padding: "6px",
                                        border: "1px solid #86efac",
                                        borderRadius: 6,
                                        background: "#f0fdf4",
                                        color: "#15803d",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                        fontFamily: "inherit",
                                        opacity: isPending ? 0.5 : 1,
                                    }}
                                >
                                    ↩ 재활성화
                                </button>
                                <button
                                    onClick={handleHardDelete}
                                    disabled={isPending}
                                    style={{
                                        width: "100%",
                                        padding: "6px",
                                        border: "1px solid #fca5a5",
                                        borderRadius: 6,
                                        background: "#fff",
                                        color: "#dc2626",
                                        cursor: "pointer",
                                        fontWeight: 600,
                                        fontFamily: "inherit",
                                        opacity: isPending ? 0.5 : 1,
                                    }}
                                >
                                    영구삭제
                                </button>
                            </>
                        )}
                    </>
                )}
            </div>

            {/* 계정 변경 모달 */}
            {emailModal && (
                <div
                    onClick={() => setEmailModal(false)}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2000,
                        padding: 16,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: "#fff",
                            borderRadius: 8,
                            padding: 20,
                            width: 360,
                            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                            fontFamily: "inherit",
                        }}
                    >
                        <p
                            style={{
                                margin: "0 0 4px",
                                fontWeight: 700,
                                color: "#111827",
                            }}
                        >
                            계정 변경
                        </p>
                        <p style={{ margin: "0 0 14px", color: "#6b7280" }}>
                            {designer.name}의 로그인 이메일 주소를 변경합니다.
                        </p>
                        <input
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="새 이메일 주소"
                            autoFocus
                            style={{
                                width: "100%",
                                padding: "7px 10px",
                                border: "1px solid #d1d5db",
                                borderRadius: 6,
                                outline: "none",
                                fontFamily: "inherit",
                                boxSizing: "border-box",
                                marginBottom: 16,
                            }}
                        />
                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                justifyContent: "flex-end",
                            }}
                        >
                            <button
                                onClick={() => {
                                    setEmailModal(false);
                                    setNewEmail("");
                                }}
                                style={btn(false)}
                            >
                                취소
                            </button>
                            <button
                                onClick={handleChangeEmail}
                                disabled={isPending}
                                style={{
                                    ...btn(true),
                                    opacity: isPending ? 0.7 : 1,
                                }}
                            >
                                {isPending ? "변경 중..." : "변경"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 계정 연결 모달 */}
            {linkModal && (
                <div
                    onClick={() => setLinkModal(false)}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2000,
                        padding: 16,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: "#fff",
                            borderRadius: 8,
                            padding: 20,
                            width: 360,
                            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                            fontFamily: "inherit",
                        }}
                    >
                        <p
                            style={{
                                margin: "0 0 4px",
                                fontWeight: 700,
                                color: "#111827",
                            }}
                        >
                            계정 연결
                        </p>
                        <p style={{ margin: "0 0 14px", color: "#6b7280" }}>
                            {designer.name}의 로그인 계정을 생성합니다.
                        </p>
                        <div
                            style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 10,
                            }}
                        >
                            <label
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                    fontWeight: 600,
                                    color: "#374151",
                                }}
                            >
                                이메일
                                <input
                                    type="email"
                                    value={linkForm.email}
                                    onChange={(e) =>
                                        setLinkForm((p) => ({
                                            ...p,
                                            email: e.target.value,
                                        }))
                                    }
                                    placeholder="designer@example.com"
                                    style={{
                                        padding: "7px 10px",
                                        border: "1px solid #d1d5db",
                                        borderRadius: 6,
                                        outline: "none",
                                        fontFamily: "inherit",
                                    }}
                                    autoFocus
                                />
                            </label>
                            <label
                                style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4,
                                    fontWeight: 600,
                                    color: "#374151",
                                }}
                            >
                                임시 비밀번호 (6자 이상)
                                <input
                                    type="password"
                                    value={linkForm.password}
                                    onChange={(e) =>
                                        setLinkForm((p) => ({
                                            ...p,
                                            password: e.target.value,
                                        }))
                                    }
                                    placeholder="6자 이상"
                                    style={{
                                        padding: "7px 10px",
                                        border: "1px solid #d1d5db",
                                        borderRadius: 6,
                                        outline: "none",
                                        fontFamily: "inherit",
                                    }}
                                />
                            </label>
                        </div>
                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                justifyContent: "flex-end",
                                marginTop: 16,
                            }}
                        >
                            <button
                                onClick={() => {
                                    setLinkModal(false);
                                    setLinkForm({ email: "", password: "" });
                                }}
                                style={btn(false)}
                            >
                                취소
                            </button>
                            <button
                                onClick={handleLink}
                                disabled={isPending}
                                style={{
                                    ...btn(true),
                                    opacity: isPending ? 0.7 : 1,
                                }}
                            >
                                {isPending ? "생성 중..." : "계정 생성 및 연결"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* 비밀번호 변경 모달 */}
            {pwModal && (
                <div
                    onClick={() => setPwModal(false)}
                    style={{
                        position: "fixed",
                        inset: 0,
                        background: "rgba(0,0,0,0.45)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        zIndex: 2000,
                        padding: 16,
                    }}
                >
                    <div
                        onClick={(e) => e.stopPropagation()}
                        style={{
                            background: "#fff",
                            borderRadius: 8,
                            padding: 20,
                            width: 340,
                            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
                            fontFamily: "inherit",
                        }}
                    >
                        <p
                            style={{
                                margin: "0 0 4px",
                                fontWeight: 700,
                                color: "#111827",
                            }}
                        >
                            비밀번호 변경
                        </p>
                        <p style={{ margin: "0 0 12px", color: "#6b7280" }}>
                            {designer.name}
                        </p>
                        <input
                            type="password"
                            value={newPw}
                            onChange={(e) => setNewPw(e.target.value)}
                            placeholder="새 비밀번호 (6자 이상)"
                            style={{ ...inputStyle, marginBottom: 12 }}
                            autoFocus
                        />
                        <div
                            style={{
                                display: "flex",
                                gap: 8,
                                justifyContent: "flex-end",
                            }}
                        >
                            <button
                                onClick={() => {
                                    setPwModal(false);
                                    setNewPw("");
                                }}
                                style={btn(false)}
                            >
                                취소
                            </button>
                            <button
                                onClick={handlePwReset}
                                disabled={isPending}
                                style={{
                                    ...btn(true),
                                    opacity: isPending ? 0.7 : 1,
                                }}
                            >
                                {isPending ? "변경 중..." : "변경"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
        </>
    );
}

// ─── 메인 ────────────────────────────────────────────────────
export default function DesignerManageClient() {
    const [designers, setDesigners] = useState<Designer[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [showInactive, setShowInactive] = useState(false);

    const refresh = async () => {
        setLoading(true);
        try {
            // 브라우저 → Supabase 직접 (email 컬럼 포함)
            const supabase = createClient();
            const { data } = await supabase
                .from("designers")
                .select("id, name, status, is_active, avatar_url, user_id, email")
                .order("name", { ascending: true });
            setDesigners((data ?? []).map((d) => ({ ...d, email: d.email ?? "" })));
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { refresh(); }, []);

    const active = designers.filter((d) => d.is_active);
    const inactive = designers.filter((d) => !d.is_active);

    if (loading) {
        return (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#9ca3af" }}>
                불러오는 중...
            </div>
        );
    }

    return (
        <>
            {showCreate && (
                <CreateModal
                    onClose={() => setShowCreate(false)}
                    onCreated={refresh}
                />
            )}

            {/* 헤더 */}
            <div
                style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 24,
                }}
            >
                <div>
                    <h2
                        style={{ margin: 0, fontWeight: 800, color: "#111827" }}
                    >
                        디자이너 관리
                    </h2>
                    <p style={{ margin: "4px 0 0", color: "#9ca3af" }}>
                        활성 {active.length}명 · 비활성 {inactive.length}명
                    </p>
                </div>
                <button
                    onClick={() => setShowCreate(true)}
                    style={{
                        padding: "8px 18px",
                        background: "#111827",
                        color: "#fff",
                        border: "none",
                        borderRadius: 8,
                        cursor: "pointer",
                        fontWeight: 700,
                        fontFamily: "inherit",
                    }}
                >
                    + 디자이너 추가
                </button>
            </div>

            {/* 활성 디자이너 그리드 */}
            {active.length === 0 ? (
                <div
                    style={{
                        textAlign: "center",
                        padding: "40px 0",
                        color: "#9ca3af",
                        border: "1px dashed #e5e7eb",
                        borderRadius: 8,
                    }}
                >
                    등록된 디자이너가 없습니다. [ + 디자이너 추가 ] 버튼으로
                    계정을 생성하세요.
                </div>
            ) : (
                <div
                    style={{
                        display: "grid",
                        gridTemplateColumns:
                            "repeat(auto-fill, minmax(240px, 1fr))",
                        gap: 16,
                    }}
                >
                    {active.map((d) => (
                        <DesignerCard
                            key={d.id}
                            designer={d}
                            onRefresh={refresh}
                        />
                    ))}
                </div>
            )}

            {/* 비활성 디자이너 토글 */}
            {inactive.length > 0 && (
                <div style={{ marginTop: 32 }}>
                    <button
                        onClick={() => setShowInactive((p) => !p)}
                        style={{
                            background: "none",
                            border: "none",
                            cursor: "pointer",
                            color: "#9ca3af",
                            fontWeight: 600,
                            fontFamily: "inherit",
                            padding: 0,
                            display: "flex",
                            alignItems: "center",
                            gap: 4,
                        }}
                    >
                        {showInactive ? "▾" : "▸"} 비활성 디자이너{" "}
                        {inactive.length}명
                    </button>
                    {showInactive && (
                        <div
                            style={{
                                display: "grid",
                                gridTemplateColumns:
                                    "repeat(auto-fill, minmax(240px, 1fr))",
                                gap: 16,
                                marginTop: 12,
                            }}
                        >
                            {inactive.map((d) => (
                                <DesignerCard
                                    key={d.id}
                                    designer={d}
                                    onRefresh={refresh}
                                />
                            ))}
                        </div>
                    )}
                </div>
            )}
        </>
    );
}

// ─── 스타일 헬퍼 ──────────────────────────────────────────────
const labelStyle: React.CSSProperties = {
    display: "flex",
    gap: 6,
    fontWeight: 600,
    color: "#374151",
};
const inputStyle: React.CSSProperties = {
    width: "100%",
    padding: "7px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 6,
    outline: "none",
    fontFamily: "inherit",
    boxSizing: "border-box",
};
function btn(primary: boolean): React.CSSProperties {
    return {
        padding: "6px 16px",
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
