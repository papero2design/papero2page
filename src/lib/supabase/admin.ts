// src/lib/supabase/admin.ts
// Service Role Key를 사용하는 관리자 전용 클라이언트
// 절대 클라이언트 컴포넌트에서 import하면 안 됨 — Server Action / Route Handler에서만 사용

import { createClient } from "@supabase/supabase-js";

/**
 * Supabase Admin 클라이언트
 * - auth.admin.createUser() 등 서비스 롤 작업에 사용
 * - SUPABASE_SERVICE_ROLE_KEY 환경변수 필요
 *   → .env.local에 추가: SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *   → Supabase 대시보드 Settings > API > service_role 복사
 */
export function createAdminClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
        throw new Error(
            "SUPABASE_SERVICE_ROLE_KEY가 없습니다.\n" +
                ".env.local에 SUPABASE_SERVICE_ROLE_KEY=eyJ... 를 추가하세요.",
        );
    }

    return createClient(url, key, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}
