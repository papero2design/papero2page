// src/app/api/r2/delete/route.ts
import { NextRequest, NextResponse } from "next/server";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { createR2Client } from "@/lib/r2/client";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
    const supabase = await createClient();
    const {
        data: { user },
    } = await supabase.auth.getUser();
    if (!user)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { bucket, key } = await req.json();
    if (!bucket || !key)
        return NextResponse.json(
            { error: "bucket, key 필요" },
            { status: 400 },
        );
    if (!["avatars", "task-files"].includes(bucket))
        return NextResponse.json(
            { error: "허용되지 않은 버킷" },
            { status: 400 },
        );

    try {
        const r2 = createR2Client();
        await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("[r2/delete] error:", err);
        return NextResponse.json(
            { error: (err as Error).message },
            { status: 500 },
        );
    }
}
