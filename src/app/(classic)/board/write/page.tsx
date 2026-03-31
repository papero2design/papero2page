// src/app/(classic)/board/write/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { uploadToR2 } from "@/lib/r2/upload";
import FileUploadField from "../FileUploadField";
import { useToast } from "../Toast";

// ─── 상수 ────────────────────────────────────────────────────
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

// ─── 주문 항목 타입 ───────────────────────────────────────────
interface OrderItem {
    order_method: string;
    order_method_note: string;
    print_items: string;
    post_processing: string;
    post_processing_note: string;
    file_path: string;
    files: File[];
    special_details_yn: "있음" | "없음";
    special_details: string;
}

const ITEM_INIT: OrderItem = {
    order_method: "",
    order_method_note: "",
    print_items: "",
    post_processing: "없음",
    post_processing_note: "",
    file_path: "없음",
    files: [],
    special_details_yn: "없음",
    special_details: "",
};

// ─── 공유 필드 타입 ───────────────────────────────────────────
const SHARED_INIT = {
    order_source: "" as string,
    customer_name: "",
    consult_path: "없음" as string,
    consult_link: "",
};

export default function BoardWritePage() {
    const router = useRouter();
    const [shared, setShared] = useState(SHARED_INIT);
    const [items, setItems] = useState<OrderItem[]>([{ ...ITEM_INIT }]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(false);
    const { showToast, ToastUI } = useToast();
    const supabase = createClient();

    // ── 공유 필드 변경 ────────────────────────────────────────
    const setS = (k: keyof typeof SHARED_INIT, v: string) => {
        setShared((prev) => ({ ...prev, [k]: v }));
        setErrors((prev) => {
            const n = { ...prev };
            delete n[k];
            return n;
        });
    };

    // ── 주문 항목 변경 ────────────────────────────────────────
    const setItem = (idx: number, k: keyof OrderItem, v: unknown) => {
        setItems((prev) =>
            prev.map((item, i) => (i === idx ? { ...item, [k]: v } : item)),
        );
        setErrors((prev) => {
            const n = { ...prev };
            delete n[`${idx}_${k}`];
            return n;
        });
    };

    const addItem = () =>
        setItems((prev) => [...prev, { ...ITEM_INIT }]);

    const removeItem = (idx: number) =>
        setItems((prev) => prev.filter((_, i) => i !== idx));

    // ── 유효성 검사 ───────────────────────────────────────────
    const validate = () => {
        const e: Record<string, string> = {};
        if (!shared.order_source) e.order_source = "주문경로를 선택해주세요";
        if (!shared.customer_name.trim())
            e.customer_name = "고객이름을 입력해주세요";
        items.forEach((item, idx) => {
            if (!item.order_method)
                e[`${idx}_order_method`] = "주문방법을 선택해주세요";
            if (!item.print_items.trim())
                e[`${idx}_print_items`] = "인쇄항목을 입력해주세요";
            if (
                item.special_details_yn === "있음" &&
                !item.special_details.trim()
            )
                e[`${idx}_special_details`] = "특이사항 내용을 입력해주세요";
        });
        return e;
    };

    // ── 제출 ─────────────────────────────────────────────────
    const handleSubmit = async () => {
        const e = validate();
        if (Object.keys(e).length > 0) {
            setErrors(e);
            return;
        }
        setLoading(true);
        try {
            const groupId =
                items.length > 1 ? crypto.randomUUID() : null;

            for (const item of items) {
                // 파일 업로드
                const filePaths: string[] = [];
                const uploadedFiles: {
                    url: string;
                    name: string;
                    size: number;
                }[] = [];
                for (const file of item.files) {
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
                    item.post_processing === "기타"
                        ? `기타: ${item.post_processing_note}`
                        : item.post_processing;

                const { data: newTask, error: insertError } = await supabase
                    .from("tasks")
                    .insert({
                        order_source: shared.order_source,
                        customer_name: shared.customer_name.trim(),
                        order_method: item.order_method,
                        order_method_note:
                            item.order_method_note.trim() || null,
                        print_items: item.print_items.trim(),
                        post_processing: postProc,
                        file_paths: filePaths.length > 0 ? filePaths : null,
                        consult_path: shared.consult_path,
                        consult_link: shared.consult_link.trim() || null,
                        special_details:
                            item.special_details_yn === "있음"
                                ? item.special_details.trim()
                                : null,
                        is_quick: QUICK_METHODS.includes(item.order_method),
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
            {/* 헤더 */}
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
                <strong>작업 등록</strong>
                <button onClick={() => router.back()} style={closeBtn}>
                    ✕
                </button>
            </div>

            {/* ── 공유 필드 (고객 공통) ── */}
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
                                        onClick={() => setS("order_source", s)}
                                        style={toggleBtn(
                                            shared.order_source === s,
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
                                value={shared.customer_name}
                                onChange={(e) =>
                                    setS("customer_name", e.target.value)
                                }
                                placeholder="예: 스타벅스코리아"
                                style={inp(!!errors.customer_name)}
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
                                        onClick={() => setS("consult_path", p)}
                                        style={toggleBtn(
                                            shared.consult_path === p,
                                        )}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                            <input
                                type="text"
                                value={shared.consult_link}
                                onChange={(e) =>
                                    setS("consult_link", e.target.value)
                                }
                                placeholder="상담 링크 (선택)"
                                style={inp(false)}
                            />
                        </Row>
                    </tbody>
                </table>
            </div>

            {/* ── 주문 항목들 ── */}
            {items.map((item, idx) => (
                <div
                    key={idx}
                    style={{
                        margin: "0 0 0 0",
                        borderTop: "2px solid #e5e7eb",
                        background: "#fafafa",
                    }}
                >
                    {/* 항목 헤더 */}
                    <div
                        style={{
                            padding: "8px 20px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            background: "#f3f4f6",
                            borderBottom: "1px solid #e5e7eb",
                        }}
                    >
                        <span
                            style={{
                                fontWeight: 600,
                                fontSize: 13,
                                color: "#374151",
                            }}
                        >
                            주문 {idx + 1}
                            {items.length > 1 && (
                                <span
                                    style={{
                                        marginLeft: 8,
                                        fontSize: 11,
                                        color: "#6b7280",
                                        fontWeight: 400,
                                    }}
                                >
                                    묶음 등록
                                </span>
                            )}
                        </span>
                        {items.length > 1 && (
                            <button
                                type="button"
                                onClick={() => removeItem(idx)}
                                style={{
                                    background: "none",
                                    border: "1px solid #fca5a5",
                                    borderRadius: 4,
                                    color: "#ef4444",
                                    cursor: "pointer",
                                    padding: "2px 8px",
                                    fontSize: 12,
                                }}
                            >
                                삭제
                            </button>
                        )}
                    </div>

                    <table
                        style={{ width: "100%", borderCollapse: "collapse" }}
                    >
                        <tbody>
                            <Row
                                label="주문방법"
                                required
                                error={errors[`${idx}_order_method`]}
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
                                                setItem(idx, "order_method", m)
                                            }
                                            style={{
                                                ...toggleBtn(
                                                    item.order_method === m,
                                                ),
                                                ...(QUICK_METHODS.includes(m) &&
                                                item.order_method === m
                                                    ? {
                                                          background: "#15803d",
                                                          borderColor:
                                                              "#15803d",
                                                          color: "#fff",
                                                      }
                                                    : {}),
                                            }}
                                        >
                                            {m}
                                        </button>
                                    ))}
                                </div>
                                {(item.order_method === "샘플디자인 의뢰" ||
                                    item.order_method === "기타") && (
                                    <input
                                        type="text"
                                        value={item.order_method_note}
                                        onChange={(e) =>
                                            setItem(
                                                idx,
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
                                error={errors[`${idx}_print_items`]}
                            >
                                <input
                                    type="text"
                                    value={item.print_items}
                                    onChange={(e) =>
                                        setItem(
                                            idx,
                                            "print_items",
                                            e.target.value,
                                        )
                                    }
                                    placeholder="예: 반누보 200매 / 3건"
                                    style={inp(!!errors[`${idx}_print_items`])}
                                />
                            </Row>

                            <Row label="후가공">
                                <div
                                    style={{
                                        display: "flex",
                                        flexWrap: "wrap",
                                        gap: 5,
                                        marginBottom:
                                            item.post_processing === "기타"
                                                ? 6
                                                : 0,
                                    }}
                                >
                                    {POST_PROCESSINGS.map((p) => (
                                        <button
                                            key={p}
                                            type="button"
                                            onClick={() =>
                                                setItem(
                                                    idx,
                                                    "post_processing",
                                                    p,
                                                )
                                            }
                                            style={toggleBtn(
                                                item.post_processing === p,
                                            )}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                                {item.post_processing === "기타" && (
                                    <input
                                        type="text"
                                        value={item.post_processing_note}
                                        onChange={(e) =>
                                            setItem(
                                                idx,
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
                                                setItem(idx, "file_path", p)
                                            }
                                            style={toggleBtn(
                                                item.file_path === p,
                                            )}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </Row>

                            <Row label="첨부파일">
                                <FileUploadField
                                    files={item.files}
                                    onChange={(f) =>
                                        setItem(idx, "files", f)
                                    }
                                />
                            </Row>

                            <Row
                                label="처리특이사항"
                                error={errors[`${idx}_special_details`]}
                            >
                                <div
                                    style={{
                                        display: "flex",
                                        gap: 5,
                                        marginBottom:
                                            item.special_details_yn === "있음"
                                                ? 6
                                                : 0,
                                    }}
                                >
                                    {(["없음", "있음"] as const).map((v) => (
                                        <button
                                            key={v}
                                            type="button"
                                            onClick={() =>
                                                setItem(
                                                    idx,
                                                    "special_details_yn",
                                                    v,
                                                )
                                            }
                                            style={{
                                                ...toggleBtn(
                                                    item.special_details_yn ===
                                                        v,
                                                ),
                                                ...(v === "있음" &&
                                                item.special_details_yn ===
                                                    "있음"
                                                    ? {
                                                          background: "#ef4444",
                                                          borderColor:
                                                              "#ef4444",
                                                          color: "#fff",
                                                      }
                                                    : {}),
                                            }}
                                        >
                                            {v}
                                        </button>
                                    ))}
                                </div>
                                {item.special_details_yn === "있음" && (
                                    <textarea
                                        value={item.special_details}
                                        onChange={(e) =>
                                            setItem(
                                                idx,
                                                "special_details",
                                                e.target.value,
                                            )
                                        }
                                        placeholder="특이사항 내용을 입력하세요"
                                        rows={3}
                                        style={{
                                            ...inp(
                                                !!errors[
                                                    `${idx}_special_details`
                                                ],
                                            ),
                                            resize: "vertical",
                                            display: "block",
                                        }}
                                    />
                                )}
                            </Row>
                        </tbody>
                    </table>
                </div>
            ))}

            {/* + 주문 추가 버튼 */}
            <div
                style={{
                    padding: "12px 20px",
                    borderTop: "1px solid #e5e7eb",
                    background: "#fff",
                }}
            >
                <button
                    type="button"
                    onClick={addItem}
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
                    + 주문 추가 (묶음 등록)
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
                    {loading
                        ? "등록 중..."
                        : items.length > 1
                          ? `${items.length}건 묶음 등록`
                          : "작성완료"}
                </button>
            </div>
        </div>
    );
}

// ─── Row ──────────────────────────────────────────────────────
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

// ─── 스타일 ───────────────────────────────────────────────────
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
