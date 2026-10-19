// src/app/(staff)/board/loading.tsx
//
// /board 하위로 "서버 왕복이 있는" 이동 때 본문 자리에 뜬다 (trash · stats · designers · search 등).
// /board 자체는 page.tsx 에 서버 쿼리가 없어서 이 파일이 뜰 일이 없다 —
// 그쪽 스켈레톤은 BoardClient 의 initialLoad 가 담당한다.
// 헤더·BoardNav 는 layout 이 그리므로 여기서는 표만.
import { TableRowsSkeleton } from "@/lib/ui/Skeleton";

export default function BoardLoading() {
    return <TableRowsSkeleton rows={8} />;
}