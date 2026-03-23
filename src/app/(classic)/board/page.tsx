// src/app/(classic)/board/page.tsx
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import BoardClient from "./BoardClient";

export default async function BoardPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) redirect("/login");

    const { data: profileData } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
    const isAdmin = profileData?.role === "admin";
    const isDesigner = profileData?.role === "designer";

    const { data: designers } = await supabase
        .from("designers")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

    return (
        <BoardClient
            isAdmin={isAdmin}
            isDesigner={isDesigner}
            designers={designers ?? []}
        />
    );
}
