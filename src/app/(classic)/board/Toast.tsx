// src/app/(classic)/board/Toast.tsx
"use client";

import { useState, useCallback } from "react";

type ToastType = "error" | "success" | "info";

export function useToast() {
    const [toast, setToast] = useState<{ message: string; type: ToastType } | null>(null);

    const showToast = useCallback((message: string, type: ToastType = "error") => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    }, []);

    const hideToast = useCallback(() => setToast(null), []);

    const ToastUI = toast ? (
        <div
            onClick={hideToast}
            style={{
                position: "fixed",
                bottom: 28,
                left: "50%",
                transform: "translateX(-50%)",
                background:
                    toast.type === "error"
                        ? "#ef4444"
                        : toast.type === "success"
                          ? "#1ED67D"
                          : "#374151",
                color: "#fff",
                padding: "13px 22px",
                borderRadius: 10,
                fontWeight: 600,
                fontSize: 14,
                zIndex: 9999,
                boxShadow: "0 4px 20px rgba(0,0,0,0.22)",
                maxWidth: "90vw",
                textAlign: "center",
                whiteSpace: "pre-line",
                cursor: "pointer",
                userSelect: "none",
            }}
        >
            {toast.message}
        </div>
    ) : null;

    return { showToast, ToastUI };
}
