import type { Metadata } from "next";
import "./globals.css";
import ThemeRegistry from "@/components/common/ThemeRegistry";

export const metadata: Metadata = {
    title: "O2Design",
    description: "디자인 작업 관리 시스템",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="ko">
            <body>
                <ThemeRegistry>{children}</ThemeRegistry>
            </body>
        </html>
    );
}
