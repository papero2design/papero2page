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
 * 현재 유저의 role 문자열 반환 ('admin' | 'designer' | 'cs' | null)
 */
export async function getUserRole(user: User): Promise<string | null> {
    const supabase = await createClient();
    const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    return data?.role ?? null;
}

/**
 * 현재 유저 + 관리자/CS 여부를 한번에 반환
 */
export async function getUserWithRole() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, isAdmin: false, isCs: false, role: null };
    const role = await getUserRole(user);
    return { user, isAdmin: role === "admin", isCs: role === "cs", role };
}
