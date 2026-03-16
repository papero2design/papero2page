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
            // getUserById로 각각 직접 조회 — listUsers는 페이지네이션/정렬 문제 있음
            await Promise.all(
                userIds.map(async (uid) => {
                    const {
                        data: { user },
                    } = await adminClient.auth.admin.getUserById(uid);
                    if (user?.email) emailMap[uid] = user.email;
                }),
            );
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
