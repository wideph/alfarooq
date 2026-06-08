import path from "path";
import { getSupabaseAdmin, getStorageBucket } from "@/lib/supabase";

export function getFileType(mimeType: string, filename?: string): "pdf" | "image" | null {
  const normalizedMime = mimeType.trim().toLowerCase();
  if (normalizedMime === "application/pdf" || normalizedMime === "application/x-pdf") {
    return "pdf";
  }
  if (normalizedMime.startsWith("image/")) return "image";

  if (filename) {
    const ext = path.extname(filename).toLowerCase();
    if (ext === ".pdf") return "pdf";
    if ([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"].includes(ext)) return "image";
  }

  return null;
}

export function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export async function saveUploadedFile(
  file: File,
  prefix: string
): Promise<{ filename: string; type: "pdf" | "image" }> {
  const fileType = getFileType(file.type, file.name);
  if (!fileType) {
    throw new Error("Only PDF and image files are allowed");
  }

  const ext = path.extname(file.name) || (fileType === "pdf" ? ".pdf" : ".jpg");
  const filename = `${prefix}_${Date.now()}_${sanitizeFilename(path.basename(file.name, ext))}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const contentType = file.type?.trim() || getMimeType(filename);

  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();

  const { error } = await supabase.storage.from(bucket).upload(filename, buffer, {
    contentType,
    upsert: false,
  });

  if (error) {
    throw new Error(error.message);
  }

  return { filename, type: fileType };
}

export async function deleteUploadedFile(filename: string) {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();
  await supabase.storage.from(bucket).remove([filename]);
}

export async function readUploadedFile(filename: string): Promise<Buffer> {
  const supabase = getSupabaseAdmin();
  const bucket = getStorageBucket();

  const { data, error } = await supabase.storage.from(bucket).download(filename);

  if (error || !data) {
    throw new Error("File not found");
  }

  return Buffer.from(await data.arrayBuffer());
}

export function getMimeType(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  const mimeMap: Record<string, string> = {
    ".pdf": "application/pdf",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".svg": "image/svg+xml",
  };
  return mimeMap[ext] || "application/octet-stream";
}
