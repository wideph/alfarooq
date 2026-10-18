import path from "path";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getFileType, getMimeType, sanitizeFilename } from "@/lib/storage";

// Cloudflare R2 is S3-compatible. Only the office module uses it; the public
// website keeps using Supabase Storage (src/lib/storage.ts).

const globalForR2 = globalThis as unknown as { r2Client?: S3Client };

export const OFFICE_FILE_MAX_BYTES = 10 * 1024 * 1024;

function getR2Config() {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const bucket = process.env.R2_BUCKET;

  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) {
    throw new Error(
      "Cloudflare R2 configure nahi hai (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)"
    );
  }

  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function isR2Configured() {
  return Boolean(
    process.env.R2_ACCOUNT_ID &&
      process.env.R2_ACCESS_KEY_ID &&
      process.env.R2_SECRET_ACCESS_KEY &&
      process.env.R2_BUCKET
  );
}

function getR2Client() {
  if (globalForR2.r2Client) return globalForR2.r2Client;
  const { accountId, accessKeyId, secretAccessKey } = getR2Config();

  globalForR2.r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });

  return globalForR2.r2Client;
}

export async function uploadOfficeFile(
  file: File,
  prefix: string
): Promise<{ key: string; type: "pdf" | "image" }> {
  const fileType = getFileType(file.type, file.name);
  if (!fileType) throw new Error("Sirf PDF ya image file allowed hai");
  if (file.size > OFFICE_FILE_MAX_BYTES) throw new Error("File 10 MB se badi nahi ho sakti");

  const ext = path.extname(file.name) || (fileType === "pdf" ? ".pdf" : ".jpg");
  const base = sanitizeFilename(path.basename(file.name, ext)).slice(0, 60);
  const key = `office/${prefix}/${Date.now()}_${base}${ext}`;
  const body = Buffer.from(await file.arrayBuffer());

  const { bucket } = getR2Config();
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: file.type?.trim() || getMimeType(key),
    })
  );

  return { key, type: fileType };
}

export const OFFICE_VIDEO_MAX_BYTES = 100 * 1024 * 1024;

// W21: word documents (verification stickers etc.) — mime + extension map.
// ContentType fallback for .doc/.docx lives here because src/lib/storage.ts
// (public website helper) stays untouched.
const WORD_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);
const WORD_EXTENSIONS = new Set([".doc", ".docx"]);
const WORD_MIME_BY_EXT: Record<string, string> = {
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

export type DepartmentFileType = "pdf" | "image" | "video" | "word";

// Department workflow files (§N7): printing proof and the attestation final file may
// be video; verification stickers (W21) may be word documents; everything else
// stays pdf/image like payment slips.
function getDepartmentFileType(mimeType: string, filename?: string): DepartmentFileType | null {
  const base = getFileType(mimeType, filename);
  if (base) return base;
  const normalizedMime = mimeType.trim().toLowerCase();
  if (normalizedMime.startsWith("video/")) return "video";
  if (WORD_MIME_TYPES.has(normalizedMime)) return "word";
  if (filename) {
    const ext = path.extname(filename).toLowerCase();
    if ([".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"].includes(ext)) return "video";
    if (WORD_EXTENSIONS.has(ext)) return "word";
  }
  return null;
}

export async function uploadDepartmentFile(
  file: File,
  prefix: string
): Promise<{ key: string; type: DepartmentFileType }> {
  const fileType = getDepartmentFileType(file.type, file.name);
  if (!fileType) throw new Error("Sirf PDF, image, video ya Word file allowed hai");
  const maxBytes = fileType === "video" ? OFFICE_VIDEO_MAX_BYTES : OFFICE_FILE_MAX_BYTES;
  if (file.size > maxBytes) {
    throw new Error(fileType === "video" ? "Video 100 MB se badi nahi ho sakti" : "File 10 MB se badi nahi ho sakti");
  }

  const ext = path.extname(file.name) || (fileType === "pdf" ? ".pdf" : fileType === "video" ? ".mp4" : fileType === "word" ? ".docx" : ".jpg");
  const base = sanitizeFilename(path.basename(file.name, ext)).slice(0, 60);
  const key = `office/${prefix}/${Date.now()}_${base}${ext}`;
  const body = Buffer.from(await file.arrayBuffer());

  const { bucket } = getR2Config();
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: file.type?.trim() || WORD_MIME_BY_EXT[ext.toLowerCase()] || getMimeType(key),
    })
  );

  return { key, type: fileType };
}

export async function deleteOfficeFile(key: string) {
  const { bucket } = getR2Config();
  await getR2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// Signed GET url. `options.download` (W21): true → force an attachment
// disposition (filename = key basename); a string overrides the filename.
// Default behavior (no options) is byte-identical for existing callers.
export async function getOfficeFileSignedUrl(
  key: string,
  expiresInSeconds = 900,
  options: { download?: boolean | string } = {}
) {
  const publicBase = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  // Public-base mode has no signing — content disposition cannot be forced,
  // so download degrades to the same public URL.
  if (publicBase) return `${publicBase}/${key}`;

  const { bucket } = getR2Config();
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  if (options.download) {
    const rawName =
      typeof options.download === "string" && options.download.trim()
        ? options.download.trim()
        : path.basename(key);
    const filename = rawName.replace(/["\\\r\n]/g, "_").slice(0, 120) || "file";
    command.input.ResponseContentDisposition = `attachment; filename="${filename}"`;
  }
  return getSignedUrl(getR2Client(), command, { expiresIn: expiresInSeconds });
}
