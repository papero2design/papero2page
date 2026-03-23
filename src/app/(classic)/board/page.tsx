// src/app/(classic)/board/page.tsx
// 서버 쿼리 없음 — 탭 이동 시 서버 왕복 제거
// 인증은 layout.tsx에서 처리, 데이터는 BoardClient에서 클라이언트 직접 조회
import BoardClient from "./BoardClient";

export default function BoardPage() {
    return <BoardClient />;
}
