// ─────────────────────────────────────────────────────────────
// database.ts — 타입 정의
//
// 원칙: 이 파일 = 실제 DB 스키마와 1:1 대응
// DB 컬럼 추가/변경 시 반드시 여기도 수정
// 그 다음 TASK_SELECT 문자열도 수정
// ─────────────────────────────────────────────────────────────

export type DesignerStatus = "여유" | "작업중" | "바쁨";
export type TaskStatus = "대기중" | "진행중" | "검수대기" | "완료";

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

    // 상태 및 할당
    assigned_designer_id: string | null; // FK → designers.id
    status: TaskStatus;
    is_priority: boolean;
    is_quick: boolean;

    // 시간
    created_at: string;
    completed_at: string | null;
    deleted_at: string | null; // NULL = 정상, NOT NULL = 휴지통

    // 조인 (SELECT 시에만 포함)
    designer?: Designer;
}

// ── task_logs 테이블 ──────────────────────────────────────────
// migrate-task-logs.sql 실행 후 이 스키마와 일치함
// actions.ts의 insertLog()와 컬럼명 반드시 일치
export interface TaskLog {
    id: string;
    task_id: string;
    user_id: string | null; // auth.users.id — 로그인 사용자
    changed_field: string; // 변경 필드명 (예: 'status', 'assigned_designer')
    old_value: string | null; // 변경 전 값
    new_value: string | null; // 변경 후 값
    reason: string | null; // 사용자 입력 사유
    created_at: string;
}

// ── Supabase 조인 결과 타입 ───────────────────────────────────
// tasks.assigned_designer_id → designers.id 는 N:1 (다대일) 관계
// PostgREST는 N:1 조인을 단일 객체로 반환 (배열 아님!)
//   올바른 접근: task.designer?.name
//   잘못된 접근: task.designer?.[0]?.name  ← 항상 undefined
// 반대로 1:N (일대다, 예: task_files)일 때만 배열로 반환됨
export type DesignerJoin = { id: string; name: string } | null;

// ── 게시판 목록 타입 ──────────────────────────────────────────
// page.tsx의 TASK_SELECT와 반드시 일치
// 새 필드 추가: Task → Pick → TASK_SELECT 순서로 추가
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
    | "status"
    | "is_priority"
    | "is_quick"
    | "created_at"
    | "deleted_at"
> & {
    // N:1 조인 → 단일 객체 (null이면 미배정)
    // 접근: task.designer?.name, task.designer?.id
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
    is_priority: boolean;
    is_quick: boolean;
}

export const TASK_FORM_DEFAULTS: TaskFormValues = {
    order_source: "",
    customer_name: "",
    order_method: "",
    order_method_note: "",
    print_items: "",
    post_processing: "",
    consult_path: "",
    consult_link: "",
    special_details: "",
    assigned_designer_id: "",
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
