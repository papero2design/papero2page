// src/app/api/r2/download/route.ts
// 원본 파일명으로 내려받기.
// ★ key 를 직접 받지 않는다 — task_files.id 로만 받는다.
//   key 를 받으면 /api/r2/delete 와 같은 구멍(키만 알면 누구나)이 하나 더 생긴다
import { NextRequest, NextResponse } from "next/server";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createR2Client } from "@/lib/r2/client";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const BUCKET = "task-files";

/** public URL 에서 key 추출: https://pub-xxx.r2.dev/KEY — upload.ts 와 같은 규칙 */
function keyFromUrl(url: string): string {
    return url.split("/").slice(3).join("/").split("?")[0];
}

const deny = (s: number, m: string) => NextResponse.json({ error: m }, { status: s });

export async function GET(req: NextRequest) {
    const fileId = req.nextUrl.searchParams.get("id");
    if (!fileId) return deny(400, "id 필요");

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return deny(401, "Unauthorized");

    const admin = createAdminClient();

    const { data: file } = await admin
        .from("task_files")
        .select("id, task_id, file_name, file_url, file_role, outsourcing_round")
        .eq("id", fileId)
        .single();
    if (!file) return deny(404, "파일 없음");

    const { data: profile } = await admin
        .from("profiles").select("role").eq("id", user.id).single();
    const role = profile?.role ?? null;
    const isStaff = role === "admin" || role === "designer" || role === "cs";

    if (!isStaff) {
        if (role !== "outsourcing") return deny(403, "권한 없음");
        // internal 은 사내 자체 결과물 — 외주에게 안 보인다
        if (file.file_role === "internal") return deny(403, "권한 없음");

        const { data: task } = await admin
            .from("tasks")
            .select("assigned_designer_id, outsourcing_visible_from_round")
            .eq("id", file.task_id)
            .single();
        if (!task?.assigned_designer_id) return deny(403, "권한 없음");

        // 임베드 조인(designer:designers(user_id))은 타입 추론이 안 잡혀서
        // 두 번 나눠 조회한다. 둘 다 PK 조회라 비용 차이는 없다
        const { data: d } = await admin
            .from("designers")
            .select("user_id")
            .eq("id", task.assigned_designer_id)
            .single();

        if (d?.user_id !== user.id) return deny(403, "권한 없음");

        // ★ 회차 격리를 여기서도 지킨다. 안 지키면 화면에서 숨긴
        //   이전 작업자의 결과물이 URL 로 새어나간다.
        //   source(작업 지시)는 회차와 무관하므로 자르지 않는다
        if (file.file_role !== "source") {
            const round = file.outsourcing_round ?? 1;
            if (round < (task.outsourcing_visible_from_round ?? 1)) return deny(403, "권한 없음");
        }
    }

    // 한글 파일명은 RFC 5987. filename= 만 쓰면 깨지고, filename*= 만 쓰면 구형에서 안 먹는다
    const name = file.file_name || "download";
    const ascii = name.replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
    const disposition =
        `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;

    try {
        const signed = await getSignedUrl(
            createR2Client(),
            new GetObjectCommand({
                Bucket: BUCKET,
                Key: keyFromUrl(file.file_url),
                ResponseContentDisposition: disposition,
            }),
            { expiresIn: 60 },
        );
        // 파일을 Vercel 로 통과시키지 않는다 — 용량·시간 제한에 안 걸린다
        return NextResponse.redirect(signed, 302);
    } catch (err) {
        console.error("[r2/download] error:", err);
        return deny(500, (err as Error).message);
    }
}