import type { SupabaseClient } from "@supabase/supabase-js";
import type { FileRole } from "@/types/database";

export interface UploadedFileMeta {
    file_name: string;
    file_url: string;
    file_size: number;
}

export const TASK_FILE_SELECT =
    "id, task_id, file_name, file_url, file_size, created_at, " +
    "uploaded_by_outsourcing, file_role, outsourcing_round, uploaded_by_name";
/**
 * 원본 파일명으로 내려받는 경로.
 * id 가 없으면(아직 DB 에 없는 파일 등) 원본 URL 로 폴백한다.
 * 이 파일은 "use server" 가 없는 순수 모듈이라 클라이언트에서도 import 된다
 */
export function downloadHref(
    fileId: string | null | undefined,
    fallbackUrl: string,
): string {
    return fileId ? `/api/r2/download?id=${encodeURIComponent(fileId)}` : fallbackUrl;
}

export async function recordTaskFiles(
    supabase: SupabaseClient,
    taskId: string,
    files: UploadedFileMeta[],
    role: FileRole,
    round: number | null,
    uploaderName: string | null,
): Promise<void> {
    if (files.length === 0) return;

    const { error } = await supabase.from("task_files").insert(
        files.map((f) => ({
            task_id: taskId,
            file_name: f.file_name,
            file_url: f.file_url,
            file_size: f.file_size,
            file_role: role,
            outsourcing_round: role === "source" ? null : round,
            uploaded_by_outsourcing: role === "deliverable",
            uploaded_by_name: uploaderName,
        })),
    );
    if (error) throw error;
}