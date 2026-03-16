import { redirect } from "next/navigation";
import { Box } from "@mui/material";
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";
import { createClient } from "@/lib/supabase/server";

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login");

    const isAdmin = user.user_metadata?.role === "admin";

    const { count: priorityCount } = await supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("is_priority", true)
        .is("deleted_at", null)
        .neq("status", "완료");

    return (
        <Box
            sx={{
                display: "flex",
                flexDirection: "column",
                minHeight: "100vh",
                bgcolor: "background.default",
            }}
        >
            <Header isAdmin={isAdmin} priorityCount={priorityCount ?? 0} />
            <Box component="main" sx={{ flex: 1 }}>
                <Box
                    sx={{
                        maxWidth: 1600,
                        mx: "auto",
                        px: { xs: 2, md: 3 },
                        py: 5,
                    }}
                >
                    {children}
                </Box>
            </Box>
            <Footer />
        </Box>
    );
}
