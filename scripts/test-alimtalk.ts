// scripts/test-alimtalk.ts
// 실행: npx tsx --env-file=.env.local scripts/test-alimtalk.ts
import { SolapiMessageService } from "solapi";

async function main() {
    const svc = new SolapiMessageService(
        process.env.SOLAPI_API_KEY!,
        process.env.SOLAPI_API_SECRET!,
    );

    const res = await svc.send({
        to: "01064511087",              // 받을 번호 (하이픈 없이)
        from: "01097673366",            // 콘솔에 등록한 발신번호 (하이픈 없이)
        kakaoOptions: {
            pfId: process.env.SOLAPI_PF_ID!,
            templateId: "KA01TP260916032048913vu7UmEbFohW",      // 승인된 템플릿 ID
            variables: {
                "#{작업자명}": "최정환",
                "#{고객명}": "김*지",
                "#{주문방법}": "로고 복원",
                "#{단가}": "5,000",
                "#{승인일}": "2026-09-16",
            },
            disableSms: true,             // 대체 문자 끔 (포인트 절약)
        },
    });
    console.log(JSON.stringify(res, null, 2));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});