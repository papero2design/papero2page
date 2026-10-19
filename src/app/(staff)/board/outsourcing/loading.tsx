// src/app/(staff)/board/outsourcing/loading.tsx
//
// 사내 외주목록. page.tsx 가 tasks + designers 를 기다리는 동안 뜬다.
// 실제 화면 = 서브탭 줄(borderBottom 1px, marginBottom 16) + 표. 툴바 없음.
import { Skeleton, TableRowsSkeleton } from "@/lib/ui/Skeleton";

export default function OutsourcingBoardLoading() {
    return (
        <div>
            {/* 서브탭 — 실제 버튼 padding "8px 16px" 과 같은 높이 */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    marginBottom: 16,
                    borderBottom: "1px solid #e5e7eb",
                }}
            >
                {[72, 64, 80, 56].map((w, i) => (
                    <div key={i} style={{ padding: "8px 16px" }}>
                        <Skeleton w={w} h={16} />
                    </div>
                ))}
            </div>
            <TableRowsSkeleton rows={6} toolbar={false} />
        </div>
    );
}