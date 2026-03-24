import type { Metadata } from "next";
import "./globals.css";
import ThemeRegistry from "@/components/common/ThemeRegistry";

export const metadata: Metadata = {
    title: "우리 디자인을 부탁해",
    description: "O2 Design 작업 관리 대시보드",
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
