// ─────────────────────────────────────────────────────────────
// logFormat.ts — task_logs 표시용 라벨 · 값 정리
//
// task_logs 의 old/new 값은 기록하는 곳마다 형식이 다르다
// ("true"/"false", ISO 시각, 30000 vs "30,000원", 삭제 시 고객이름 …).
// 이미 쌓인 데이터(구 DB 포함)도 같은 형식이라 저장이 아니라 표시 단계에서 맞춘다.
// ─────────────────────────────────────────────────────────────

export const FIELD_LABELS: Record<string, string> = {
    created: "작업 등록", // 가상 항목 — status 로그 중 이전값이 없는 것 (logFieldKey 참고)
    status: "완료 처리",
    assigned_designer: "디자이너 배정",
    is_priority: "우선작업 지정",
    order_source: "주문경로",
    customer_name: "고객이름",
    order_method: "주문방법",
    order_method_note: "주문방법 메모",
    print_items: "인쇄항목",
    post_processing: "후가공",
    consult_path: "상담 링크",
    special_details: "처리특이사항",
    registered_by: "등록자",
    outsourcing_open: "외주 맡김",
    outsourcing_price: "외주 단가",
    outsourcing_status: "외주",
    outsourcing_settled_at: "외주 정산",
    print_received_at: "인쇄 접수",
    deleted: "휴지통 이동",
    restored: "휴지통 복구",
};

/** 항목 설명 — 필터 칩에 마우스를 올리면 보인다 */
export const FIELD_HINTS: Record<string, string> = {
    created: "작업이 새로 등록됨",
    status: "작업 건 완료 · 완료 취소 (미완료 ↔ 완료)",
    assigned_designer: "작업을 맡을 디자이너(또는 외주 작업자) 배정 · 변경 · 해제",
    is_priority: "우선작업으로 지정하거나 해제",
    outsourcing_open: "사내에서 할지, 외주로 공개할지 (사내 ↔ 공개)",
    outsourcing_price: "외주 작업 단가 변경",
    outsourcing_status: "외주 작업의 단계: 작업 대기 → 작업 중 → 검수 요청 → 고객 확인중 / 수정 요청 → 완료",
    outsourcing_settled_at: "외주 작업비 정산 처리",
    print_received_at: "완료 탭에서 인쇄 접수완료 체크 · 해제",
    consult_path: "상담 링크(네이버 · 카카오 등) 변경",
    deleted: "작업을 휴지통으로 이동",
    restored: "휴지통에서 작업 복구",
};

/**
 * 로그를 분류할 항목 키. 작업 등록은 status: null → "작업중" 으로 남아서
 * 완료 처리와 같은 changed_field 를 쓰지만 화면에서는 따로 보여준다.
 */
export function logFieldKey(field: string, oldValue: string | null): string {
    return field === "status" && oldValue === null ? "created" : field;
}

/** 화면에 찍을 값. empty = 값 없음(흐리게 · 기울임) */
export type LogValue = { text: string; empty: boolean };

/** from 이 null 이면 이전값 칩과 화살표를 그리지 않는다 */
export type LogChange = { from: LogValue | null; to: LogValue | null };

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function fmtIso(iso: string) {
    const d = new Date(iso);
    return `${d.getFullYear().toString().slice(2)}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function val(text: string): LogValue {
    return { text, empty: false };
}
function none(text: string): LogValue {
    return { text, empty: true };
}

/** 항목별 빈 값 문구 */
function emptyText(field: string) {
    if (field === "assigned_designer") return "미배정";
    if (field === "outsourcing_price") return "없음";
    return "미작성";
}

/** 항목별 값 하나 정리 (null 이 아닌 값) */
function formatOne(field: string, v: string): LogValue {
    // "작업중" 은 외주 · 디자이너 작업중과 헷갈린다 — 완료 여부로만 보여준다
    if (field === "status" && v === "작업중") return val("미완료");
    if (field === "is_priority") {
        if (v === "true") return val("우선");
        if (v === "false") return val("일반");
    }
    if (field === "outsourcing_price") {
        // 상세 수정은 "30000", 단가 변경은 "30,000원" 으로 남는다
        const n = Number(v.replace(/[,원\s]/g, ""));
        if (v.trim() !== "" && Number.isFinite(n)) return val(`${n.toLocaleString("ko-KR")}원`);
    }
    if (ISO_RE.test(v)) return val(fmtIso(v));
    return val(v);
}

export function formatLogChange(
    field: string,
    oldValue: string | null,
    newValue: string | null,
): LogChange {
    switch (field) {
        // 시각만 남는 항목 — 시각은 로그 일시와 같으니 결과만 보여준다
        case "print_received_at":
            return { from: null, to: newValue ? val("접수완료") : none("접수 해제") };
        case "outsourcing_settled_at":
            return { from: null, to: newValue ? val("정산완료") : none("정산 해제") };
        // 단건 삭제는 old 에 고객이름이 들어 있다 — 고객이름 컬럼과 겹치므로 생략
        case "deleted":
            return { from: null, to: val(newValue ?? "휴지통") };
        case "restored":
            return { from: null, to: val(newValue ?? "복구됨") };
    }

    // 작업 등록 — 항목 이름("작업 등록")만으로 충분하다
    if (logFieldKey(field, oldValue) === "created") return { from: null, to: null };

    if (oldValue === null && newValue === null) return { from: null, to: null };
    return {
        from: oldValue === null ? none(emptyText(field)) : formatOne(field, oldValue),
        to: newValue === null ? none(emptyText(field)) : formatOne(field, newValue),
    };
}
