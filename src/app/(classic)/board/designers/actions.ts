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

// ── 디자이너 계정 생성 ────────────────────────────────────────
export async function createDesignerAccount(data: {
    name: string;
    email: string;
    password: string;
    status: string;
}) {
    await assertAdmin();
    const adminClient = createAdminClient();

    // 1. Auth 계정 생성
    // email_confirm 제거 — 일부 Supabase 환경에서 "User not allowed" 유발
    const { data: authData, error: authError } =
        await adminClient.auth.admin.createUser({
            email: data.email,
            password: data.password,
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

    // 2. profiles 테이블에 role = 'designer' 등록
    const { error: profileError } = await adminClient.from("profiles").insert({
        id: newUserId,
        role: "designer",
        name: data.name,
    });
    if (profileError)
        throw new Error(`프로필 생성 실패: ${profileError.message}`);

    // 3. designers 테이블에 추가 (user_id 연결)
    const { error: designerError } = await adminClient
        .from("designers")
        .insert({
            name: data.name,
            user_id: newUserId,
            is_active: true,
            status: data.status,
        });
    if (designerError)
        throw new Error(`디자이너 등록 실패: ${designerError.message}`);

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

    // 디버그: 어느 디자이너에 연결하는지 확인
    console.log(
        "[linkDesignerAccount] designerId:",
        designerId,
        "email:",
        data.email,
    );

    // 1. Auth 계정 생성
    const { data: authData, error: authError } =
        await adminClient.auth.admin.createUser({
            email: data.email,
            password: data.password,
        });
    if (authError) throw new Error(`계정 생성 실패: ${authError.message}`);

    const newUserId = authData.user.id;
    console.log("[linkDesignerAccount] newUserId:", newUserId);

    // 2. 디자이너 이름 조회 (adminClient로 통일)
    const { data: designerRow } = await adminClient
        .from("designers")
        .select("name")
        .eq("id", designerId)
        .single();

    // 3. profiles 등록
    const { error: profileError } = await adminClient.from("profiles").insert({
        id: newUserId,
        role: "designer",
        name: designerRow?.name ?? "",
    });
    if (profileError)
        throw new Error(`프로필 생성 실패: ${profileError.message}`);

    // 4. designers.user_id 업데이트 (adminClient로 통일 — RLS 우회)
    const { error: linkError, data: updated } = await adminClient
        .from("designers")
        .update({ user_id: newUserId })
        .eq("id", designerId)
        .select("id, name");

    console.log(
        "[linkDesignerAccount] updated:",
        updated,
        "error:",
        linkError?.message,
    );
    if (linkError) throw new Error(`계정 연결 실패: ${linkError.message}`);

    revalidatePath("/board/designers");
    revalidatePath("/board");
}

// ── 계정 이메일 변경 (이미 연결된 계정) ──────────────────────
export async function changeDesignerEmail(userId: string, newEmail: string) {
    await assertAdmin();
    const adminClient = createAdminClient();

    console.log("[changeDesignerEmail] userId:", userId, "newEmail:", newEmail);

    const { data, error } = await adminClient.auth.admin.updateUserById(
        userId,
        {
            email: newEmail,
            email_confirm: true,
        },
    );

    if (error) {
        console.error("[changeDesignerEmail] error:", JSON.stringify(error));
        throw new Error(`계정 변경 실패: ${error.message}`);
    }

    console.log("[changeDesignerEmail] success:", data.user?.email);
    revalidatePath("/board/designers");
}
