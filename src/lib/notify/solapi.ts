// src/lib/notify/solapi.ts
// 솔라피 발송 래퍼. ★ 서버 전용 — 클라이언트 컴포넌트에서 import 금지 (API 키)
import { SolapiMessageService } from "solapi";

export interface SendInput {
    to: string[];                         // 숫자만
    templateId: string;
    variables: Record<string, string>;    // 키는 "#{...}", 값은 전부 문자열
}

export type SendResult =
    | { ok: true; dryRun: boolean; groupId: string | null }
    | { ok: false; error: string };

/** NOTIFY_DRY_RUN 이 정확히 "0" 일 때만 실제로 보낸다. 값이 없으면 dry-run (안전한 기본값) */
export function isDryRun(): boolean {
    return process.env.NOTIFY_DRY_RUN !== "0";
}

let service: SolapiMessageService | null = null;
function getService(): SolapiMessageService {
    if (service) return service;
    const key = process.env.SOLAPI_API_KEY;
    const secret = process.env.SOLAPI_API_SECRET;
    if (!key || !secret) throw new Error("SOLAPI_API_KEY / SOLAPI_API_SECRET 없음");
    service = new SolapiMessageService(key, secret);
    return service;
}

export async function sendAlimtalk(input: SendInput): Promise<SendResult> {
    if (isDryRun()) {
        // 번호 · 변수 전체를 로그에 남기지 않는다 (개인정보). 뒷자리와 키 이름만
        console.log("[notify][dry-run]", {
            templateId: input.templateId,
            to: input.to.map((p) => `***${p.slice(-4)}`),
            keys: Object.keys(input.variables),
        });
        return { ok: true, dryRun: true, groupId: null };
    }

    const pfId = process.env.SOLAPI_PF_ID;
    const from = process.env.SOLAPI_SENDER;
    if (!pfId || !from) return { ok: false, error: "SOLAPI_PF_ID / SOLAPI_SENDER 없음" };

    try {
        const res = await getService().send(
            input.to.map((to) => ({
                to,
                from,
                kakaoOptions: {
                    pfId,
                    templateId: input.templateId,
                    variables: input.variables,
                    disableSms: true, // 대체 문자 끔 (13-7-2 ①)
                },
            })),
        );
        const failed = res.failedMessageList ?? [];
        if (failed.length > 0) {
            const reason = failed
                .map((f) => `${f.statusCode ?? ""} ${f.statusMessage ?? ""}`.trim())
                .join(" / ");
            return { ok: false, error: `솔라피 접수 실패 ${failed.length}건: ${reason}` };
        }
        // ★ 여기서 ok 는 "솔라피 접수 성공"이지 "카톡 도착"이 아니다 (13-7-7)
        return { ok: true, dryRun: false, groupId: res.groupInfo?.groupId ?? null };
    } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
}
