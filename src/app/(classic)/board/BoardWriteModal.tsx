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

// ─── 주문 항목 타입 ───────────────────────────────────────────
interface OrderItem {
    order_method: string;
    order_method_note: string;
    print_items: string;
    post_processing: string;
    귀도리_size: "4mm" | "6mm";
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
    귀도리_size: "4mm",
    post_processing_note: "",
    file_path: "없음",
    files: [],
    special_details_yn: "없음",
    special_details: "",
};

// ─── 공유 필드 ────────────────────────────────────────────────
const SHARED_INIT = {
    order_source: "스토어팜" as string,
    customer_name: "",
    consult_link: "",
    registered_by: "",
    is_priority: false,
};

export default function BoardWriteModal({ open, onClose, onSuccess }: Props) {
    const [shared, setShared] = useState(SHARED_INIT);
    const [items, setItems] = useState<OrderItem[]>([{ ...ITEM_INIT }]);
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [submitting, setSubmitting] = useState(false);
    const { showToast, ToastUI } = useToast();

    // 모달 열릴 때 초기화 + 등록자 자동 기입
    useEffect(() => {
        if (!open) return;
        setShared(SHARED_INIT);
        setItems([{ ...ITEM_INIT }]);
        setErrors({});
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
                    setShared((prev) => ({ ...prev, registered_by: name }));
                });
        });
    }, [open]);

    if (!open) return null;

    // ── 공유 필드 변경 ────────────────────────────────────────
    const setS = <K extends keyof typeof SHARED_INIT>(
        k: K,
        v: (typeof SHARED_INIT)[K],
    ) => {
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

    const addItem = () => setItems((prev) => [...prev, { ...ITEM_INIT }]);
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

    const buildPostProc = (item: OrderItem) => {
        if (item.post_processing === "귀도리")
            return `귀도리 ${item.귀도리_size}`;
        if (
            BOX_TYPES.includes(item.post_processing) &&
            item.post_processing_note.trim()
        )
            return `${item.post_processing} - ${item.post_processing_note.trim()}`;
        if (
            item.post_processing === "기타" &&
            item.post_processing_note.trim()
        )
            return `기타: ${item.post_processing_note.trim()}`;
        return item.post_processing;
    };

    // ── 제출 ─────────────────────────────────────────────────
    const handleSubmit = async () => {
        const e = validate();
        if (Object.keys(e).length > 0) {
            setErrors(e);
            return;
        }
        setSubmitting(true);
        try {
            const supabase = createClient();
            const groupId =
                items.length > 1 ? crypto.randomUUID() : null;

            for (const item of items) {
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
                        order_source: shared.order_source,
                        customer_name: shared.customer_name.trim(),
                        order_method: item.order_method,
                        order_method_note:
                            item.order_method_note.trim() || null,
                        print_items: item.print_items.trim(),
                        post_processing: buildPostProc(item),
                        file_paths: filePaths.length ? filePaths : null,
                        consult_path: deriveConsultPath(shared.consult_link),
                        consult_link: shared.consult_link || null,
                        special_details:
                            item.special_details_yn === "있음"
                                ? item.special_details.trim()
                                : null,
                        assigned_designer_id: null,
                        registered_by: shared.registered_by.trim() || null,
                        is_priority: shared.is_priority,
                        is_quick: false,
                        status: "작업중",
                        group_id: groupId,
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
                        throw new Error(
                            `파일 DB 저장 실패: ${filesErr.message}`,
                        );
                }
            }

            setShared(SHARED_INIT);
            setItems([{ ...ITEM_INIT }]);
            setErrors({});
            onSuccess();
            onClose();
        } catch (err) {
            showToast("등록 실패: " + (err as Error).message);
        } finally {
            setSubmitting(false);
        }
    };

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
                    {/* 헤더 */}
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
                        <strong>
                            작업 등록
                            {items.length > 1 && (
                                <span
                                    style={{
                                        marginLeft: 8,
                                        fontSize: 12,
                                        color: "#6b7280",
                                        fontWeight: 400,
                                    }}
                                >
                                    ({items.length}건 묶음)
                                </span>
                            )}
                        </strong>
                        <button onClick={onClose} style={closeBtn}>
                            ✕
                        </button>
                    </div>

                    {/* ── 공유 필드 ── */}
                    <div style={{ padding: "8px 0 4px" }}>
                        <table
                            style={{ width: "100%", borderCollapse: "collapse" }}
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
                                                    setS("order_source", s)
                                                }
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
                                            setS(
                                                "customer_name",
                                                e.target.value,
                                            )
                                        }
                                        placeholder="예: 스타벅스코리아"
                                        style={inp(!!errors.customer_name)}
                                    />
                                </Row>
                                <Row label="상담링크">
                                    <input
                                        type="url"
                                        value={shared.consult_link}
                                        onChange={(e) =>
                                            setS("consult_link", e.target.value)
                                        }
                                        placeholder="https://..."
                                        style={inp(false)}
                                    />
                                </Row>
                                <Row label="등록자">
                                    <input
                                        type="text"
                                        value={shared.registered_by}
                                        onChange={(e) =>
                                            setS(
                                                "registered_by",
                                                e.target.value,
                                            )
                                        }
                                        placeholder="등록자 이름"
                                        style={inp(false)}
                                    />
                                </Row>
                                <Row label="우선작업">
                                    <button
                                        type="button"
                                        onClick={() =>
                                            setS(
                                                "is_priority",
                                                !shared.is_priority,
                                            )
                                        }
                                        style={{
                                            ...toggleBtn(shared.is_priority),
                                            ...(shared.is_priority
                                                ? {
                                                      background: "#ef4444",
                                                      borderColor: "#ef4444",
                                                      color: "#fff",
                                                  }
                                                : {}),
                                        }}
                                    >
                                        {shared.is_priority
                                            ? "우선작업으로 등록됩니다"
                                            : "우선작업 아님"}
                                    </button>
                                </Row>
                            </tbody>
                        </table>
                    </div>

                    {/* ── 주문 항목들 ── */}
                    {items.map((item, idx) => (
                        <div
                            key={idx}
                            style={{
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
                                style={{
                                    width: "100%",
                                    borderCollapse: "collapse",
                                }}
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
                                                        setItem(
                                                            idx,
                                                            "order_method",
                                                            m,
                                                        )
                                                    }
                                                    style={toggleBtn(
                                                        item.order_method === m,
                                                    )}
                                                >
                                                    {m}
                                                </button>
                                            ))}
                                        </div>
                                        {(item.order_method ===
                                            "샘플디자인 의뢰" ||
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
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                setItem(
                                                    idx,
                                                    "print_items",
                                                    val,
                                                );
                                                if (
                                                    (val.includes("두꺼운") ||
                                                        val.includes(
                                                            "고품격",
                                                        )) &&
                                                    item.post_processing ===
                                                        "귀도리" &&
                                                    item.귀도리_size === "4mm"
                                                ) {
                                                    setItem(
                                                        idx,
                                                        "귀도리_size",
                                                        "6mm",
                                                    );
                                                }
                                            }}
                                            placeholder="예: 반누보 200매 / 3건"
                                            style={inp(
                                                !!errors[`${idx}_print_items`],
                                            )}
                                        />
                                    </Row>
                                    <Row label="후가공">
                                        <div
                                            style={{
                                                display: "flex",
                                                flexWrap: "wrap",
                                                gap: 5,
                                                marginBottom:
                                                    BOX_TYPES.includes(
                                                        item.post_processing,
                                                    ) ||
                                                    item.post_processing ===
                                                        "기타"
                                                        ? 6
                                                        : 0,
                                            }}
                                        >
                                            {POST_PROCESSINGS.map((p) => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() => {
                                                        setItem(
                                                            idx,
                                                            "post_processing",
                                                            p,
                                                        );
                                                        setItem(
                                                            idx,
                                                            "post_processing_note",
                                                            "",
                                                        );
                                                    }}
                                                    style={toggleBtn(
                                                        item.post_processing ===
                                                            p,
                                                    )}
                                                >
                                                    {p}
                                                </button>
                                            ))}
                                        </div>
                                        {item.post_processing === "귀도리" && (
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
                                                            item.print_items.includes(
                                                                "두꺼운",
                                                            ) ||
                                                            item.print_items.includes(
                                                                "고품격",
                                                            );
                                                        const disabled =
                                                            s === "4mm" &&
                                                            force6mm;
                                                        return (
                                                            <button
                                                                key={s}
                                                                type="button"
                                                                disabled={
                                                                    disabled
                                                                }
                                                                onClick={() =>
                                                                    setItem(
                                                                        idx,
                                                                        "귀도리_size",
                                                                        s,
                                                                    )
                                                                }
                                                                style={{
                                                                    ...toggleBtn(
                                                                        item.귀도리_size ===
                                                                            s,
                                                                    ),
                                                                    ...(item.귀도리_size ===
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
                                        {BOX_TYPES.includes(
                                            item.post_processing,
                                        ) && (
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
                                                placeholder="박 상세 내용 (선택)"
                                                style={{
                                                    ...inp(false),
                                                    marginTop: 6,
                                                }}
                                            />
                                        )}
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
                                        <div
                                            style={{ display: "flex", gap: 5 }}
                                        >
                                            {FILE_PATHS.map((p) => (
                                                <button
                                                    key={p}
                                                    type="button"
                                                    onClick={() =>
                                                        setItem(
                                                            idx,
                                                            "file_path",
                                                            p,
                                                        )
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
                                        error={
                                            errors[`${idx}_special_details`]
                                        }
                                    >
                                        <div
                                            style={{
                                                display: "flex",
                                                gap: 5,
                                                marginBottom:
                                                    item.special_details_yn ===
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
                            padding: "10px 20px",
                            borderTop: "1px solid #e5e7eb",
                            background: "#fff",
                        }}
                    >
                        <button
                            type="button"
                            onClick={addItem}
                            style={{
                                width: "100%",
                                padding: "7px",
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
                            {submitting
                                ? "등록 중..."
                                : items.length > 1
                                  ? `${items.length}건 묶음 등록`
                                  : "작성완료"}
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
