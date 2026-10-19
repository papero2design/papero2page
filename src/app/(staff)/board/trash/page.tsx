// src/app/(classic)/board/trash/page.tsx
import { Suspense } from "react";
import TrashClient from "./TrashClient";

export default function TrashPage() {
    return (
        <Suspense>
            <TrashClient />
        </Suspense>
    );
}
