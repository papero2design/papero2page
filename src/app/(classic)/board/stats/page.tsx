// src/app/(classic)/board/stats/page.tsx
import { Suspense } from "react";
import StatsClient from "./StatsClient";

export default function StatsPage() {
    return (
        <Suspense>
            <StatsClient />
        </Suspense>
    );
}
