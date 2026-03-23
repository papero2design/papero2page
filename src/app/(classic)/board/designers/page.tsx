// src/app/(classic)/board/designers/page.tsx
import { Suspense } from "react";
import DesignerManageClient from "./DesignerManageClient";

export default function DesignersPage() {
    return (
        <div style={{ maxWidth: 900, margin: "0 auto", paddingTop: 8 }}>
            <Suspense>
                <DesignerManageClient />
            </Suspense>
        </div>
    );
}
