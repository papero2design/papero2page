// src/app/(classic)/board/outsourcing/page.tsx
import { createClient } from "@/lib/supabase/server";
import OutsourcingBoardClient from "./OutsourcingBoardClient";
import type { TaskWithDesigner } from "@/types/database";

const OS_SELECT =
    "id, task_number, order_source, customer_name, order_method, order_method_note, " +
    "print_items, post_processing, file_paths, " +
    "consult_path, consult_link, special_details, registered_by, group_id, " +
    "status, is_priority, is_quick, due_at, created_at, completed_at, deleted_at, " +
    "print_received_at, " +
    "outsourcing_open, outsourcing_price, outsourcing_status, " +
    "outsourcing_round, outsourcing_unread_staff, outsourcing_settled_at, " +
    "designer:designers(id, name)";

export default async function OutsourcingBoardPage() {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .maybeSingle();


    const canEditDesigner =
        profile?.role === "admin" ||
        profile?.role === "designer" ||
        profile?.role === "cs";

    const [tasksRes, designersRes] = await Promise.all([
        supabase
            .from("tasks")
            .select(OS_SELECT)
            .is("deleted_at", null)
            .not("outsourcing_status", "is", null)
            .order("created_at", { ascending: false }),
        supabase
            .from("designers")
            .select("id, name")
            .eq("is_active", true)
            .order("name"),
    ]);

    if (tasksRes.error) {
        return (
            <div style={{ padding: 40, textAlign: "center", color: "#dc2626" }}>
                외주 목록을 불러오지 못했습니다. {tasksRes.error.message}
            </div>
        );
    }

    return (
        <OutsourcingBoardClient
            initialTasks={(tasksRes.data ?? []) as unknown as TaskWithDesigner[]}
            designers={designersRes.data ?? []}
            canEditDesigner={canEditDesigner}
        />
    );
}
