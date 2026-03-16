// src/app/(classic)/board/trash/page.tsx
import { redirect } from "next/navigation";
import { getUserWithRole } from "@/lib/auth/isAdmin";
import { getTrashTasks } from "../actions";
import TrashClient from "./TrashClient";

export default async function TrashPage() {
    const { user, isAdmin } = await getUserWithRole();
    if (!user) redirect("/login");
    if (!isAdmin) redirect("/board");

    // getTrashTasks가 명시적 리턴 타입을 가지므로 타입 캐스팅 불필요
    const tasks = await getTrashTasks();

    return (
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    marginBottom: 20,
                    paddingTop: 4,
                }}
            >
                <span style={{ fontSize: 20 }}>🗑</span>
                <div>
                    <h2
                        style={{ margin: 0, fontWeight: 800, color: "#111827" }}
                    >
                        휴지통
                    </h2>
                    <p style={{ margin: 0, color: "#9ca3af" }}>
                        삭제된 작업 {tasks.length}건 — 복구하거나 영구삭제할 수
                        있습니다
                    </p>
                </div>
            </div>

            <TrashClient tasks={tasks} />
        </div>
    );
}
