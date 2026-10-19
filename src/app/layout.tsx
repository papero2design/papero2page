import type { Metadata } from "next";
import "./globals.css";
import ThemeRegistry from "@/components/common/ThemeRegistry";
import { SpeedInsights } from "@vercel/speed-insights/next"
import AppLoader from "@/components/AppLoader";

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
                <ThemeRegistry>
                    <AppLoader/>
                        {children}
                </ThemeRegistry>
                <SpeedInsights/>
            </body>
        </html>
    );
}
