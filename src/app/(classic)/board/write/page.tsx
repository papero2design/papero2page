// src/app/(classic)/board/write/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadToR2 } from "@/lib/r2/upload";
import FileUploadField from "../FileUploadField";

// ─── BoardWriteModal과 완전히 동일한 상수 ────────────────────
const ORDER_SOURCES = ["홈페이지", "스토어팜"];
const ORDER_METHODS = [
    "샘플디자인 의뢰",
    "재주문(글자수정)",
    "인쇄만",
    "재주문(수정X)",
    "디자인 복원",
    "신규 디자인",
    "디자인 수정",
    "기타",
];
const POST_PROCESSINGS = ["없음", "단면박", "양면박", "귀도리", "기타"];
const FILE_PATHS = ["게시판", "메일", "없음"];
const CONSULT_PATHS = ["네이버톡톡", "카카오톡채널", "메일", "없음"];
const QUICK_METHODS = ["인쇄만", "재주문(수정X)"];

const INIT = {
    order_source: "" as string,
    customer_name: "",
    order_method: "" as string,
    order_method_note: "",
    print_items: "",
    post_processing: "없음" as string,
    post_processing_note: "",
    file_path: "없음" as string,
    consult_path: "없음" as string,
    consult_link: "",
    special_details_yn: "없음" as "있음" | "없음",
    special_details: "",
};

export default function BoardWritePage() {
    const router = useRouter();
    const [form, setForm] = useState(INIT);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [files, setFiles] = useState<File[]>([]);
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    const set = (k: keyof typeof INIT, v: unknown) => {
        setForm((prev) => ({ ...prev, [k]: v }));
        setErrors((prev) => {
            const n = { ...prev };
            delete n[k];
            return n;
        });
    };

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

    const handleSubmit = async () => {
        const e = validate();
        if (Object.keys(e).length > 0) {
            setErrors(e);
            return;
        }
        setLoading(true);
        try {
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
                } catch (err) {
                    console.error("파일 업로드 실패:", file.name, err);
                }
            }

            const postProc =
                form.post_processing === "기타"
                    ? `기타: ${form.post_processing_note}`
                    : form.post_processing;

            const { data: newTask, error: insertError } = await supabase
                .from("tasks")
                .insert({
                    order_source: form.order_source,
                    customer_name: form.customer_name.trim(),
                    order_method: form.order_method,
                    order_method_note: form.order_method_note.trim() || null,
                    print_items: form.print_items.trim(),
                    post_processing: postProc,
                    file_paths: filePaths.length > 0 ? filePaths : null,
                    consult_path: form.consult_path,
                    consult_link: form.consult_link.trim() || null,
                    special_details:
                        form.special_details_yn === "있음"
                            ? form.special_details.trim()
                            : null,
                    is_quick: QUICK_METHODS.includes(form.order_method),
                    status: "대기중",
                })
                .select("id")
                .single();

            if (insertError) throw insertError;

            if (newTask && uploadedFiles.length > 0) {
                await supabase.from("task_files").insert(
                    uploadedFiles.map((f) => ({
                        task_id: newTask.id,
                        file_url: f.url,
                        file_name: f.name,
                        file_size: f.size,
                    })),
                );
            }

            router.push("/board");
        } catch (err) {
            console.error(err);
            alert("등록 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ fontFamily: "inherit" }}>
            {/* 헤더 — BoardWriteModal 스타일 */}
            <div
                style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid #e5e7eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#fff",
                    marginBottom: 0,
                }}
            >
                <strong>작업 등록</strong>
                <button onClick={() => router.back()} style={closeBtn}>
                    ✕
                </button>
            </div>

            <div style={{ padding: "8px 0 4px" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
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
                                        onClick={() => set("order_source", s)}
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
                                        onClick={() => set("order_method", m)}
                                        style={{
                                            ...toggleBtn(
                                                form.order_method === m,
                                            ),
                                            ...(QUICK_METHODS.includes(m) &&
                                            form.order_method === m
                                                ? {
                                                      background: "#15803d",
                                                      borderColor: "#15803d",
                                                      color: "#fff",
                                                  }
                                                : {}),
                                        }}
                                    >
                                        {m}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={form.order_method_note}
                                onChange={(e) =>
                                    set("order_method_note", e.target.value)
                                }
                                placeholder="주문방법 상세 메모 (선택)"
                                style={inp(false)}
                            />
                        </Row>

                        <Row
                            label="인쇄항목"
                            required
                            error={errors.print_items}
                        >
                            <input
                                type="text"
                                value={form.print_items}
                                onChange={(e) =>
                                    set("print_items", e.target.value)
                                }
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
                                    marginBottom:
                                        form.post_processing === "기타" ? 6 : 0,
                                }}
                            >
                                {POST_PROCESSINGS.map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() =>
                                            set("post_processing", p)
                                        }
                                        style={toggleBtn(
                                            form.post_processing === p,
                                        )}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
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
                                    style={{ ...inp(false), marginTop: 6 }}
                                />
                            )}
                        </Row>

                        <Row label="파일전달경로">
                            <div style={{ display: "flex", gap: 5 }}>
                                {FILE_PATHS.map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => set("file_path", p)}
                                        style={toggleBtn(form.file_path === p)}
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

                        <Row label="상담경로">
                            <div
                                style={{
                                    display: "flex",
                                    flexWrap: "wrap",
                                    gap: 5,
                                    marginBottom: 6,
                                }}
                            >
                                {CONSULT_PATHS.map((p) => (
                                    <button
                                        key={p}
                                        type="button"
                                        onClick={() => set("consult_path", p)}
                                        style={toggleBtn(
                                            form.consult_path === p,
                                        )}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={form.consult_link}
                                onChange={(e) =>
                                    set("consult_link", e.target.value)
                                }
                                placeholder="상담 링크 (선택)"
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
                                        form.special_details_yn === "있음"
                                            ? 6
                                            : 0,
                                }}
                            >
                                {(["없음", "있음"] as const).map((v) => (
                                    <button
                                        key={v}
                                        type="button"
                                        onClick={() =>
                                            set("special_details_yn", v)
                                        }
                                        style={{
                                            ...toggleBtn(
                                                form.special_details_yn === v,
                                            ),
                                            ...(v === "있음" &&
                                            form.special_details_yn === "있음"
                                                ? {
                                                      background: "#ef4444",
                                                      borderColor: "#ef4444",
                                                      color: "#fff",
                                                  }
                                                : {}),
                                        }}
                                    >
                                        {v}
                                    </button>
                                ))}
                            </div>
                            {form.special_details_yn === "있음" && (
                                <textarea
                                    value={form.special_details}
                                    onChange={(e) =>
                                        set("special_details", e.target.value)
                                    }
                                    placeholder="특이사항 내용을 입력하세요"
                                    rows={3}
                                    style={{
                                        ...inp(!!errors.special_details),
                                        resize: "vertical",
                                        display: "block",
                                    }}
                                />
                            )}
                        </Row>
                    </tbody>
                </table>
            </div>

            {/* 푸터 — BoardWriteModal 스타일 */}
            <div
                style={{
                    padding: "12px 20px",
                    borderTop: "1px solid #e5e7eb",
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    background: "#fff",
                }}
            >
                <button
                    type="button"
                    onClick={() => router.back()}
                    style={footerBtn(false)}
                >
                    취소
                </button>
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    style={footerBtn(true)}
                >
                    {loading ? "등록 중..." : "작성완료"}
                </button>
            </div>
        </div>
    );
}

// ─── Row — BoardWriteModal과 완전히 동일 ─────────────────────
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

// ─── 스타일 — BoardWriteModal과 완전히 동일 ──────────────────
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
