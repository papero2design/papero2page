// src/app/(worker)/outsourcing/loading.tsx
//
// 외주 작업자 화면. page.tsx 가 fetch 3개를 기다리는 동안 뜬다.
// 이 화면은 헤더까지 OutsourcingClient 가 그리므로 헤더 자리도 같이 잡아야
// 데이터 도착 순간 본문이 아래로 밀리지 않는다.
// 반응형 규칙은 OutsourcingClient 의 HEAD_CSS 와 동일. 접두어만 osl- 로 격리.
import { Skeleton, CardListSkeleton } from "@/lib/ui/Skeleton";

const CSS = `
.osl-head {
  display: flex; flex-wrap: wrap; align-items: center; gap: 12px;
  padding: 12px 16px; background: #fff; border-bottom: 1px solid #e5e7eb;
}
.osl-head-search { order: 3; flex: 1 1 100%; }
.osl-head-right { margin-left: auto; display: flex; align-items: center; gap: 12px; }
.osl-body { display: grid; grid-template-columns: 1fr; gap: 16px; padding: 16px; align-items: start; }
@media (min-width: 768px) {
  .osl-head { display: grid; grid-template-columns: 1fr minmax(0, 28rem) 1fr; padding: 14px 24px; }
  .osl-head-search { order: 0; flex: none; }
  .osl-head-right { margin-left: 0; justify-self: end; }
  .osl-body { grid-template-columns: 1fr 1fr; gap: 24px; padding: 24px; }
}
`;

function SectionHead() {
    // 실제: h2 fontSize 16 fontWeight 800 + "N건", marginBottom 14
    return (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
            <Skeleton w={120} h={18} />
            <Skeleton w={28} h={13} />
        </div>
    );
}

export default function OutsourcingLoading() {
    return (
        <div style={{ minHeight: "100vh", background: "#f9fafb" }} aria-busy="true">
            <style>{CSS}</style>
            <div className="osl-head">
                <Skeleton w={140} h={36} r={4} />                       {/* 로고 height 36 */}
                <div className="osl-head-search">
                    <Skeleton w="100%" h={38} r={8} />                   {/* 검색 input */}
                </div>
                <div className="osl-head-right">
                    <Skeleton w={32} h={32} circle />
                    <Skeleton w={76} h={36} r={8} />                     {/* 로그아웃 */}
                </div>
            </div>
            <div className="osl-body">
                <div>
                    <SectionHead />
                    <CardListSkeleton count={3} lines={2} />
                </div>
                <div>
                    <SectionHead />
                    <CardListSkeleton count={2} lines={3} />
                </div>
            </div>
        </div>
    );
}