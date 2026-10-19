// src/app/(classic)/board/designers/[id]/page.tsx
// 직접 URL 접근 시 searchParams 방식으로 리다이렉트
import { redirect } from "next/navigation";

export default async function DesignerBoardPage({
    params,
    searchParams,
}: {
    params: Promise<{ id: string }>;
    searchParams: Promise<{ tab?: string; page?: string }>;
}) {
    const { id } = await params;
    const { tab, page } = await searchParams;
    const query = new URLSearchParams({ designer: id });
    if (tab) query.set("tab", tab);
    if (page) query.set("page", page);
    redirect(`/board?${query.toString()}`);
}
