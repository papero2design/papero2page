// src/app/(worker)/outsourcing/page.tsx
//
// 기다리지 않는다. fetch 3개를 Promise 로 만들어 그대로 넘기고, 각각 도착하는 대로
// 클라이언트 상태에 흘러 들어간다 (lib/ui/Feed). 헤더·검색·접속 바는 즉시 뜬다.
// 인증·role 분기는 middleware, 데이터 권한은 actions 의 assertOutsourcing (v11 6-2).
import OutsourcingClient from "./OutsourcingClient";
import { feedSafe } from "@/lib/ui/feedSafe";
import {
    fetchAvailableOutsourcingTasks,
    fetchDoneOutsourcingTasks,
    fetchMyOutsourcingTasks,
} from "./actions";

export const dynamic = "force-dynamic";

export default function OutsourcingPage() {
    // await 없음. 셋이 병렬로 시작되고 각자 끝나는 대로 스트리밍된다
    const availablePromise = feedSafe(fetchAvailableOutsourcingTasks());
    const minePromise = feedSafe(fetchMyOutsourcingTasks());
    const donePromise = feedSafe(fetchDoneOutsourcingTasks());

    return (
        <OutsourcingClient
            availablePromise={availablePromise}
            minePromise={minePromise}
            donePromise={donePromise}
        />
    );
}