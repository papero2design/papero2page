// src/app/(staff)/board/notifyActions.ts
// ★v16 Ch4-B — 사내 직원 본인의 검수요청 카톡 수신 설정 (문서 13-7-10)
//
// staff_contacts 는 RLS ON + 정책 없음 + 권한 회수 → 쓰기 · 읽기 모두 admin 클라이언트.
// 인자로 user_id 를 받지 않는다. 로그인한 본인 행만 다룬다.
"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const STAFF_ROLES = ["admin", "designer", "cs"];

export type StaffNotifyState = {
    phone: string | null;
    consentAt: string | null;
    on: boolean;                  // review_request_on
    memberStatus: string | null;  // designers.status — 관리자는 null (행 없음)
};

export type StaffNotifyResult =
    | { ok: true; state: StaffNotifyState }
    | { ok: false; message: string };

async function assertStaff() {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("로그인이 필요합니다.");

    const [{ data: profile }, { data: member }] = await Promise.all([
        supabase.from("profiles").select("role").eq("id", user.id).maybeSingle(),
        // 관리자는 designers 행이 없는 게 정상 → maybeSingle
        supabase.from("designers").select("status").eq("user_id", user.id).maybeSingle(),
    ]);
    if (!STAFF_ROLES.includes((profile?.role as string | undefined) ?? "")) {
        throw new Error("사내 계정만 설정할 수 있습니다.");
    }
    return { userId: user.id, memberStatus: (member?.status as string | undefined) ?? null };
}

function normalizeMobile(v: string): string | null {
    const d = (v ?? "").replace(/\D/g, "");
    return /^01[016789]\d{7,8}$/.test(d) ? d : null;
}

async function readState(userId: string, memberStatus: string | null): Promise<StaffNotifyState> {
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("staff_contacts")
        .select("phone, notify_consent_at, review_request_on")
        .eq("user_id", userId)
        .maybeSingle();
    if (error) throw new Error(`알림 설정 조회 실패: ${error.message}`);
    return {
        phone: (data?.phone as string | undefined) ?? null,
        consentAt: (data?.notify_consent_at as string | undefined) ?? null,
        on: (data?.review_request_on as boolean | undefined) ?? false,
        memberStatus,
    };
}

export async function fetchMyStaffNotify(): Promise<StaffNotifyState> {
    const { userId, memberStatus } = await assertStaff();
    return readState(userId, memberStatus);
}

/** 처음 등록 · 번호 변경. 처음이면 켜진 상태로 시작하고, 변경이면 켜짐/꺼짐을 건드리지 않는다 */
export async function saveMyStaffNotify(input: { phone: string; consent: boolean }): Promise<StaffNotifyResult> {
    const { userId, memberStatus } = await assertStaff();

    const phone = normalizeMobile(input.phone);
    if (!phone) return { ok: false, message: "휴대폰 번호를 확인해주세요. (예: 010-1234-5678)" };
    if (input.consent !== true) {
        return { ok: false, message: "알림 수신과 개인정보 수집·이용에 동의해야 등록됩니다." };
    }

    const now = new Date().toISOString();
    const admin = createAdminClient();
    // review_request_on 을 넣지 않는다 → 새 행은 DEFAULT true, 기존 행은 값 유지
    const { error } = await admin
        .from("staff_contacts")
        .upsert(
            { user_id: userId, phone, notify_consent_at: now, updated_at: now },
            { onConflict: "user_id" },
        );
    if (error) {
        console.error("[saveMyStaffNotify]", error.message);
        return { ok: false, message: "저장하지 못했습니다. 잠시 후 다시 시도해주세요." };
    }
    return { ok: true, state: await readState(userId, memberStatus) };
}

/** 켜기 · 끄기. 번호는 그대로 둔다 */
export async function setMyStaffNotifyOn(on: boolean): Promise<StaffNotifyResult> {
    const { userId, memberStatus } = await assertStaff();
    const admin = createAdminClient();
    const { data, error } = await admin
        .from("staff_contacts")
        .update({ review_request_on: on === true, updated_at: new Date().toISOString() })
        .eq("user_id", userId)
        .select("user_id");
    if (error) {
        console.error("[setMyStaffNotifyOn]", error.message);
        return { ok: false, message: "변경하지 못했습니다. 잠시 후 다시 시도해주세요." };
    }
    if (!data || data.length === 0) return { ok: false, message: "먼저 번호를 등록해주세요." };
    return { ok: true, state: await readState(userId, memberStatus) };
}

/** 번호 삭제 = 행 삭제 (동의 철회) */
export async function removeMyStaffNotify(): Promise<StaffNotifyResult> {
    const { userId, memberStatus } = await assertStaff();
    const admin = createAdminClient();
    const { error } = await admin.from("staff_contacts").delete().eq("user_id", userId);
    if (error) {
        console.error("[removeMyStaffNotify]", error.message);
        return { ok: false, message: "삭제하지 못했습니다. 잠시 후 다시 시도해주세요." };
    }
    return { ok: true, state: { phone: null, consentAt: null, on: false, memberStatus } };
}
