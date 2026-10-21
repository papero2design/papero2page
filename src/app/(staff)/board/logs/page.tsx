// src/app/(staff)/board/logs/page.tsx
import { Suspense } from "react";
import LogsClient from "./LogsClient";

export default function LogsPage() {
    return (
        <Suspense>
            <LogsClient />
        </Suspense>
    );
}
