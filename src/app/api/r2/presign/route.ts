// src/app/api/r2/presign/route.ts
// Presigned URL 발급 — 클라이언트가 R2에 직접 업로드
import { NextRequest, NextResponse } from "next/server";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client, r2PublicUrl } from "@/lib/r2/client";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
    // 인증 확인
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { bucket, filename, contentType } = await req.json();

    if (!bucket || !filename) {
        return NextResponse.json(
            { error: "bucket, filename 필요" },
            { status: 400 },
        );
    }

    // 허용된 버킷만
    if (!["avatars", "task-files"].includes(bucket)) {
        return NextResponse.json(
            { error: "허용되지 않은 버킷" },
            { status: 400 },
        );
    }

    // key 는 R2 내부 식별자일 뿐이다. 표시용 이름은 task_files.file_name 이 갖는다.
    // 한글이 전부 _ 로 뭉개지던 걸 확장자만 남기는 쪽으로 바꾼다
    const ext = (filename.match(/\.[a-zA-Z0-9]{1,8}$/)?.[0] ?? "").toLowerCase();
    const key = `${Date.now()}_${crypto.randomUUID().slice(0, 8)}${ext}`;

    try {
        const r2 = createR2Client();
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: key,
            ContentType: contentType ?? "application/octet-stream",
        });

        const presignedUrl = await getSignedUrl(r2, command, {
            expiresIn: 300,
        }); // 5분
        const publicUrl = r2PublicUrl(bucket, key);

        return NextResponse.json({ presignedUrl, publicUrl, key });
    } catch (err) {
        console.error("[r2/presign] error:", err);
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
