import { createClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";

/**
 * 현재 로그인한 유저가 관리자인지 확인
 * profiles 테이블의 role = 'admin' 기준
 */
export async function getIsAdmin(user: User): Promise<boolean> {
    const supabase = await createClient();
    const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    return data?.role === "admin";
}

/**
 * 현재 유저 + 관리자 여부를 한번에 반환
 */
export async function getUserWithRole() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, isAdmin: false };
    const isAdmin = await getIsAdmin(user);
    return { user, isAdmin };
}
