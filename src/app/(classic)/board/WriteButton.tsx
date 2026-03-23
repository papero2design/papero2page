"use client";

import { useState } from "react";
import BoardWriteModal from "./BoardWriteModal";
import { useRouter } from "next/navigation";

export default function WriteButton({
    onRefresh,
}: {
    onRefresh?: () => void;
}) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    return (
        <>
            <button onClick={() => setOpen(true)} className="bo-btn primary">
                등록하기
            </button>
            <BoardWriteModal
                open={open}
                onClose={() => setOpen(false)}
                onSuccess={() => {
                    setOpen(false);
                    if (onRefresh) onRefresh();
                    else router.refresh();
                }}
            />
        </>
    );
}
