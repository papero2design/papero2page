// src/app/(classic)/board/PaginationClient.tsx
"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

interface Props {
    page: number;
    totalPages: number;
}

export default function PaginationClient({ page, totalPages }: Props) {
    const searchParams = useSearchParams();

    const pageUrl = (p: number) => {
        const params = new URLSearchParams(searchParams.toString());
        params.set("page", String(p));
        return `/board?${params.toString()}`;
    };

    if (totalPages <= 1) return null;
    return (
        <nav className="pg-wrap">
            <span>
                {page > 1 && (
                    <Link href={pageUrl(1)} className="pg-link">
                        맨처음
                    </Link>
                )}
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter((p) => Math.abs(p - page) <= 4)
                    .map((p) => (
                        <Link
                            key={p}
                            href={pageUrl(p)}
                            className={`pg-link${p === page ? " active" : ""}`}
                        >
                            {p}
                        </Link>
                    ))}
                {page < totalPages && (
                    <Link href={pageUrl(totalPages)} className="pg-link">
                        맨끝
                    </Link>
                )}
            </span>
        </nav>
    );
}
