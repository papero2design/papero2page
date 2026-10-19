// src/app/(classic)/board/write/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadToR2 } from "@/lib/r2/upload";
import FileUploadField from "../FileUploadField";
import { useToast } from "../Toast";

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
const FILE_PATHS = ["게시판", "메일", "없음"];
const CONSULT_PATHS = ["네이버톡톡", "카카오톡채널", "메일", "없음"];
const QUICK_METHODS = ["인쇄만 의뢰", "재주문(수정없는)"];

interface OrderForm {
    order_source: string;
    customer_name: string;
    order_method: string;
    order_method_note: string;
    print_items: string;
    post_processing: string;
    post_processing_note: string;
    file_path: string;
    consult_path: string;
    consult_link: string;
    special_details_yn: "있음" | "없음";
    special_details: string;
}

const FORM_INIT: OrderForm = {
    order_source: "",
    customer_name: "",
    order_method: "",
    order_method_note: "",
    print_items: "",
    post_processing: "없음",
    post_processing_note: "",
    file_path: "없음",
    consult_path: "없음",
    consult_link: "",
    special_details_yn: "없음",
    special_details: "",
};

export default function BoardWritePage() {
    const router = useRouter();
    const [forms, setForms] = useState<OrderForm[]>([{ ...FORM_INIT }]);
    const [filesList, setFilesList] = useState<File[][]>([[]]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const { showToast, ToastUI } = useToast();
    const supabase = createClient();

    const setField = (idx: number, k: keyof OrderForm, v: unknown) => {
        setForms((prev) =>
            prev.map((f, i) => (i === idx ? { ...f, [k]: v } : f)),
        );
        setErrors((prev) => {
            const n = { ...prev };
            delete n[`${idx}_${k}`];
            return n;
        });
    };

    const addOrder = () => {
        const first = forms[0];
        setForms((prev) => [
            ...prev,
            {
                ...FORM_INIT,
                // 1번 주문에서 고객 정보 인계
                order_source: first.order_source,
                customer_name: first.customer_name,
                consult_path: first.consult_path,
                consult_link: first.consult_link,
            },
        ]);
        setFilesList((prev) => [...prev, []]);
    };

    const removeOrder = (idx: number) => {
        setForms((prev) => prev.filter((_, i) => i !== idx));
        setFilesList((prev) => prev.filter((_, i) => i !== idx));
    };

    const validate = () => {
        const e: Record<string, string> = {};
        forms.forEach((form, idx) => {
            const isExtra = idx > 0;
            // 인계 필드: 1번 폼에서만 검사
            if (!isExtra && !form.order_source) e[`${idx}_order_source`] = "주문경로를 선택해주세요";
            if (!isExtra && !form.customer_name.trim()) e[`${idx}_customer_name`] = "고객이름을 입력해주세요";
            // 주문별 필드: 모든 폼 검사
            if (!form.order_method) e[`${idx}_order_method`] = "주문방법을 선택해주세요";
            if (!form.print_items.trim()) e[`${idx}_print_items`] = "인쇄항목을 입력해주세요";
            if (form.special_details_yn === "있음" && !form.special_details.trim())
                e[`${idx}_special_details`] = "특이사항 내용을 입력해주세요";
        });
        return e;
    };

    const handleSubmit = async () => {
        const e = validate();
        if (Object.keys(e).length > 0) { setErrors(e); return; }
        setLoading(true);
        try {
            const groupId = forms.length > 1 ? crypto.randomUUID() : null;

            for (let idx = 0; idx < forms.length; idx++) {
                const form = forms[idx];
                const files = filesList[idx];
                // 인계 필드는 항상 1번 폼 기준으로 사용 (stale copy 방지)
                const inherited = idx > 0 ? forms[0] : form;

                const filePaths: string[] = [];
                const uploadedFiles: { url: string; name: string; size: number }[] = [];
                for (const file of files) {
                    try {
                        const { publicUrl, key } = await uploadToR2("task-files", file);
                        filePaths.push(key);
                        uploadedFiles.push({ url: publicUrl, name: file.name, size: file.size });
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
                        order_source: inherited.order_source,
                        customer_name: inherited.customer_name.trim(),
                        order_method: form.order_method,
                        order_method_note: form.order_method_note.trim() || null,
                        print_items: form.print_items.trim(),
                        post_processing: postProc,
                        file_paths: filePaths.length > 0 ? filePaths : null,
                        consult_path: inherited.consult_path,
                        consult_link: inherited.consult_link.trim() || null,
                        special_details:
                            form.special_details_yn === "있음"
                                ? form.special_details.trim()
                                : null,
                        is_quick: QUICK_METHODS.includes(form.order_method),
                        status: "대기중",
                        group_id: groupId,
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
            }

            router.push("/board");
        } catch (err) {
            console.error(err);
            showToast("등록 중 오류가 발생했습니다.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{ fontFamily: "inherit" }}>
            {ToastUI}
            <div
                style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid #e5e7eb",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    background: "#fff",
                }}
            >
                <strong>
                    작업 등록
                    {forms.length > 1 && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: "#6b7280", fontWeight: 400 }}>
                            ({forms.length}건 묶음)
                        </span>
                    )}
                </strong>
                <button onClick={() => router.back()} style={closeBtn}>✕</button>
            </div>

            {forms.map((form, idx) => {
                const isExtra = idx > 0;
                const first = forms[0];
                return (
                    <div key={idx}>
                        {/* 주문 구분 헤더 */}
                        {forms.length > 1 && (
                            <div
                                style={{
                                    padding: "8px 20px",
                                    display: "flex",
                                    alignItems: "center",
                                    justifyContent: "space-between",
                                    background: isExtra ? "#eff6ff" : "#f9fafb",
                                    borderTop: idx > 0 ? "2px solid #bfdbfe" : "none",
                                    borderBottom: "1px solid #e5e7eb",
                                }}
                            >
                                <span style={{ fontWeight: 600, fontSize: 13, color: isExtra ? "#1d4ed8" : "#374151" }}>
                                    주문 {idx + 1}
                                    {isExtra && (
                                        <span style={{ marginLeft: 8, fontSize: 11, fontWeight: 400, color: "#6b7280" }}>
                                            ← {first.customer_name || "1번 주문"} 에서 인계
                                        </span>
                                    )}
                                </span>
                                {isExtra && (
                                    <button
                                        type="button"
                                        onClick={() => removeOrder(idx)}
                                        style={{ background: "none", border: "1px solid #fca5a5", borderRadius: 4, color: "#ef4444", cursor: "pointer", padding: "2px 8px", fontSize: 12 }}
                                    >
                                        삭제
                                    </button>
                                )}
                            </div>
                        )}

                        <div style={{ padding: "8px 0 4px" }}>
                            <table style={{ width: "100%", borderCollapse: "collapse" }}>
                                <tbody>
                                    {/* 1. 주문경로 */}
                                    <Row
                                        label="주문경로"
                                        required={!isExtra}
                                        error={errors[`${idx}_order_source`]}
                                        inherited={isExtra}
                                    >
                                        {isExtra ? (
                                            <InheritedValue value={first.order_source || "—"} />
                                        ) : (
                                            <div style={{ display: "flex", gap: 6 }}>
                                                {ORDER_SOURCES.map((s) => (
                                                    <button key={s} type="button"
                                                        onClick={() => setField(idx, "order_source", s)}
                                                        style={toggleBtn(form.order_source === s)}>
                                                        {s}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </Row>

                                    {/* 2. 고객이름 */}
                                    <Row
                                        label="고객이름"
                                        required={!isExtra}
                                        error={errors[`${idx}_customer_name`]}
                                        inherited={isExtra}
                                    >
                                        {isExtra ? (
                                            <InheritedValue value={first.customer_name || "—"} />
                                        ) : (
                                            <input
                                                type="text"
                                                value={form.customer_name}
                                                onChange={(e) => setField(idx, "customer_name", e.target.value)}
                                                placeholder="예: 스타벅스코리아"
                                                style={inp(!!errors[`${idx}_customer_name`])}
                                            />
                                        )}
                                    </Row>

                                    {/* 3. 주문방법 */}
                                    <Row label="주문방법" required error={errors[`${idx}_order_method`]}>
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                                            {ORDER_METHODS.map((m) => (
                                                <button key={m} type="button"
                                                    onClick={() => setField(idx, "order_method", m)}
                                                    style={{
                                                        ...toggleBtn(form.order_method === m),
                                                        ...(QUICK_METHODS.includes(m) && form.order_method === m
                                                            ? { background: "#15803d", borderColor: "#15803d", color: "#fff" }
                                                            : {}),
                                                    }}>
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                        {(form.order_method === "샘플디자인 의뢰" || form.order_method === "기타") && (
                                            <input
                                                type="text"
                                                value={form.order_method_note}
                                                onChange={(e) => setField(idx, "order_method_note", e.target.value)}
                                                placeholder="주문방법 상세 메모 (선택)"
                                                style={inp(false)}
                                            />
                                        )}
                                    </Row>

                                    {/* 4. 인쇄항목 */}
                                    <Row label="인쇄항목" required error={errors[`${idx}_print_items`]}>
                                        <input
                                            type="text"
                                            value={form.print_items}
                                            onChange={(e) => setField(idx, "print_items", e.target.value)}
                                            placeholder="예: 반누보 200매 / 3건"
                                            style={inp(!!errors[`${idx}_print_items`])}
                                        />
                                    </Row>

                                    {/* 5. 후가공 */}
                                    <Row label="후가공">
                                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: form.post_processing === "기타" ? 6 : 0 }}>
                                            {POST_PROCESSINGS.map((p) => (
                                                <button key={p} type="button"
                                                    onClick={() => setField(idx, "post_processing", p)}
                                                    style={toggleBtn(form.post_processing === p)}>
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                        {form.post_processing === "기타" && (
                                            <input
                                                type="text"
                                                value={form.post_processing_note}
                                                onChange={(e) => setField(idx, "post_processing_note", e.target.value)}
                                                placeholder="후가공 내용 입력"
                                                style={{ ...inp(false), marginTop: 6 }}
                                            />
                                        )}
                                    </Row>

                                    {/* 6. 상담경로 */}
                                    <Row label="상담경로" inherited={isExtra}>
                                        {isExtra ? (
                                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                                <InheritedValue value={first.consult_path || "없음"} />
                                                {first.consult_link && (
                                                    <span style={{ fontSize: 12, color: "#6b7280" }}>{first.consult_link}</span>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginBottom: 6 }}>
                                                    {CONSULT_PATHS.map((p) => (
                                                        <button key={p} type="button"
                                                            onClick={() => setField(idx, "consult_path", p)}
                                                            style={toggleBtn(form.consult_path === p)}>
                                                            {p}
                                                        </button>
                                                    ))}
                                                </div>
                                                <input
                                                    type="text"
                                                    value={form.consult_link}
                                                    onChange={(e) => setField(idx, "consult_link", e.target.value)}
                                                    placeholder="상담 링크 (선택)"
                                                    style={inp(false)}
                                                />
                                            </>
                                        )}
                                    </Row>

                                    {/* 7. 처리특이사항 */}
                                    <Row label="처리특이사항" error={errors[`${idx}_special_details`]}>
                                        <div style={{ display: "flex", gap: 5, marginBottom: form.special_details_yn === "있음" ? 6 : 0 }}>
                                            {(["없음", "있음"] as const).map((v) => (
                                                <button key={v} type="button"
                                                    onClick={() => setField(idx, "special_details_yn", v)}
                                                    style={{
                                                        ...toggleBtn(form.special_details_yn === v),
                                                        ...(v === "있음" && form.special_details_yn === "있음"
                                                            ? { background: "#ef4444", borderColor: "#ef4444", color: "#fff" }
                                                            : {}),
                                                    }}>
                                                    {v}
                                                </button>
                                            ))}
                                        </div>
                                        {form.special_details_yn === "있음" && (
                                            <textarea
                                                value={form.special_details}
                                                onChange={(e) => setField(idx, "special_details", e.target.value)}
                                                placeholder="특이사항 내용을 입력하세요"
                                                rows={3}
                                                style={{ ...inp(!!errors[`${idx}_special_details`]), resize: "vertical", display: "block" }}
                                            />
                                        )}
                                    </Row>

                                    {/* 8. 파일전달경로 */}
                                    <Row label="파일전달경로">
                                        <div style={{ display: "flex", gap: 5 }}>
                                            {FILE_PATHS.map((p) => (
                                                <button key={p} type="button"
                                                    onClick={() => setField(idx, "file_path", p)}
                                                    style={toggleBtn(form.file_path === p)}>
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                    </Row>

                                    {/* 9. 첨부파일 */}
                                    <Row label="첨부파일">
                                        <FileUploadField
                                            files={filesList[idx]}
                                            onChange={(f) =>
                                                setFilesList((prev) =>
                                                    prev.map((fl, i) => (i === idx ? f : fl)),
                                                )
                                            }
                                        />
                                    </Row>
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            })}

            {/* + 주문 추가 */}
            <div style={{ padding: "10px 20px", borderTop: "1px solid #e5e7eb", background: "#fff" }}>
                <button
                    type="button"
                    onClick={addOrder}
                    style={{
                        width: "100%",
                        padding: "8px",
                        border: "1px dashed #9ca3af",
                        borderRadius: 6,
                        background: "#f9fafb",
                        color: "#6b7280",
                        cursor: "pointer",
                        fontFamily: "inherit",
                        fontSize: 13,
                        fontWeight: 500,
                    }}
                >
                    + 주문 추가 (같은 고객 묶음 등록)
                </button>
            </div>

            {/* 푸터 */}
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
                <button type="button" onClick={() => router.back()} style={footerBtn(false)}>
                    취소
                </button>
                <button type="button" onClick={handleSubmit} disabled={loading} style={footerBtn(true)}>
                    {loading ? "등록 중..." : forms.length > 1 ? `${forms.length}건 묶음 등록` : "작성완료"}
                </button>
            </div>
        </div>
    );
}

// ─── 인계 값 표시 컴포넌트 ────────────────────────────────────
function InheritedValue({ value }: { value: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ color: "#374151", fontSize: 13 }}>{value}</span>
            <span style={{ fontSize: 11, color: "#93c5fd", background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: 4, padding: "1px 6px" }}>
                1번 주문에서 인계
            </span>
        </div>
    );
}

// ─── Row ──────────────────────────────────────────────────────
function Row({
    label,
    required,
    error,
    inherited,
    children,
}: {
    label: string;
    required?: boolean;
    error?: string;
    inherited?: boolean;
    children: React.ReactNode;
}) {
    return (
        <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
            <th
                style={{
                    padding: "10px 16px",
                    fontWeight: 600,
                    color: inherited ? "#9ca3af" : "#6b7280",
                    background: inherited ? "#f0f7ff" : "#f9fafb",
                    textAlign: "left",
                    whiteSpace: "nowrap",
                    width: "28%",
                    verticalAlign: "top",
                }}
            >
                {label}
                {required && <span style={{ color: "#ef4444", marginLeft: 2 }}>*</span>}
            </th>
            <td style={{ padding: "10px 16px", verticalAlign: "top", background: inherited ? "#f8fbff" : undefined }}>
                {children}
                {error && (
                    <p style={{ margin: "4px 0 0", color: "#ef4444", fontWeight: 500 }}>⚠ {error}</p>
                )}
            </td>
        </tr>
    );
}

// ─── 스타일 ───────────────────────────────────────────────────
const closeBtn: React.CSSProperties = {
    background: "none", border: "none", cursor: "pointer", color: "#9ca3af", padding: "2px 4px", lineHeight: 1,
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
