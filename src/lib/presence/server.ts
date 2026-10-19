// src/lib/presence/server.ts
import type { SupabaseClient, User } from "@supabase/supabase-js";

export interface PresenceUser {
    userId: string;          // = profiles.id = auth.uid()
    name: string;
    avatarUrl?: string | null;
}

/**
 * 접속 상태에 실을 "나" 정보를 서버에서 만든다.
 *
 *  이름이 두 테이블에 나뉘어 있다 :
 *   - profiles : 로그인 계정 (id, role, name — name 은 nullable)
 *   - designers: 사람 정보  (name NOT NULL, avatar_url) — user_id 로 연결
 *
 *   관리자 계정은 designers 행이 아예 없으므로 3단 폴백이 필요하다.
 *   designers 만 보면 관리자가 이름 없이 뜬다.
 */
export async function getPresenceUser(supabase: SupabaseClient, user: User | null,): Promise<PresenceUser | null> {
    if (!user) return null;

    // maybeSingle() 을 쓴다. single() 은 행이 없으면 에러를 던지는데,
    // 관리자는 designers 행이 없는 게 정상이다.
    const [profileRes, designerRes] = await Promise.all([
        supabase.from("profiles").select("name").eq("id", user.id).maybeSingle(),
        supabase.from("designers").select("name, avatar_url").eq("user_id", user.id).maybeSingle(),
    ]);

    return {
        userId: user.id,
        name: designerRes.data?.name ?? profileRes.data?.name ?? "(이름 없음)",
        avatarUrl: designerRes.data?.avatar_url ?? null,
    };
}
