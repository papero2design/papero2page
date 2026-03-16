"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// ─── 원본 선택지 그대로 ───────────────────────────────────────

const ORDER_SOURCES = [
    "스토어팜",
    "네이버톡톡",
    "카카오톡채널",
    "직접 방문",
    "전화",
    "이메일",
    "인스타그램DM",
    "기타",
];
const ORDER_METHODS = [
    "샘플디자인 의뢰",
    "디자인복원의뢰",
    "재주문(글자수정)",
    "재주문(수정없는)",
    "인쇄만 의뢰",
    "기타",
];
const POST_PROCESSINGS = [
    "후가공없음",
    "단면박 유광",
    "단면박 무광",
    "양면 유광코팅",
    "양면 무광코팅",
    "기타",
];
const CONSULT_PATHS = [
    "카카오톡채널",
    "네이버톡톡",
    "직접방문",
    "전화",
    "이메일",
    "인스타그램DM",
    "기타",
];

interface Form {
    order_source: string;
    customer_name: string;
    order_method: string;
    print_items: string;
    post_processing: string;
    file_path: string; // 텍스트 직접 입력 (원본 방식)
    consult_path: string;
    special_notes: string; // 있음/없음
    special_details: string; // 처리특이사항 내용
    files: File[];
}

const INIT: Form = {
    order_source: "",
    customer_name: "",
    order_method: "",
    print_items: "",
    post_processing: "후가공없음",
    file_path: "없음",
    consult_path: "",
    special_notes: "없음",
    special_details: "",
    files: [],
};

type Errors = Partial<Record<keyof Form, string>>;

function validate(f: Form): Errors {
    const e: Errors = {};
    if (!f.order_source) e.order_source = "필수 항목입니다";
    if (!f.customer_name.trim()) e.customer_name = "필수 항목입니다";
    if (!f.order_method) e.order_method = "필수 항목입니다";
    if (!f.print_items.trim()) e.print_items = "필수 항목입니다";
    if (!f.post_processing) e.post_processing = "필수 항목입니다";
    if (!f.consult_path) e.consult_path = "필수 항목입니다";
    return e;
}

export default function BoardWritePage() {
    const router = useRouter();
    const [form, setForm] = useState<Form>(INIT);
    const [errors, setErrors] = useState<Errors>({});
    const [loading, setLoading] = useState(false);
    const supabase = createClient();

    const set = (key: keyof Form, value: string) => {
        setForm((prev) => ({ ...prev, [key]: value }));
        setErrors((prev) => ({ ...prev, [key]: undefined }));
    };

    const handleFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selected = Array.from(e.target.files ?? []);
        setForm((prev) => ({ ...prev, files: [...prev.files, ...selected] }));
    };

    const handleSubmit = async () => {
        const e = validate(form);
        if (Object.keys(e).length > 0) {
            setErrors(e);
            return;
        }

        setLoading(true);
        try {
            // 파일 업로드
            const filePaths: string[] = [];
            for (const file of form.files) {
                const path = `tasks/${Date.now()}_${file.name}`;
                const { error } = await supabase.storage
                    .from("task-files")
                    .upload(path, file);
                if (!error) filePaths.push(path);
            }
            // 텍스트로 직접 입력한 경로도 포함
            if (form.file_path.trim() && form.file_path !== "없음") {
                filePaths.push(form.file_path.trim());
            }

            const { error: err } = await supabase.from("tasks").insert({
                order_source: form.order_source,
                customer_name: form.customer_name.trim(),
                order_method: form.order_method,
                print_items: form.print_items.trim(),
                post_processing: form.post_processing,
                consult_path: form.consult_path,
                special_details:
                    form.special_notes === "있음" && form.special_details.trim()
                        ? form.special_details.trim()
                        : null,
                file_paths: filePaths.length > 0 ? filePaths : null,
                is_quick: ["인쇄만 의뢰", "재주문(수정없는)"].includes(
                    form.order_method,
                ),
                status: "대기중",
            });

            if (err) throw err;
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
            {/* 상단 버튼 — 원본 #bo_v_top */}
            <div id="bo_v_top" style={{ marginBottom: 10 }}>
                <ul
                    style={{
                        listStyle: "none",
                        margin: 0,
                        padding: 0,
                        display: "flex",
                        gap: 4,
                    }}
                >
                    <li>
                        <Link href="/board" style={btnLinkStyle}>
                            목록보기
                        </Link>
                    </li>
                </ul>
            </div>

            {/* 입력 테이블 — 원본 .tbl_frm01.tbl_wrap */}
            <div className="tbl_frm01 tbl_wrap">
                <table style={{ borderCollapse: "collapse", width: "100%" }}>
                    <tbody>
                        <FormRow
                            label="주문경로"
                            required
                            error={errors.order_source}
                        >
                            <select
                                style={selStyle}
                                value={form.order_source}
                                onChange={(e) =>
                                    set("order_source", e.target.value)
                                }
                            >
                                <option value="">-- 선택 --</option>
                                {ORDER_SOURCES.map((v) => (
                                    <option key={v} value={v}>
                                        {v}
                                    </option>
                                ))}
                            </select>
                        </FormRow>

                        <FormRow
                            label="고객이름"
                            required
                            error={errors.customer_name}
                        >
                            <input
                                style={inpStyle}
                                type="text"
                                value={form.customer_name}
                                onChange={(e) =>
                                    set("customer_name", e.target.value)
                                }
                                placeholder="홍길동"
                            />
                        </FormRow>

                        <FormRow
                            label="주문방법"
                            required
                            error={errors.order_method}
                        >
                            <select
                                style={selStyle}
                                value={form.order_method}
                                onChange={(e) =>
                                    set("order_method", e.target.value)
                                }
                            >
                                <option value="">-- 선택 --</option>
                                {ORDER_METHODS.map((v) => (
                                    <option key={v} value={v}>
                                        {v}
                                    </option>
                                ))}
                            </select>
                        </FormRow>

                        <FormRow
                            label="인쇄항목"
                            required
                            error={errors.print_items}
                        >
                            <textarea
                                style={{
                                    ...inpStyle,
                                    height: 60,
                                    resize: "vertical",
                                }}
                                value={form.print_items}
                                onChange={(e) =>
                                    set("print_items", e.target.value)
                                }
                                placeholder="예: 양면 무광코팅 명함 500매"
                            />
                        </FormRow>

                        <FormRow
                            label="후가공"
                            required
                            error={errors.post_processing}
                        >
                            <select
                                style={selStyle}
                                value={form.post_processing}
                                onChange={(e) =>
                                    set("post_processing", e.target.value)
                                }
                            >
                                {POST_PROCESSINGS.map((v) => (
                                    <option key={v} value={v}>
                                        {v}
                                    </option>
                                ))}
                            </select>
                        </FormRow>

                        {/* 파일전달경로 — 텍스트 입력 + 파일 첨부 */}
                        <FormRow label="파일전달경로">
                            <input
                                style={inpStyle}
                                type="text"
                                value={form.file_path}
                                onChange={(e) =>
                                    set("file_path", e.target.value)
                                }
                                placeholder="없음 또는 경로 입력"
                            />
                            <div style={{ marginTop: 4 }}>
                                <input
                                    type="file"
                                    multiple
                                    onChange={handleFiles}
                                    style={{ fontSize: 12, color: "#555" }}
                                />
                            </div>
                            {form.files.length > 0 && (
                                <ul
                                    style={{
                                        margin: "4px 0 0",
                                        padding: "0 0 0 16px",
                                        fontSize: 12,
                                        color: "#555",
                                    }}
                                >
                                    {form.files.map((f, i) => (
                                        <li key={i}>{f.name}</li>
                                    ))}
                                </ul>
                            )}
                        </FormRow>

                        <FormRow
                            label="상담경로"
                            required
                            error={errors.consult_path}
                        >
                            <select
                                style={selStyle}
                                value={form.consult_path}
                                onChange={(e) =>
                                    set("consult_path", e.target.value)
                                }
                            >
                                <option value="">-- 선택 --</option>
                                {CONSULT_PATHS.map((v) => (
                                    <option key={v} value={v}>
                                        {v}
                                    </option>
                                ))}
                            </select>
                        </FormRow>

                        {/* 처리특이사항 — 있음/없음 선택 + 내용 입력 */}
                        <FormRow label="처리특이사항">
                            <select
                                style={{ ...selStyle, width: "auto" }}
                                value={form.special_notes}
                                onChange={(e) =>
                                    set("special_notes", e.target.value)
                                }
                            >
                                <option value="없음">없음</option>
                                <option value="있음">있음</option>
                            </select>
                        </FormRow>

                        {form.special_notes === "있음" && (
                            <FormRow label="처리특이사항 내용">
                                <textarea
                                    style={{
                                        ...inpStyle,
                                        height: 80,
                                        resize: "vertical",
                                    }}
                                    value={form.special_details}
                                    onChange={(e) =>
                                        set("special_details", e.target.value)
                                    }
                                    placeholder="특이사항 내용을 입력해주세요"
                                />
                            </FormRow>
                        )}
                    </tbody>
                </table>
            </div>

            {/* 하단 버튼 */}
            <div
                style={{
                    marginTop: 10,
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 4,
                }}
            >
                <Link href="/board" style={btnLinkStyle}>
                    취소
                </Link>
                <button
                    onClick={handleSubmit}
                    disabled={loading}
                    style={{
                        ...btnStyle,
                        background: "#333",
                        color: "#fff",
                        borderColor: "#333",
                    }}
                >
                    {loading ? "저장 중..." : "저장"}
                </button>
            </div>
        </div>
    );
}

// ─── 폼 행 컴포넌트 ──────────────────────────────────────────

function FormRow({
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
        <tr>
            <th
                style={{
                    border: "1px solid #ccc",
                    background: "#f5f5f5",
                    padding: "7px 10px",
                    textAlign: "left",
                    fontWeight: 600,
                    fontSize: 13,
                    color: "#333",
                    width: "20%",
                    whiteSpace: "nowrap",
                    verticalAlign: "top",
                }}
            >
                {label}
                {required && (
                    <span style={{ color: "red", marginLeft: 2 }}>*</span>
                )}
            </th>
            <td
                style={{
                    border: "1px solid #ccc",
                    padding: "6px 10px",
                    verticalAlign: "top",
                }}
            >
                {children}
                {error && (
                    <p
                        style={{
                            margin: "3px 0 0",
                            fontSize: 11,
                            color: "red",
                        }}
                    >
                        {error}
                    </p>
                )}
            </td>
        </tr>
    );
}

// ─── 스타일 상수 ──────────────────────────────────────────────

const inpStyle: React.CSSProperties = {
    width: "100%",
    padding: "3px 6px",
    border: "1px solid #ccc",
    borderRadius: 2,
    fontSize: 13,
    boxSizing: "border-box",
    fontFamily: "inherit",
};

const selStyle: React.CSSProperties = {
    ...inpStyle,
    background: "#fff",
    width: "auto",
    minWidth: 160,
};

const btnStyle: React.CSSProperties = {
    padding: "4px 14px",
    fontSize: 12,
    background: "#fff",
    border: "1px solid #aaa",
    cursor: "pointer",
    borderRadius: 2,
    color: "#333",
};

const btnLinkStyle: React.CSSProperties = {
    ...btnStyle,
    textDecoration: "none",
    display: "inline-block",
};
