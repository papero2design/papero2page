// src/app/(classic)/board/LogoutButton.tsx
"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function LogoutButton() {
    const router = useRouter();

    const handleLogout = async () => {
        const supabase = createClient();
        await supabase.auth.signOut();
        router.push("/login");
    };

    return (
        <button
            onClick={handleLogout}
            className="flex items-center hover:text-gray-600 transition-colors duration-300 p-3 hover:bg-white hover:outline-1 cursor-pointer rounded-lg outline-0 bg-gray-200 hover:outline-gray-400 ml-4 font-semibold text-gray-700"
        >
            로그아웃
        </button>
    );
}
