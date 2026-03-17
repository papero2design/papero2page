// src/lib/r2/upload.ts
// 클라이언트에서 사용하는 R2 업로드 헬퍼
// presigned URL을 받아서 직접 PUT

export interface UploadResult {
    publicUrl: string;
    key: string;
}

/**
 * 파일을 R2에 업로드하고 public URL 반환
 * @param bucket  "avatars" | "task-files"
 * @param file    File 객체
 */
export async function uploadToR2(
    bucket: string,
    file: File,
): Promise<UploadResult> {
    // 1. 서버에서 presigned URL 발급
    const res = await fetch("/api/r2/presign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            bucket,
            filename: file.name,
            contentType: file.type || "application/octet-stream",
        }),
    });

    if (!res.ok) {
        const err = await res.json();
        throw new Error(`Presign 실패: ${err.error}`);
    }

    const { presignedUrl, publicUrl, key } = await res.json();

    // 2. presigned URL로 R2에 직접 PUT
    const uploadRes = await fetch(presignedUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type || "application/octet-stream" },
        body: file,
    });

    if (!uploadRes.ok) {
        throw new Error(`R2 업로드 실패: ${uploadRes.status}`);
    }

    return { publicUrl, key };
}

/**
 * R2에서 파일 삭제
 * @param bucket  "avatars" | "task-files"
 * @param url     파일의 public URL (key 추출용)
 */
export async function deleteFromR2(bucket: string, url: string): Promise<void> {
    // URL에서 key 추출: https://pub-xxx.r2.dev/KEY 형태
    const key = url.split("/").slice(3).join("/").split("?")[0];
    if (!key) return;

    await fetch("/api/r2/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bucket, key }),
    });
}
