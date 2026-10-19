// src/app/api/notify/dispatch/route.ts
// 알림톡 발송 트리거 — 문서 13-7-3
//   POST  Supabase Database Webhook (notification_outbox INSERT) → pending 처리
//   GET   주기 호출(크론) → pending + failed 재시도
// ★ 로그인 사용자용이 아니다. 시크릿 헤더로만 연다. proxy.ts 는 /api/ 를 통과시킨다
import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dispatchOutbox } from "@/lib/notify/dispatch";

export const runtime = "nodejs";      // solapi SDK · node:crypto
export const dynamic = "force-dynamic";

function authorized(req: NextRequest): boolean {
    const header = req.headers.get("authorization") ?? "";
    const secrets = [process.env.NOTIFY_WEBHOOK_SECRET, process.env.CRON_SECRET]
        .filter((s): s is string => !!s && s.length >= 16);
    return secrets.some((s) => {
        const expected = Buffer.from(`Bearer ${s}`);
        const actual = Buffer.from(header);
        return expected.length === actual.length && timingSafeEqual(expected, actual);
    });
}

async function run(req: NextRequest, includeFailed: boolean) {
    if (!authorized(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    try {
        const summary = await dispatchOutbox(includeFailed);
        return NextResponse.json(summary);
    } catch (e) {
        console.error("[notify] dispatch 실패:", e);
        return NextResponse.json({ error: "dispatch 실패" }, { status: 500 });
    }
}

// 웹훅 본문(record)은 쓰지 않는다 — 신뢰하지 않고, DB 에서 pending 을 직접 읽는다
export async function POST(req: NextRequest) {
    return run(req, false);
}

export async function GET(req: NextRequest) {
    return run(req, true);
}
