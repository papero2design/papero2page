// src/lib/r2/client.ts
// Cloudflare R2 클라이언트 (S3 호환)
// 서버 전용 — Client Component에서 import 금지

import { S3Client } from "@aws-sdk/client-s3";

export function createR2Client() {
    const accountId = process.env.CLOUDFLARE_R2_ACCOUNT_ID;
    const accessKeyId = process.env.CLOUDFLARE_R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY;

    if (!accountId || !accessKeyId || !secretAccessKey) {
        throw new Error(
            "R2 환경변수 누락\n" +
                ".env.local에 CLOUDFLARE_R2_ACCOUNT_ID, " +
                "CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY 추가 필요",
        );
    }

    return new S3Client({
        region: "auto",
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
    });
}

export function r2PublicUrl(bucket: string, key: string): string {
    const base = process.env.CLOUDFLARE_R2_PUBLIC_URL ?? "";
    // 버킷별 public URL이 다를 경우 환경변수로 분리
    // 예: CLOUDFLARE_R2_PUBLIC_URL_AVATARS, CLOUDFLARE_R2_PUBLIC_URL_TASK_FILES
    const bucketUrl =
        process.env[
            `CLOUDFLARE_R2_PUBLIC_URL_${bucket.toUpperCase().replace("-", "_")}`
        ] ?? base;
    return `${bucketUrl}/${key}`;
}
