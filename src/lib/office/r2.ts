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

export async function deleteOfficeFile(key: string) {
  const { bucket } = getR2Config();
  await getR2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

export async function getOfficeFileSignedUrl(key: string, expiresInSeconds = 900) {
  const publicBase = process.env.R2_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (publicBase) return `${publicBase}/${key}`;

  const { bucket } = getR2Config();
  return getSignedUrl(
    getR2Client(),
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: expiresInSeconds }
  );
}
