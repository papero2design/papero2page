// src/app/(classic)/board/quick/page.tsx
import { redirect } from "next/navigation";

export default function QuickPage() {
    redirect("/board?tab=priority");
}
