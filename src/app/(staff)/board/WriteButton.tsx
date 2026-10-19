"use client";

import { useState } from "react";
import BoardWriteModal from "./BoardWriteModal";
import { useRouter } from "next/navigation";

export default function WriteButton({
                                        onRefresh,
                                        defaultPriority = false,
                                        assignedDesignerId = null,
                                        profileName = null,
                                        profileIsCs = false,
                                        profileIsOutsourcing = false,
                                    }: {
    onRefresh?: () => void;
    defaultPriority?: boolean;
    assignedDesignerId?: string | null;
    profileName?: string | null;
    profileIsCs?: boolean;
    profileIsOutsourcing?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    return (
        <div className="w-max">
            <button onClick={() => setOpen(true)} className="bo-btn primary">
                등록하기
            </button>
            <BoardWriteModal
                open={open}
                defaultPriority={defaultPriority}
                assignedDesignerId={assignedDesignerId}
                profileName={profileName}
                profileIsCs={profileIsCs}
                profileIsOutsourcing={profileIsOutsourcing}
                onClose={() => setOpen(false)}
                onSuccess={() => {
                    setOpen(false);
                    if (onRefresh) onRefresh();
                    else router.refresh();
                }}
            />
        </div>
    );
}