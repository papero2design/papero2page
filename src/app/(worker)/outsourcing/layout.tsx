// src/app/outsourcing/layout.tsx
//
// 이 레이아웃은 화면을 그리지 않는다. Provider 로 감싸고 채팅 위젯만 얹는다.
// 외주 화면의 헤더·로그아웃은 OutsourcingClient 가 이미 그리고 있다.
import { getPresenceUser } from "@/lib/presence/server";
import { createClient} from "@/lib/supabase/server";
import { PresenceProvider } from "@/lib/presence/PresenceProvider";
import { ChatProvider } from "@/lib/chat/ChatProvider";
import ChatWidget from "@/lib/chat/ChatWidget";

export default async function OutsourcingLayout({
                                                    children,
                                                }: {
    children: React.ReactNode;
}) {
    const supabase = await createClient();
    const { data: { user }} = await supabase.auth.getUser();
    const me = await getPresenceUser(supabase, user);

    return (
        <PresenceProvider me={me}>
            <ChatProvider myUserId={me?.userId ?? null}>
                {children}
                <ChatWidget />
            </ChatProvider>
        </PresenceProvider>
    );
}
