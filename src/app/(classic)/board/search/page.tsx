// src/app/(classic)/board/search/page.tsx
import { Suspense } from "react";
import SearchClient from "./SearchClient";

export default function SearchPage() {
    return (
        <Suspense>
            <SearchClient />
        </Suspense>
    );
}
