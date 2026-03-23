// src/app/(classic)/board/designers/[id]/page.tsx
// 서버 쿼리 없음 — 데이터는 DesignerBoardClient에서 클라이언트 직접 조회
import { Suspense } from "react";
import DesignerBoardClient from "./DesignerBoardClient";

export default async function DesignerBoardPage({
    params,
}: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;
    return (
        <Suspense>
            <DesignerBoardClient designerId={id} />
        </Suspense>
    );
}
