// src/app/(auth)/login/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";
import Image from "next/image";

const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
);

export default function LoginPage() {
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleLogin = async () => {
        if (!email || !password) return;
        setError("");
        setLoading(true);

        console.log("email", email);
        console.log("email", password);

        const { data, error: authError } =
            await supabase.auth.signInWithPassword({ email, password });

        if (authError) {
            setError("이메일 또는 비밀번호가 올바르지 않습니다.");
            setLoading(false);
            return;
        }

        // 역할에 따라 다른 페이지로 이동
        const userId = data.user?.id;
        let dest = "/board";

        if (userId) {
            const { data: profile } = await supabase
                .from("profiles")
                .select("role")
                .eq("id", userId)
                .single();

            if (profile?.role === "designer") {
                const { data: designer } = await supabase
                    .from("designers")
                    .select("id")
                    .eq("user_id", userId)
                    .single();
                if (designer) dest = `/board/designers/${designer.id}`;
            }
        }

        // router.refresh() → 서버 컴포넌트 캐시 초기화 후 이동
        router.refresh();
        router.push(dest);
    };

    return (
        <div
            style={{
                minHeight: "100vh",
                background: "#f9fafb",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: 16,
            }}
        >
            <div
                style={{
                    width: "100%",
                    maxWidth: 400,
                    background: "#fff",
                    border: "1px solid #e5e7eb",
                    borderRadius: 12,
                    padding: "36px 32px",
                    boxShadow: "0 4px 24px rgba(0,0,0,0.06)",
                }}
            >
                {/* 로고 */}
                <div
                    style={{
                        display: "flex",
                        justifyContent: "center",
                        marginBottom: 28,
                    }}
                >
                    <Image
                        src="/logo.png"
                        alt="우리 디자인을 부탁해"
                        width={400}
                        height={150}
                        style={{ objectFit: "contain" }}
                        priority
                    />
                </div>

                {error && (
                    <div
                        style={{
                            padding: "10px 14px",
                            marginBottom: 16,
                            background: "#fef2f2",
                            border: "1px solid #fecaca",
                            borderRadius: 8,
                            color: "#dc2626",
                            fontWeight: 600,
                        }}
                    >
                        ⚠ {error}
                    </div>
                )}

                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 12,
                    }}
                >
                    <div>
                        <label
                            style={{
                                display: "block",
                                marginBottom: 5,
                                fontWeight: 600,
                                color: "#374151",
                            }}
                        >
                            이메일
                        </label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            onKeyDown={(e) =>
                                e.key === "Enter" && handleLogin()
                            }
                            placeholder="example@email.com"
                            autoFocus
                            style={{
                                width: "100%",
                                padding: "9px 12px",
                                border: "1px solid #d1d5db",
                                borderRadius: 8,
                                outline: "none",
                                fontSize: 15,
                                boxSizing: "border-box",
                            }}
                        />
                    </div>
                    <div>
                        <label
                            style={{
                                display: "block",
                                marginBottom: 5,
                                fontWeight: 600,
                                color: "#374151",
                            }}
                        >
                            비밀번호
                        </label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            onKeyDown={(e) =>
                                e.key === "Enter" && handleLogin()
                            }
                            placeholder="••••••••"
                            style={{
                                width: "100%",
                                padding: "9px 12px",
                                border: "1px solid #d1d5db",
                                borderRadius: 8,
                                outline: "none",
                                fontSize: 15,
                                boxSizing: "border-box",
                            }}
                        />
                    </div>
                    <button
                        onClick={handleLogin}
                        disabled={loading || !email || !password}
                        style={{
                            marginTop: 4,
                            width: "100%",
                            padding: "11px",
                            background:
                                loading || !email || !password
                                    ? "#d1d5db"
                                    : "#111827",
                            color: "#fff",
                            border: "none",
                            borderRadius: 8,
                            cursor:
                                loading || !email || !password
                                    ? "not-allowed"
                                    : "pointer",
                            fontWeight: 700,
                            fontSize: 15,
                            transition: "background 0.1s",
                        }}
                    >
                        {loading ? "로그인 중..." : "로그인"}
                    </button>
                </div>

                <p
                    style={{
                        marginTop: 20,
                        textAlign: "center",
                        color: "#d1d5db",
                        fontSize: 13,
                    }}
                >
                    계정이 없다면 관리자에게 문의하세요.
                </p>
            </div>
        </div>
    );
}
