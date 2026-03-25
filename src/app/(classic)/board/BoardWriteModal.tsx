"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import FileUploadField, { uploadToR2 } from "./FileUploadField";
import { useToast } from "./Toast";

interface Props {
    open: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const ORDER_SOURCES = ["홈페이지", "스토어팜"];
const ORDER_METHODS = [
    "샘플디자인 의뢰",
    "재주문(글자수정)",
    "인쇄만 의뢰",
    "재주문(수정없는)",
    "디자인 복원",
    "신규 디자인",
    "디자인 수정",
    "기타",
];
const POST_PROCESSINGS = ["없음", "단면박", "양면박", "귀도리", "기타"];
const BOX_TYPES = ["단면박", "양면박"];
const FILE_PATHS = ["게시판", "메일", "없음"];
function deriveConsultPath(url: string): string {
    if (!url.trim()) return "없음";
    const lower = url.toLowerCase();
    if (lower.includes("naver")) return "네이버";
    if (lower.includes("kakao")) return "카카오";
    return "기타";
}

const INIT = {
    order_source: "스토어팜" as string,
    customer_name: "",
    order_method: "" as string,
    order_method_note: "",
    print_items: "",
    post_processing: "없음" as string,
    귀도리_size: "4mm" as "4mm" | "6mm",
    post_processing_note: "",
    file_path: "없음" as string,
    consult_link: "",
    special_details_yn: "없음" as "있음" | "없음",
    special_details: "",
    registered_by: "",
    is_priority: false,
};

export default function BoardWriteModal({ open, onClose, onSuccess }: Props) {
    const [form, setForm] = useState(INIT);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [files, setFiles] = useState<File[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const { showToast, ToastUI } = useToast();

    // 등록자: 계정 이름 자동 기입
    useEffect(() => {
        if (!open) return;
        const supabase = createClient();
        supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return;
            supabase
                .from("profiles")
                .select("name")
                .eq("id", user.id)
                .single()
                .then(({ data }) => {
                    const name = data?.name ?? user.email?.split("@")[0] ?? "";
                    setForm((prev) => ({ ...prev, registered_by: name }));
                });
        });
    }, [open]);

    if (!open) return null;

    const validate = () => {
        const e: Record<string, string> = {};
        if (!form.order_source) e.order_source = "주문경로를 선택해주세요";
        if (!form.customer_name.trim())
            e.customer_name = "고객이름을 입력해주세요";
        if (!form.order_method) e.order_method = "주문방법을 선택해주세요";
        if (!form.print_items.trim()) e.print_items = "인쇄항목을 입력해주세요";
        if (form.special_details_yn === "있음" && !form.special_details.trim())
            e.special_details = "특이사항 내용을 입력해주세요";
        return e;
    };

    const buildPostProc = () => {
        if (form.post_processing === "귀도리")
            return `귀도리 ${form.귀도리_size}`;
        if (
            BOX_TYPES.includes(form.post_processing) &&
            form.post_processing_note.trim()
        )
            return `${form.post_processing} - ${form.post_processing_note.trim()}`;
        if (form.post_processing === "기타" && form.post_processing_note.trim())
            return `기타: ${form.post_processing_note.trim()}`;
        return form.post_processing;
    };

    const handleSubmit = async () => {
        const e = validate();
        if (Object.keys(e).length > 0) {
            setErrors(e);
            return;
        }
        setSubmitting(true);
        try {
            const supabase = createClient();
            const filePaths: string[] = [];
            const uploadedFiles: { url: string; name: string; size: number }[] =
                [];

            for (const file of files) {
                try {
                    const { publicUrl, key } = await uploadToR2(
                        "task-files",
                        file,
                    );
                    filePaths.push(key);
                    uploadedFiles.push({
                        url: publicUrl,
                        name: file.name,
                        size: file.size,
                    });
                } catch (upErr) {
                    showToast(
                        `파일 업로드 실패: ${file.name}\n${(upErr as Error).message}`,
                    );
                    setSubmitting(false);
                    return;
                }
            }

            const { data: newTask, error } = await supabase
                .from("tasks")
                .insert({
                    order_source: form.order_source,
                    customer_name: form.customer_name.trim(),
                    order_method: form.order_method,
                    order_method_note: form.order_method_note.trim() || null,
                    print_items: form.print_items.trim(),
                    post_processing: buildPostProc(),
                    file_paths: filePaths.length ? filePaths : null,
                    consult_path: deriveConsultPath(form.consult_link),
                    consult_link: form.consult_link || null,
                    special_details:
                        form.special_details_yn === "있음"
                            ? form.special_details.trim()
                            : null,
                    assigned_designer_id: null,
                    registered_by: form.registered_by.trim() || null,
                    is_priority: form.is_priority,
                    is_quick: false,
                    status: "작업중",
                })
                .select("id")
                .single();

            if (error) throw error;

            if (newTask && uploadedFiles.length > 0) {
                const { error: filesErr } = await supabase
                    .from("task_files")
                    .insert(
                        uploadedFiles.map((f) => ({
                            task_id: newTask.id,
                            file_url: f.url,
                            file_name: f.name,
                            file_size: f.size,
                        })),
                    );
                if (filesErr)
                    throw new Error(`파일 DB 저장 실패: ${filesErr.message}`);
            }

            setForm(INIT);
            setFiles([]);
            setErrors({});
            onSuccess();
            onClose();
        } catch (err) {
            showToast("등록 실패: " + (err as Error).message);
        } finally {
            setSubmitting(false);
        }
    };

    const set = (k: keyof typeof INIT, v: unknown) => {
        setForm((prev) => ({ ...prev, [k]: v }));
        setErrors((prev) => {
            const n = { ...prev };
            delete n[k];
            return n;
        });
    };

    const showPpNote =
        BOX_TYPES.includes(form.post_processing) ||
        form.post_processing === "기타";

    return (
        <>
            {ToastUI}
            <div
                style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.5)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 1000,
                    padding: 16,
                }}
                onMouseDown={(e) => {
                    if (e.target === e.currentTarget) onClose();
                }}
            >
                <div
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{
                        background: "#fff",
                        borderRadius: 6,
                        width: "100%",
                        maxWidth: 560,
                        maxHeight: "92vh",
                        overflowY: "auto",
                        boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
                        fontFamily: "inherit",
                    }}
                >
                    <div
                        style={{
                            padding: "14px 20px",
                            borderBottom: "1px solid #e5e7eb",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            position: "sticky",
                            top: 0,
                            background: "#fff",
                            zIndex: 2,
                        }}
                    >
                        <strong>작업 등록</strong>
                        <button onClick={onClose} style={closeBtn}>
                            ✕
                        </button>
                    </div>

                    <div style={{ padding: "8px 0 4px" }}>
                        <table
                            style={{
                                width: "100%",
                                borderCollapse: "collapse",
                            }}
                        >
                            <tbody>
                                <Row
                                    label="주문경로"
                                    required
                                    error={errors.order_source}
                                >
                                    <div style={{ display: "flex", gap: 6 }}>
                                        {ORDER_SOURCES.map((s) => (
                                            <button
                                                key={s}
                                                type="button"
                                                onClick={() =>
                                                    set("order_source", s)
                                                }
                                                style={toggleBtn(
                                                    form.order_source === s,
                                                )}
                                            >
                                                {s}
                                            </button>
                                        ))}
                                    </div>
                                </Row>
                                <Row
                                    label="고객이름"
                                    required
                                    error={errors.customer_name}
                                >
                                    <input
                                        type="text"
                                        value={form.customer_name}
                                        onChange={(e) =>
                                            set("customer_name", e.target.value)
                                        }
                                        placeholder="예: 스타벅스코리아"
                                        style={inp(!!errors.customer_name)}
                                    />
                                </Row>
                                <Row
                                    label="주문방법"
                                    required
                                    error={errors.order_method}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: 5,
                                            marginBottom: 6,
                                        }}
                                    >
                                        {ORDER_METHODS.map((m) => (
                                            <button
                                                key={m}
                                                type="button"
                                                onClick={() =>
                                                    set("order_method", m)
                                                }
                                                style={toggleBtn(
                                                    form.order_method === m,
                                                )}
                                            >
                                                {m}
                                            </button>
                                        ))}
                                    </div>
                                    {(form.order_method === "샘플디자인 의뢰" ||
                                        form.order_method === "기타") && (
                                        <input
                                            type="text"
                                            value={form.order_method_note}
                                            onChange={(e) =>
                                                set(
                                                    "order_method_note",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="주문방법 상세 메모 (선택)"
                                            style={inp(false)}
                                        />
                                    )}
                                </Row>
                                <Row
                                    label="인쇄항목"
                                    required
                                    error={errors.print_items}
                                >
                                    <input
                                        type="text"
                                        value={form.print_items}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            set("print_items", val);
                                            if (
                                                (val.includes("두꺼운") ||
                                                    val.includes("고품격")) &&
                                                form.post_processing ===
                                                    "귀도리" &&
                                                form.귀도리_size === "4mm"
                                            ) {
                                                set("귀도리_size", "6mm");
                                            }
                                        }}
                                        placeholder="예: 반누보 200매 / 3건"
                                        style={inp(!!errors.print_items)}
                                    />
                                </Row>
                                <Row label="후가공">
                                    <div
                                        style={{
                                            display: "flex",
                                            flexWrap: "wrap",
                                            gap: 5,
                                            marginBottom: showPpNote ? 6 : 0,
                                        }}
                                    >
                                        {POST_PROCESSINGS.map((p) => (
                                            <button
                                                key={p}
                                                type="button"
                                                onClick={() => {
                                                    set("post_processing", p);
                                                    set(
                                                        "post_processing_note",
                                                        "",
                                                    );
                                                }}
                                                style={toggleBtn(
                                                    form.post_processing === p,
                                                )}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                    {/* 귀도리 4mm/6mm 선택 */}
                                    {form.post_processing === "귀도리" && (
                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 5,
                                                marginTop: 6,
                                            }}
                                        >
                                            {(["4mm", "6mm"] as const).map(
                                                (s) => {
                                                    const force6mm =
                                                        form.print_items.includes(
                                                            "두꺼운",
                                                        ) ||
                                                        form.print_items.includes(
                                                            "고품격",
                                                        );
                                                    const disabled =
                                                        s === "4mm" && force6mm;
                                                    return (
                                                        <button
                                                            key={s}
                                                            type="button"
                                                            disabled={disabled}
                                                            onClick={() =>
                                                                set(
                                                                    "귀도리_size",
                                                                    s,
                                                                )
                                                            }
                                                            style={{
                                                                ...toggleBtn(
                                                                    form.귀도리_size ===
                                                                        s,
                                                                ),
                                                                ...(form.귀도리_size ===
                                                                s
                                                                    ? {
                                                                          background:
                                                                              "#7c3aed",
                                                                          borderColor:
                                                                              "#7c3aed",
                                                                          color: "#fff",
                                                                      }
                                                                    : {}),
                                                                ...(disabled
                                                                    ? {
                                                                          opacity: 0.35,
                                                                          cursor: "not-allowed",
                                                                      }
                                                                    : {}),
                                                            }}
                                                        >
                                                            {s}
                                                        </button>
                                                    );
                                                },
                                            )}
                                        </div>
                                    )}
                                    {/* 단면박/양면박 텍스트 옵션 */}
                                    {BOX_TYPES.includes(
                                        form.post_processing,
                                    ) && (
                                        <input
                                            type="text"
                                            value={form.post_processing_note}
                                            onChange={(e) =>
                                                set(
                                                    "post_processing_note",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="박 상세 내용 (선택)"
                                            style={{
                                                ...inp(false),
                                                marginTop: 6,
                                            }}
                                        />
                                    )}
                                    {/* 기타 텍스트 */}
                                    {form.post_processing === "기타" && (
                                        <input
                                            type="text"
                                            value={form.post_processing_note}
                                            onChange={(e) =>
                                                set(
                                                    "post_processing_note",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="후가공 내용 입력"
                                            style={{
                                                ...inp(false),
                                                marginTop: 6,
                                            }}
                                        />
                                    )}
                                </Row>
                                <Row label="파일전달경로">
                                    <div style={{ display: "flex", gap: 5 }}>
                                        {FILE_PATHS.map((p) => (
                                            <button
                                                key={p}
                                                type="button"
                                                onClick={() =>
                                                    set("file_path", p)
                                                }
                                                style={toggleBtn(
                                                    form.file_path === p,
                                                )}
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </Row>
                                <Row label="첨부파일">
                                    <FileUploadField
                                        files={files}
                                        onChange={setFiles}
                                    />
                                </Row>
                                <Row label="상담링크">
                                    <input
                                        type="url"
                                        value={form.consult_link}
                                        onChange={(e) =>
                                            set("consult_link", e.target.value)
                                        }
                                        placeholder="https://..."
                                        style={inp(false)}
                                    />
                                </Row>
                                <Row
                                    label="처리특이사항"
                                    error={errors.special_details}
                                >
                                    <div
                                        style={{
                                            display: "flex",
                                            gap: 5,
                                            marginBottom:
                                                form.special_details_yn ===
                                                "있음"
                                                    ? 6
                                                    : 0,
                                        }}
                                    >
                                        {(["없음", "있음"] as const).map(
                                            (v) => (
                                                <button
                                                    key={v}
                                                    type="button"
                                                    onClick={() =>
                                                        set(
                                                            "special_details_yn",
                                                            v,
                                                        )
                                                    }
                                                    style={{
                                                        ...toggleBtn(
                                                            form.special_details_yn ===
                                                                v,
                                                        ),
                                                        ...(v === "있음" &&
                                                        form.special_details_yn ===
                                                            "있음"
                                                            ? {
                                                                  background:
                                                                      "#ef4444",
                                                                  borderColor:
                                                                      "#ef4444",
                                                                  color: "#fff",
                                                              }
                                                            : {}),
                                                    }}
                                                >
                                                    {v}
                                                </button>
                                            ),
                                        )}
                                    </div>
                                    {form.special_details_yn === "있음" && (
                                        <textarea
                                            value={form.special_details}
                                            onChange={(e) =>
                                                set(
                                                    "special_details",
                                                    e.target.value,
                                                )
                                            }
                                            placeholder="특이사항 내용을 입력하세요"
                                            rows={3}
                                            style={{
                                                ...inp(
                                                    !!errors.special_details,
                                                ),
                                                resize: "vertical",
                                                display: "block",
                                            }}
                                        />
                                    )}
                                </Row>
                                <Row label="등록자">
                                    <input
                                        type="text"
                                        value={form.registered_by}
                                        onChange={(e) =>
                                            set("registered_by", e.target.value)
                                        }
                                        placeholder="등록자 이름"
                                        style={inp(false)}
                                    />
                                </Row>
                                <Row label="우선작업">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            set(
                                                "is_priority",
                                                !form.is_priority,
                                            )
                                        }
                                        style={{
                                            ...toggleBtn(form.is_priority),
                                            ...(form.is_priority
                                                ? {
                                                      background: "#ef4444",
                                                      borderColor: "#ef4444",
                                                      color: "#fff",
                                                  }
                                                : {}),
                                        }}
                                    >
                                        {form.is_priority
                                            ? "우선작업으로 등록됩니다"
                                            : "우선작업 아님"}
                                    </button>
                                </Row>
                            </tbody>
                        </table>
                    </div>

                    <div
                        style={{
                            padding: "12px 20px",
                            borderTop: "1px solid #e5e7eb",
                            display: "flex",
                            justifyContent: "flex-end",
                            gap: 8,
                            position: "sticky",
                            bottom: 0,
                            background: "#fff",
                            zIndex: 2,
                        }}
                    >
                        <button
                            type="button"
                            onClick={onClose}
                            style={footerBtn(false)}
                        >
                            취소
                        </button>
                        <button
                            type="button"
                            onClick={handleSubmit}
                            disabled={submitting}
                            style={footerBtn(true)}
                        >
                            {submitting ? "등록 중..." : "작성완료"}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

function Row({
    label,
    required,
    error,
    children,
}: {
    label: string;
    required?: boolean;
    error?: string;
    children: React.ReactNode;
}) {
    return (
        <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
            <th
                style={{
                    padding: "10px 16px",
                    fontWeight: 600,
                    color: "#6b7280",
                    background: "#f9fafb",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    width: "28%",
                    verticalAlign: "top",
                }}
            >
                {label}
                {required && (
                    <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>
                )}
            </th>
            <td style={{ padding: "10px 16px", verticalAlign: "top" }}>
                {children}
                {error && (
                    <p
                        style={{
                            margin: "4px 0 0",
                            color: "#ef4444",
                            fontWeight: 500,
                        }}
                    >
                        ⚠ {error}
                    </p>
                )}
            </td>
        </tr>
    );
}

const closeBtn: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "#9ca3af",
    padding: "2px 4px",
    lineHeight: 1,
};
const inp = (hasError: boolean): React.CSSProperties => ({
    width: "100%",
    padding: "6px 10px",
    border: `1px solid ${hasError ? "#ef4444" : "#d1d5db"}`,
    borderRadius: 4,
    outline: "none",
    background: hasError ? "#fff5f5" : "#fff",
    fontFamily: "inherit",
    boxSizing: "border-box",
});
const toggleBtn = (active: boolean): React.CSSProperties => ({
    padding: "4px 12px",
    border: `1px solid ${active ? "#111827" : "#d1d5db"}`,
    borderRadius: 4,
    background: active ? "#111827" : "#fff",
    color: active ? "#fff" : "#374151",
    cursor: "pointer",
    fontFamily: "inherit",
    fontWeight: active ? 600 : 400,
    transition: "all 0.1s",
});
const footerBtn = (primary: boolean): React.CSSProperties => ({
    padding: "7px 20px",
    fontWeight: 600,
    border: "1px solid",
    borderColor: primary ? "#111827" : "#e5e7eb",
    borderRadius: 4,
    cursor: "pointer",
    background: primary ? "#111827" : "#fff",
    color: primary ? "#fff" : "#374151",
    fontFamily: "inherit",
});
