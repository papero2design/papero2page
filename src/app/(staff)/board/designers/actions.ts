// src/app/(classic)/board/designers/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// 관리자 여부 체크
async function assertAdmin() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("로그인이 필요합니다.");
    const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    if (data?.role !== "admin") throw new Error("관리자만 접근할 수 있습니다.");
    return { supabase, userId: user.id };
}

// ── 디자이너 / CS팀 / 외주 계정 생성 ───────────────────────────
export async function createDesignerAccount(data: {
    name: string;
    email: string;
    password: string;
    status: string;
    member_type?: "designer" | "cs" | "outsourcing";
}) {
    await assertAdmin();
    const adminClient = createAdminClient();

    const memberType = data.member_type ?? "designer";
    // [B안] role과 member_type을 1:1로 매핑. profiles_role_check에 outsourcing 추가되어 있어야 함.
    const profileRole = memberType;

    // 1. Auth 계정 생성 (user_metadata에 role 제외 — profiles trigger constraint 우회)
    const { data: authData, error: authError } =
        await adminClient.auth.admin.createUser({
            email: data.email,
            password: data.password,
            email_confirm: true,
            user_metadata: { name: data.name },
        });

    if (authError) {
        console.error(
            "[createDesignerAccount] authError full:",
            JSON.stringify(authError),
        );
        throw new Error(
            `계정 생성 실패: ${authError.message} (status: ${authError.status})`,
        );
    }

    const newUserId = authData.user.id;

    // 2. profiles 테이블에 role 등록 (트리거로 이미 생성됐을 수 있으므로 upsert)
    const { error: profileError } = await adminClient
        .from("profiles")
        .upsert(
            { id: newUserId, role: profileRole, name: data.name },
            { onConflict: "id" },
        );
    if (profileError)
        throw new Error(`프로필 생성 실패: ${profileError.message}`);

    // 3. designers 테이블에 추가 (user_id + email 함께 저장)
    const { error: designerError } = await adminClient
        .from("designers")
        .insert({
            name: data.name,
            user_id: newUserId,
            email: data.email,
            is_active: true,
            status: data.status,
            member_type: memberType,
        });
    if (designerError)
        throw new Error(`멤버 등록 실패: ${designerError.message}`);

    revalidatePath("/board/designers");
    revalidatePath("/board");
}

// ── 디자이너 정보 수정 ────────────────────────────────────────
export async function updateDesigner(
    id: string,
    data: {
        name: string;
        status: string;
        is_active: boolean;
    },
) {
    await assertAdmin();
    const supabase = await createClient();

    const { error } = await supabase
        .from("designers")
        .update({
            name: data.name,
            status: data.status,
            is_active: data.is_active,
        })
        .eq("id", id);
    if (error) throw new Error(`수정 실패: ${error.message}`);

    // profiles.name도 동기화
    const { data: designer } = await supabase
        .from("designers")
        .select("user_id")
        .eq("id", id)
        .single();
    if (designer?.user_id) {
        await supabase
            .from("profiles")
            .update({ name: data.name })
            .eq("id", designer.user_id);
    }

    revalidatePath("/board/designers");
    revalidatePath("/board");
}

// ── 아바타 업로드 URL 생성 ────────────────────────────────────
// 실제 업로드는 클라이언트에서 직접 Storage에 하고,
// 완료 후 이 액션으로 URL을 저장
export async function updateDesignerAvatar(id: string, avatarUrl: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("로그인이 필요합니다.");

    // 관리자 또는 본인만 가능
    const { data: designer } = await supabase
        .from("designers")
        .select("user_id")
        .eq("id", id)
        .single();
    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

    if (profile?.role !== "admin" && designer?.user_id !== user.id) {
        throw new Error("권한이 없습니다.");
    }

    const { error } = await supabase
        .from("designers")
        .update({ avatar_url: avatarUrl })
        .eq("id", id);
    if (error) throw new Error(`아바타 저장 실패: ${error.message}`);

    revalidatePath("/board/designers");
    revalidatePath("/board");
}

// ── 비활성화 ─────────────────────────────────────────────────
export async function deactivateDesigner(id: string) {
    await assertAdmin();
    const supabase = await createClient();

    const { error } = await supabase
        .from("designers")
        .update({ is_active: false })
        .eq("id", id);
    if (error) throw new Error(`비활성화 실패: ${error.message}`);

    revalidatePath("/board/designers");
    revalidatePath("/board");
}

// ── 재활성화 ─────────────────────────────────────────────────
export async function reactivateDesigner(id: string) {
    await assertAdmin();
    const supabase = await createClient();

    const { error } = await supabase
        .from("designers")
        .update({ is_active: true })
        .eq("id", id);
    if (error) throw new Error(`재활성화 실패: ${error.message}`);

    revalidatePath("/board/designers");
    revalidatePath("/board");
}

// ── 비밀번호 재설정 ───────────────────────────────────────────
export async function resetDesignerPassword(
    userId: string,
    newPassword: string,
) {
    await assertAdmin();
    const adminClient = createAdminClient();

    const { error } = await adminClient.auth.admin.updateUserById(userId, {
        password: newPassword,
    });
    if (error) throw new Error(`비밀번호 변경 실패: ${error.message}`);
}

// ── 기존 디자이너에 계정 연결 ─────────────────────────────────
export async function linkDesignerAccount(
    designerId: string,
    data: {
        email: string;
        password: string;
    },
) {
    await assertAdmin();
    const adminClient = createAdminClient();

    // [B안] 디자이너 이름 + member_type 함께 조회 (role 매핑에 필요)
    const { data: designerForMeta } = await adminClient
        .from("designers")
        .select("name, member_type")
        .eq("id", designerId)
        .single();

    // 1. Auth 계정 생성 (user_metadata에 role 제외 — profiles trigger constraint 우회)
    const { data: authData, error: authError } =
        await adminClient.auth.admin.createUser({
            email: data.email,
            password: data.password,
            email_confirm: true,
            user_metadata: { name: designerForMeta?.name ?? "" },
        });
    if (authError) throw new Error(`계정 생성 실패: ${authError.message}`);

    const newUserId = authData.user.id;

    // [B안] 기존 member_type을 그대로 role에 매핑 (designer/cs/outsourcing)
    const linkRole =
        (designerForMeta?.member_type as "designer" | "cs" | "outsourcing") ??
        "designer";

    // 2. profiles 등록 (트리거로 이미 생성됐을 수 있으므로 upsert)
    const { error: profileError } = await adminClient
        .from("profiles")
        .upsert(
            {
                id: newUserId,
                role: linkRole,
                name: designerForMeta?.name ?? "",
            },
            { onConflict: "id" },
        );
    if (profileError)
        throw new Error(`프로필 생성 실패: ${profileError.message}`);

    // 3. designers.user_id + email 업데이트
    const { error: linkError } = await adminClient
        .from("designers")
        .update({ user_id: newUserId, email: data.email })
        .eq("id", designerId);
    if (linkError) throw new Error(`계정 연결 실패: ${linkError.message}`);

    revalidatePath("/board/designers");
    revalidatePath("/board");
}

// ── 디자이너 영구삭제 ─────────────────────────────────────────
export async function hardDeleteDesigner(id: string) {
    await assertAdmin();
    const adminClient = createAdminClient();

    // 1. 담당 디자이너로 배정된 작업들 → 미배정
    await adminClient
        .from("tasks")
        .update({ assigned_designer_id: null })
        .eq("assigned_designer_id", id);

    // 2. 연결된 auth user 및 profile 삭제
    const { data: designer } = await adminClient
        .from("designers")
        .select("user_id")
        .eq("id", id)
        .single();

    if (designer?.user_id) {
        await adminClient.auth.admin.deleteUser(designer.user_id);
        await adminClient
            .from("profiles")
            .delete()
            .eq("id", designer.user_id);
    }

    // 3. 디자이너 레코드 삭제
    const { error } = await adminClient
        .from("designers")
        .delete()
        .eq("id", id);
    if (error) throw new Error(`영구삭제 실패: ${error.message}`);

    revalidatePath("/board/designers");
    revalidatePath("/board");
}

// ── 멤버 유형 변경 (designer ↔ cs ↔ outsourcing) ─────────────
export async function updateMemberType(
    id: string,
    // [B안] outsourcing 추가
    memberType: "designer" | "cs" | "outsourcing",
) {
    await assertAdmin();
    const adminClient = createAdminClient();

    // 1. designers.member_type 업데이트
    const { error } = await adminClient
        .from("designers")
        .update({ member_type: memberType })
        .eq("id", id);
    if (error) throw new Error(`유형 변경 실패: ${error.message}`);

    // 2. 연결된 계정이 있으면 profiles.role도 동기화
    //    (admin은 그대로 유지, designer ↔ cs ↔ outsourcing은 1:1로 role에 반영)
    const { data: designer } = await adminClient
        .from("designers")
        .select("user_id")
        .eq("id", id)
        .single();

    if (designer?.user_id) {
        const { data: profile } = await adminClient
            .from("profiles")
            .select("role")
            .eq("id", designer.user_id)
            .single();
        // admin 권한은 건드리지 않음
        if (profile?.role !== "admin") {
            // [B안] memberType을 그대로 role에 반영 (profiles_role_check에 outsourcing 추가되어 있어야 함)
            await adminClient
                .from("profiles")
                .update({ role: memberType })
                .eq("id", designer.user_id);
        }
    }

    revalidatePath("/board/designers");
    revalidatePath("/board");
}

// ── 디자이너 role 변경 (admin ↔ designer ↔ cs ↔ outsourcing) ─
export async function updateDesignerRole(
    userId: string,
    // [B안] outsourcing 추가
    newRole: "admin" | "designer" | "cs" | "outsourcing",
) {
    await assertAdmin();
    const adminClient = createAdminClient();

    const { error } = await adminClient
        .from("profiles")
        .update({ role: newRole })
        .eq("id", userId);
    if (error) throw new Error(`권한 변경 실패: ${error.message}`);

    revalidatePath("/board/designers");
    revalidatePath("/board");
}

// ── 디자이너 목록 + role 조회 (admin 전용) ───────────────────
export async function fetchDesignersWithRoles(): Promise<
    {
        id: string;
        name: string;
        status: string;
        is_active: boolean;
        avatar_url: string | null;
        user_id: string | null;
        email: string;
        role: string | null;
        member_type: string;
        /** ★v16 알림톡 등록 상태. 번호 자체는 내려보내지 않는다 (13-7-9 · 13-7-10)
         *  외주: on | none (designer_contacts) · 사내: on | off | none (staff_contacts, 계정 연결된 멤버만) */
        notify: "on" | "off" | "none" | null;
    }[]
> {
    await assertAdmin();
    const adminClient = createAdminClient();

    const { data: designers } = await adminClient
        .from("designers")
        .select("id, name, status, is_active, avatar_url, user_id, email, member_type")
        .order("name", { ascending: true });

    const userIds = (designers ?? [])
        .filter((d) => d.user_id)
        .map((d) => d.user_id as string);

    let rolesMap: Record<string, string> = {};
    if (userIds.length > 0) {
        const { data: profiles } = await adminClient
            .from("profiles")
            .select("id, role")
            .in("id", userIds);
        rolesMap = Object.fromEntries(
            (profiles ?? []).map((p) => [p.id, p.role]),
        );
    }

    // ★v16 Ch4 — 알림톡 등록 여부. designer_contacts 는 admin 으로만 읽힌다 (4-10)
    const outsourcingIds = (designers ?? [])
        .filter((d) => d.member_type === "outsourcing")
        .map((d) => d.id as string);
    const notifyOn = new Set<string>();
    if (outsourcingIds.length > 0) {
        const { data: contacts, error: contactError } = await adminClient
            .from("designer_contacts")
            .select("designer_id, phone, notify_consent_at")
            .in("designer_id", outsourcingIds);
        if (contactError) console.error("[fetchDesignersWithRoles] contacts:", contactError.message);
        for (const c of contacts ?? []) {
            if (c.phone && c.notify_consent_at) notifyOn.add(c.designer_id as string);
        }
    }

    // ★v16 Ch4-B — 사내 검수요청 알림 (staff_contacts, 키 = user_id)
    const staffUserIds = (designers ?? [])
        .filter((d) => d.member_type !== "outsourcing" && d.user_id)
        .map((d) => d.user_id as string);
    const staffNotify = new Map<string, boolean>();
    if (staffUserIds.length > 0) {
        const { data: sc, error: scError } = await adminClient
            .from("staff_contacts")
            .select("user_id, review_request_on")
            .in("user_id", staffUserIds);
        if (scError) console.error("[fetchDesignersWithRoles] staff_contacts:", scError.message);
        for (const c of sc ?? []) staffNotify.set(c.user_id as string, c.review_request_on as boolean);
    }

    return (designers ?? []).map((d) => {
        let notify: "on" | "off" | "none" | null = null;
        if (d.member_type === "outsourcing") {
            notify = notifyOn.has(d.id as string) ? "on" : "none";
        } else if (d.user_id) {
            const v = staffNotify.get(d.user_id as string);
            notify = v === undefined ? "none" : v ? "on" : "off";
        }
        return {
            ...d,
            email: d.email ?? "",
            member_type: d.member_type ?? "designer",
            role: d.user_id ? (rolesMap[d.user_id] ?? "designer") : null,
            notify,
        };
    });
}

// ── 계정 이메일 변경 (이미 연결된 계정) ──────────────────────
export async function changeDesignerEmail(userId: string, newEmail: string) {
    await assertAdmin();
    const adminClient = createAdminClient();

    const { error } = await adminClient.auth.admin.updateUserById(userId, {
        email: newEmail,
        email_confirm: true,
    });

    if (error) {
        if (
            error.message.toLowerCase().includes("user not found") ||
            error.status === 404
        ) {
            await adminClient
                .from("designers")
                .update({ user_id: null, email: null })
                .eq("user_id", userId);
            revalidatePath("/board/designers");
            throw new Error(
                "연결된 auth 계정을 찾을 수 없습니다. 계정 연결이 초기화됐습니다.\n'계정 연결' 버튼으로 다시 연결해주세요.",
            );
        }
        throw new Error(`계정 변경 실패: ${error.message}`);
    }

    // designers.email도 동기화
    await adminClient
        .from("designers")
        .update({ email: newEmail })
        .eq("user_id", userId);

    revalidatePath("/board/designers");
}