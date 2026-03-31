// ─────────────────────────────────────────────────────────────
// database.ts — 타입 정의
//
// 원칙: 이 파일 = 실제 DB 스키마와 1:1 대응
// DB 컬럼 추가/변경 시 반드시 여기도 수정
// 그 다음 TASK_SELECT 문자열도 수정
// ─────────────────────────────────────────────────────────────

export type DesignerStatus = "연차" | "반차" | "외출" | "작업중" | "바쁨";
export type TaskStatus = "작업중" | "완료";

// ── designers 테이블 ──────────────────────────────────────────
export interface Designer {
    id: string;
    name: string;
    is_active: boolean;
    status: DesignerStatus;
    avatar_url: string | null;
    created_at: string;
}

// ── tasks 테이블 ──────────────────────────────────────────────
export interface Task {
    id: string;
    task_number: number | null; // BIGSERIAL 자동 채번

    // 입력 필드
    order_source: string; // 주문경로 ✱필수
    customer_name: string; // 고객이름 ✱필수
    order_method: string; // 주문방법 ✱필수
    order_method_note: string | null;
    print_items: string; // 인쇄항목 ✱필수
    post_processing: string | null;
    file_paths: string[] | null;
    consult_path: string | null;
    consult_link: string | null;
    special_details: string | null; // 처리특이사항
    registered_by: string | null; // 등록자

    // 상태 및 할당
    assigned_designer_id: string | null; // FK → designers.id
    status: TaskStatus;
    is_priority: boolean;
    is_quick: boolean;

    // 묶음 주문 (같은 고객의 여러 건)
    group_id: string | null; // UUID — 같은 그룹끼리 공유

    // 시간
    created_at: string;
    completed_at: string | null;
    deleted_at: string | null; // NULL = 정상, NOT NULL = 휴지통

    // 조인 (SELECT 시에만 포함)
    designer?: Designer;
}

// ── task_logs 테이블 ──────────────────────────────────────────
export interface TaskLog {
    id: string;
    task_id: string;
    user_id: string | null;
    changed_field: string;
    old_value: string | null;
    new_value: string | null;
    reason: string | null;
    created_at: string;
}

// ── Supabase 조인 결과 타입 ───────────────────────────────────
export type DesignerJoin = { id: string; name: string } | null;

// ── 게시판 목록 타입 ──────────────────────────────────────────
export type TaskWithDesigner = Pick<
    Task,
    | "id"
    | "task_number"
    | "customer_name"
    | "order_source"
    | "order_method"
    | "order_method_note"
    | "print_items"
    | "post_processing"
    | "file_paths"
    | "consult_path"
    | "consult_link"
    | "special_details"
    | "registered_by"
    | "group_id"
    | "status"
    | "is_priority"
    | "is_quick"
    | "created_at"
    | "deleted_at"
> & {
    designer: DesignerJoin;
};

// ── 완료 목록 타입 ────────────────────────────────────────────
export type RecentDoneTask = Pick<
    Task,
    | "id"
    | "task_number"
    | "customer_name"
    | "order_source"
    | "print_items"
    | "completed_at"
> & {
    designer: DesignerJoin;
};

// ── 작업 등록/수정 폼 타입 ────────────────────────────────────
export interface TaskFormValues {
    order_source: string;
    customer_name: string;
    order_method: string;
    order_method_note: string;
    print_items: string;
    post_processing: string;
    consult_path: string;
    consult_link: string;
    special_details: string;
    assigned_designer_id: string;
    registered_by: string;
    is_priority: boolean;
    is_quick: boolean;
}

export const TASK_FORM_DEFAULTS: TaskFormValues = {
    order_source: "스토어팜",
    customer_name: "",
    order_method: "",
    order_method_note: "",
    print_items: "",
    post_processing: "없음",
    consult_path: "",
    consult_link: "",
    special_details: "",
    assigned_designer_id: "",
    registered_by: "",
    is_priority: false,
    is_quick: false,
};

export const REQUIRED_FIELDS: (keyof TaskFormValues)[] = [
    "order_source",
    "customer_name",
    "order_method",
    "print_items",
];

export const REQUIRED_FIELD_LABELS: Record<string, string> = {
    order_source: "주문경로",
    customer_name: "고객이름",
    order_method: "주문방법",
    print_items: "인쇄항목",
};
