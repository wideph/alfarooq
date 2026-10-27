import path from "path";
import {
  DeleteObjectCommand,
  GetBucketCorsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutBucketCorsCommand,
  PutObjectCommand,
  S3Client,
  type CORSRule,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getFileType, getMimeType, sanitizeFilename } from "@/lib/storage";

// Cloudflare R2 is S3-compatible. Only the office module uses it; the public
// website keeps using Supabase Storage (src/lib/storage.ts).

const globalForR2 = globalThis as unknown as { r2Client?: S3Client; r2PresignClient?: S3Client };

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

// §W26: browser upload ke signed PUT URLs ke liye alag client. AWS SDK v3
// (>= 3.729) default "flexible checksums" lagata hai — presigned PUT URL mein
// KHALI body ka x-amz-checksum-crc32 chala jata hai aur R2 asal file ko
// checksum mismatch par reject kar deta hai. WHEN_REQUIRED se ye param nahi
// lagta (Cloudflare R2 docs ki recommendation). Server-side uploads purane
// client par hi hain — un ka behavior nahi badla.
function getR2PresignClient() {
  if (globalForR2.r2PresignClient) return globalForR2.r2PresignClient;
  const { accountId, accessKeyId, secretAccessKey } = getR2Config();

  globalForR2.r2PresignClient = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    requestChecksumCalculation: "WHEN_REQUIRED",
    responseChecksumValidation: "WHEN_REQUIRED",
  });

  return globalForR2.r2PresignClient;
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

// §W26: video ka mime browser kabhi khali deta hai (.mkv/.mov Windows par) —
// R2 par sahi Content-Type na ho to <video> play nahi karta ("file kharab").
const VIDEO_MIME_BY_EXT: Record<string, string> = {
  ".mp4": "video/mp4",
  ".m4v": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mkv": "video/x-matroska",
  ".avi": "video/x-msvideo",
  ".3gp": "video/3gpp",
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
    if (ext in VIDEO_MIME_BY_EXT) return "video";
    if (WORD_EXTENSIONS.has(ext)) return "word";
  }
  return null;
}

export async function uploadDepartmentFile(
  file: File,
  prefix: string
): Promise<{ key: string; type: DepartmentFileType }> {
  const plan = planDepartmentUpload({ name: file.name, type: file.type, size: file.size }, prefix);
  const body = Buffer.from(await file.arrayBuffer());

  const { bucket } = getR2Config();
  await getR2Client().send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: plan.key,
      Body: body,
      ContentType: plan.contentType,
    })
  );

  return { key: plan.key, type: plan.fileType };
}

// §W26 — department file ka type/size validation + R2 key + Content-Type.
// Server-proxy upload aur direct browser→R2 upload dono yahi use karte hain,
// taake dono raaston se bilkul same key/type/content-type bane.
export function departmentFileMaxBytes(fileType: DepartmentFileType) {
  return fileType === "video" ? OFFICE_VIDEO_MAX_BYTES : OFFICE_FILE_MAX_BYTES;
}

export function departmentFileTypeFromKey(key: string): DepartmentFileType | null {
  return getDepartmentFileType("", key);
}

function departmentContentType(name: string, mimeType: string | null | undefined) {
  const ext = path.extname(name).toLowerCase();
  const declared = (mimeType || "").trim();
  if (declared && declared !== "application/octet-stream") return declared;
  return WORD_MIME_BY_EXT[ext] || VIDEO_MIME_BY_EXT[ext] || getMimeType(name);
}

// §W40 — chunked upload ke jode hue object ka Content-Type key ki extension se
// (client ki di hui value par bharosa nahi).
export function contentTypeForDepartmentKey(key: string) {
  return departmentContentType(path.basename(key), "");
}

export function planDepartmentUpload(
  file: { name: string; type?: string | null; size: number },
  prefix: string
): { key: string; fileType: DepartmentFileType; contentType: string } {
  const fileType = getDepartmentFileType(file.type || "", file.name);
  if (!fileType) throw new Error(`"${file.name}" — sirf PDF, image, video ya Word file allowed hai`);
  if (!Number.isFinite(file.size) || file.size <= 0) throw new Error(`"${file.name}" khali file hai`);
  if (file.size > departmentFileMaxBytes(fileType)) {
    throw new Error(
      fileType === "video"
        ? `"${file.name}" — video 100 MB se badi nahi ho sakti`
        : `"${file.name}" — file 10 MB se badi nahi ho sakti`
    );
  }

  const rawExt = path.extname(file.name);
  const fallbackExt =
    fileType === "pdf" ? ".pdf" : fileType === "video" ? ".mp4" : fileType === "word" ? ".docx" : ".jpg";
  const ext = /^\.[A-Za-z0-9]{1,8}$/.test(rawExt) ? rawExt : fallbackExt;
  const base = sanitizeFilename(path.basename(file.name, rawExt)).slice(0, 60) || "file";
  // Random suffix: ek hi millisecond mein kai files (multi-upload) ki key na takraye.
  // originalFilenameFromKey() `^\d+[a-z0-9]*_` prefix hata kar asal naam deta hai.
  const unique = `${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
  const key = `office/${prefix}/${unique}_${base}${ext}`;
  return { key, fileType, contentType: departmentContentType(`${base}${ext}`, file.type) };
}

// §W26 — browser seedha R2 par PUT karta hai (Vercel function ki 4.5 MB body
// limit bypass; file ke bytes server se guzarte hi nahi, is liye kharab nahi
// hote). Content-Type signature mein shamil hai (signableHeaders) — client ko
// bilkul wahi header bhejna lazmi hai, warna R2 reject karta hai.
export async function getOfficeUploadSignedUrl(key: string, contentType: string, expiresInSeconds = 3600) {
  const { bucket } = getR2Config();
  return getSignedUrl(
    getR2PresignClient(),
    new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
    { expiresIn: expiresInSeconds, signableHeaders: new Set(["content-type"]) }
  );
}

// Upload ke baad server confirm karta hai ke object R2 par maujood hai (size
// ke saath). Na mile to null.
export async function headOfficeFile(key: string): Promise<{ size: number } | null> {
  const { bucket } = getR2Config();
  try {
    const head = await getR2Client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return { size: Number(head.ContentLength || 0) };
  } catch (error) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NotFound") return null;
    throw error;
  }
}

// §W26 — direct browser upload ke liye bucket par CORS rule zaroori hai.
// Best-effort: is site ka origin bucket CORS mein na ho to MERGE kar ke add
// karta hai (purane rules nahi hatata). R2 token ke paas bucket-admin
// permission na ho to false — client phir server-proxy fallback use karta
// hai. Har server instance par har origin ek dafa check hota hai.
const corsCheckedOrigins = new Map<string, Promise<boolean>>();

function corsRuleAllows(rule: CORSRule, origin: string) {
  const origins = rule.AllowedOrigins || [];
  const methods = (rule.AllowedMethods || []).map((method) => method.toUpperCase());
  const headers = (rule.AllowedHeaders || []).map((header) => header.toLowerCase());
  return (
    (origins.includes("*") || origins.includes(origin)) &&
    methods.includes("PUT") &&
    (headers.includes("*") || headers.includes("content-type"))
  );
}

export function ensureOfficeBucketCors(origin: string): Promise<boolean> {
  if (!/^https?:\/\/[^/\s]+$/.test(origin)) return Promise.resolve(false);
  const cached = corsCheckedOrigins.get(origin);
  if (cached) return cached;
  const pending = (async () => {
    const { bucket } = getR2Config();
    const client = getR2Client();
    let rules: CORSRule[] = [];
    try {
      const current = await client.send(new GetBucketCorsCommand({ Bucket: bucket }));
      rules = current.CORSRules || [];
    } catch {
      rules = []; // NoSuchCORSConfiguration (ya read permission nahi)
    }
    if (rules.some((rule) => corsRuleAllows(rule, origin))) return true;
    try {
      await client.send(
        new PutBucketCorsCommand({
          Bucket: bucket,
          CORSConfiguration: {
            CORSRules: [
              ...rules,
              {
                AllowedOrigins: [origin],
                AllowedMethods: ["GET", "PUT", "HEAD"],
                // Browser PUT sirf content-type header bhejta hai (explicit
                // naam — R2 par wildcard se zyada bharosemand).
                AllowedHeaders: ["content-type"],
                ExposeHeaders: ["ETag"],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        })
      );
      return true;
    } catch (error) {
      console.warn("[office] R2 bucket CORS set nahi ho saka (token permission?)", error);
      return false;
    }
  })().catch(() => false);
  corsCheckedOrigins.set(origin, pending);
  return pending;
}

export async function deleteOfficeFile(key: string) {
  const { bucket } = getR2Config();
  await getR2Client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

// §W40 — CORS ke baghair 4 MB se bari (≤10 MB) file: browser 3 MB ke tukde
// server ke raaste bhejta hai (har request Vercel ki 4.5 MB limit ke andar);
// server tukde `<key>.part<n>` par rakhta hai aur aakhir mein jod kar asal key
// par ek object banata hai. Bytes jaise aaye waise hi — file kharab nahi hoti.
export const CHUNKED_UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_CHUNK_BYTES = 3 * 1024 * 1024;

export function chunkPartKey(key: string, index: number) {
  return `${key}.part${index}`;
}

export async function putOfficeObject(key: string, body: Buffer, contentType: string) {
  const { bucket } = getR2Config();
  await getR2Client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export async function readOfficeObject(key: string): Promise<Buffer | null> {
  const { bucket } = getR2Config();
  try {
    const result = await getR2Client().send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    if (!result.Body) return null;
    return Buffer.from(await result.Body.transformToByteArray());
  } catch (error) {
    const err = error as { name?: string; $metadata?: { httpStatusCode?: number } };
    if (err?.$metadata?.httpStatusCode === 404 || err?.name === "NoSuchKey") return null;
    throw error;
  }
}

// Signed GET url. `options.download` (W21): true → force an attachment
// disposition (filename = ORIGINAL file name — key basename minus the
// `Date.now()_` upload prefix); a string overrides the filename.
// §W23: title ko filename ke tor par use KARNA mana hai — title mein
// extension nahi hoti, jis se Word/PDF download "corrupt" lagti thi aur
// original name badal jata tha.
// Default behavior (no options) is byte-identical for existing callers.
export function originalFilenameFromKey(key: string): string {
  const base = path.basename(key);
  // §W26: naye keys `<ms><4 random>_name` hain, purane `<ms>_name`.
  return base.replace(/^\d{10,}[a-z0-9]{0,4}_/, "") || base;
}

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
        : originalFilenameFromKey(key);
    const filename = rawName.replace(/["\\\r\n]/g, "_").slice(0, 120) || "file";
    command.input.ResponseContentDisposition = `attachment; filename="${filename}"`;
  }
  return getSignedUrl(getR2Client(), command, { expiresIn: expiresInSeconds });
}
