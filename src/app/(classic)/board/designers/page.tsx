// src/app/(classic)/board/designers/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import DesignerManageClient from "./DesignerManageClient";

export default async function DesignersPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    if (profile?.role !== "admin") redirect("/board");

    const { data } = await supabase
        .from("designers")
        .select("id, name, status, is_active, avatar_url, user_id")
        .order("name", { ascending: true });

    const designers = data ?? [];

    // user_id가 있는 디자이너의 이메일 조회 (Service Role 필요)
    const emailMap: Record<string, string> = {};
    const userIds = designers.map((d) => d.user_id).filter(Boolean) as string[];
    if (userIds.length > 0) {
        try {
            const adminClient = createAdminClient();
            const userIdSet = new Set(userIds);

            // listUsers로 한 번에 모든 사용자 조회 (N+1 제거)
            const { data } = await adminClient.auth.admin.listUsers({
                perPage: 500,
            });

            if (data?.users) {
                data.users.forEach((user) => {
                    if (userIdSet.has(user.id) && user.email) {
                        emailMap[user.id] = user.email;
                    }
                });
            }
        } catch (e) {
            console.error("[designers page] email fetch failed:", e);
        }
    }

    // emailMap을 designers에 합쳐서 전달
    const designersWithEmail = designers.map((d) => ({
        ...d,
        email: d.user_id ? (emailMap[d.user_id] ?? "") : "",
    }));

    return (
        <div style={{ maxWidth: 900, margin: "0 auto", paddingTop: 8 }}>
            <DesignerManageClient initialDesigners={designersWithEmail} />
        </div>
    );
}
