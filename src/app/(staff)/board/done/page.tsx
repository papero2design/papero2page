// src/app/(classic)/board/done/page.tsx
import { redirect } from "next/navigation";

export default function DonePage() {
    redirect("/board?tab=done");
}
