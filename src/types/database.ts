// ─────────────────────────────────────────────────────────────
// database.ts — 타입 정의
//
// 원칙: 이 파일 = 실제 DB 스키마와 1:1 대응
// DB 컬럼 추가/변경 시 반드시 여기도 수정
// 그 다음 TASK_SELECT 문자열도 수정
// ─────────────────────────────────────────────────────────────

export type DesignerStatus = "연차" | "반차" | "외출" | "작업중" | "바쁨";
export type TaskStatus = "작업중" | "완료";
export type MemberType = "designer" | "cs" | "outsourcing";
export type OutsourcingStatus = "open" | "claimed" | "review" | "customer_review" | "rework" | "done";

/** ★v16 사내가 판단할 차례인 상태 — 승인 · 수정요청이 가능하다 (13-8) */
export const OUTSOURCING_REVIEWING: OutsourcingStatus[] = ["review", "customer_review"];
export type FileRole = "source" | "deliverable" | "feedback" | "internal";
export type MessageSide = "staff" | "outsourcing";
export type MessageKind = "review_request" | "rework" | "note" | "approve" | "price_changed";

export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;   // 20MB

export const FILE_ROLE_LABEL: Record<FileRole, string> = {
    source: "전달 자료",
    deliverable: "외주 결과물",
    feedback: "수정 참고",
    internal: "사내 작업물",
};

export const FILE_ROLE_STYLE: Record<FileRole, { bg: string; color: string; border: string }> = {
    source:      { bg: "#f9fafb", color: "#6b7280", border: "#e5e7eb" },
    deliverable: { bg: "#faf5ff", color: "#a21caf", border: "#e9d5ff" },
    feedback:    { bg: "#fef2f2", color: "#dc2626", border: "#fecaca" },
    internal:    { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe" },
};

export const OUTSOURCING_STATUS_LABEL: Record<OutsourcingStatus, string> = {
    open: "작업 대기",
    claimed: "작업 중",
    review: "검수 요청",
    customer_review: "고객 확인중",
    rework: "수정 요청",
    done: "완료",
};

export const OUTSOURCING_STATUS_STYLE: Record<OutsourcingStatus,
    { bg: string; color: string; border: string; }> =
    {
        open: {bg: "#f9fafb", color: "#6b7280", border: "#e5e7eb"},
        claimed: {bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe"},
        review: {bg: "#fffbeb", color: "#b45309", border: "#fde68a"},
        customer_review: {bg: "#eef2ff", color: "#4338ca", border: "#c7d2fe"},
        rework: {bg: "#fef2f2", color: "#dc2626", border: "#fecaca"},
        done: {bg: "#faf5ff", color: "#a21caf", border: "#e9d5ff"},
    };

// outsourcing(외주작업자) 테이블
export interface OutsourcingMessage {
    id: string;
    task_id: string;
    round: number;
    side: MessageSide;
    kind: MessageKind;
    body: string;
    author_id: string | null;
    author_name: string | null;
    created_at: string;
}



// ── designers 테이블 ──────────────────────────────────────────
export interface Designer {
    id: string;
    name: string;
    is_active: boolean;
    status: DesignerStatus;
    avatar_url: string | null;
    member_type: MemberType;
    created_at: string;
    // ★v16 전화번호는 여기 없다 → designer_contacts (designers 는 SELECT 가 전원 공개라서)
}

// ── ★v16 알림톡 — 서버(admin) 전용 테이블 ────────────────────────
// 두 테이블 모두 RLS ON + 정책 없음 + anon/authenticated 권한 회수.
// 브라우저 클라이언트로는 읽을 수 없다. 클라이언트 컴포넌트에서 조회하지 말 것.
export type NotifyEvent =
    | "assign"          // T1 작업 배정
    | "review_request"  // T2 검수요청 (사내 수신)
    | "rework"          // T3 수정요청
    | "approved"        // T4 작업 승인
    | "settled"         // T5 정산 완료
    | "released"        // T6 배정 해제
    | "price_changed";  // T7 단가 변경
export type NotifyStatus = "pending" | "sent" | "failed" | "skipped";

export interface DesignerContact {
    designer_id: string;
    phone: string | null;              // 숫자만, 하이픈 없이 (DB CHECK)
    notify_consent_at: string | null;  // null = 미동의 → 발송 skipped
    updated_at: string;
}

// ★v16 Ch4-B — 사내 직원 검수요청(T2) 수신. 키는 로그인 계정(profiles.id)
// 관리자는 designers 행이 없어서 designer_contacts 를 못 쓴다. 서버(admin) 전용 — 13-7-10
export interface StaffContact {
    user_id: string;
    phone: string;                 // 휴대폰 숫자만 (DB CHECK)
    notify_consent_at: string;     // 동의 없으면 행 자체가 없다
    review_request_on: boolean;    // false = 꺼둠 (번호는 유지)
    updated_at: string;
}

export interface NotificationOutbox {
    id: number;
    event: NotifyEvent;
    task_id: string | null;
    recipient_side: MessageSide;
    recipient_designer_id: string | null;  // staff 수신이면 null
    payload: Record<string, unknown>;      // 회차 · 단가 · 정산 합계 등. 개인정보 금지
    status: NotifyStatus;
    attempts: number;
    last_error: string | null;
    provider_message_id: string | null;
    created_at: string;
    sent_at: string | null;
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

    // 외주
    outsourcing_open: boolean;
    outsourcing_price: number | null;
    outsourcing_status: OutsourcingStatus | null;
    outsourcing_assigned_by_staff: boolean;
    outsourcing_round: number;
    outsourcing_visible_from_round: number;
    outsourcing_unread_staff: boolean;
    outsourcing_unread_worker: boolean;

    // 정산관련
    outsourcing_settled_at: string | null;
    outsourcing_settled_by: string | null;

    // 인쇄 접수 — 사내가 완료 탭에서 수동으로 켠다. NULL = 미접수
    print_received_at: string | null;
    print_received_by: string | null;

    // 묶음 주문 (같은 고객의 여러 건)
    group_id: string | null; // UUID — 같은 그룹끼리 공유

    // 시간
    due_at: string | null; // 마감, NULL = 마감 없음
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
    changed_by_name: string | null;
    created_at: string;
}

export interface TaskFile {
    id: string;
    task_id: string;
    file_name: string;
    file_url: string;
    file_size: number;
    created_at: string;
    uploaded_by_outsourcing: boolean;
    file_role: FileRole | null;
    outsourcing_round: number | null;
    uploaded_by_name: string | null;
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
    | "outsourcing_open"
    | "outsourcing_price"
    | "outsourcing_status"
    | "outsourcing_assigned_by_staff"
    | "outsourcing_round"
    | "outsourcing_unread_staff"
    | "outsourcing_unread_worker"
    | "outsourcing_settled_at"
    | "print_received_at"
    | "due_at"
    | "created_at"
    | "completed_at"
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
    outsourcing_open: boolean;
    outsourcing_price: string;
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
    outsourcing_open: false,
    outsourcing_price: "",
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

export const MESSAGE_KIND_LABEL: Record<MessageKind, string> = {
    review_request: "검수 요청",
    rework: "수정 요청",
    note: "메모",
    approve: "승인",
    price_changed: "단가 변경",
};

export function messageLabel(kind: MessageKind, side: MessageSide): string{
    if(kind === "note"){
        return side === "outsourcing" ? "문의" : "답변";
    }
    return MESSAGE_KIND_LABEL[kind];
}

export const MESSAGE_SIDE_LABEL: Record<MessageSide, string> = {
    staff: "사내",
    outsourcing: "외주",
};

// ── 게시판 목록 SELECT (사내 4화면 공용) ──────────────────────
// TaskWithDesigner 와 1:1. 여기에만 있고 Pick 에 없으면 타입이 모르고,
// Pick 에만 있고 여기 없으면 값이 undefined 로 온다 — 둘 다 같이 고친다
export const TASK_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, registered_by, group_id, " +
    "status, is_priority, is_quick, due_at, created_at, completed_at, deleted_at, " +
    "print_received_at, " +
    "outsourcing_open, outsourcing_price, outsourcing_status, " +
    "outsourcing_assigned_by_staff, outsourcing_round, outsourcing_unread_staff, " +
    "outsourcing_unread_worker, outsourcing_settled_at, " +
    "designer:designers(id, name)";