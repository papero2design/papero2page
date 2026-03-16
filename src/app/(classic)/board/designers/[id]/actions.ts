// src/app/(classic)/board/designers/[id]/actions.ts
"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// 본인 or 관리자만 수정 가능
async function assertSelfOrAdmin(designerId: string) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error("로그인이 필요합니다.");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    if (profile?.role === "admin") return { supabase, userId: user.id };

    const { data: designer } = await supabase
        .from("designers")
        .select("user_id")
        .eq("id", designerId)
        .single();
    if (designer?.user_id !== user.id) throw new Error("권한이 없습니다.");

    return { supabase, userId: user.id };
}

export async function updateMyProfile(
    designerId: string,
    data: {
        name: string;
        status: string;
    },
) {
    const { supabase, userId } = await assertSelfOrAdmin(designerId);

    const { error } = await supabase
        .from("designers")
        .update({ name: data.name, status: data.status })
        .eq("id", designerId);
    if (error) throw new Error(`프로필 수정 실패: ${error.message}`);

    // profiles.name 동기화
    await supabase
        .from("profiles")
        .update({ name: data.name })
        .eq("id", userId);

    revalidatePath(`/board/designers/${designerId}`);
    revalidatePath("/board");
}

export async function updateMyAvatar(designerId: string, avatarUrl: string) {
    const { supabase } = await assertSelfOrAdmin(designerId);

    const { error } = await supabase
        .from("designers")
        .update({ avatar_url: avatarUrl })
        .eq("id", designerId);
    if (error) throw new Error(`아바타 저장 실패: ${error.message}`);

    revalidatePath(`/board/designers/${designerId}`);
    revalidatePath("/board");
}
