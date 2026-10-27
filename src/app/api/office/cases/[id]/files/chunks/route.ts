import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { findAccessibleCase } from "@/lib/office/case-access";
import { caseFilePrefix } from "@/lib/office/case-files";
import {
  CHUNKED_UPLOAD_MAX_BYTES,
  UPLOAD_CHUNK_BYTES,
  chunkPartKey,
  contentTypeForDepartmentKey,
  deleteOfficeFile,
  departmentFileTypeFromKey,
  headOfficeFile,
  putOfficeObject,
  readOfficeObject,
} from "@/lib/office/r2";
import { CASE_DEPARTMENTS, DEPARTMENT_PERMISSIONS, type CaseDepartment } from "@/lib/office/workflow";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

const MAX_PARTS = Math.ceil(CHUNKED_UPLOAD_MAX_BYTES / UPLOAD_CHUNK_BYTES);
// Multipart overhead ke liye thori gunjaish (har tukda Vercel ki 4.5 MB limit ke andar).
const MAX_PART_BYTES = UPLOAD_CHUNK_BYTES + 512 * 1024;

// §W40 — R2 bucket par CORS na ho to browser ka direct PUT nahi chalta aur
// server raasta sirf ~4 MB tak tha. Owner: "hamari files aam tor per 10 MB se
// chhoti hoti hain" — is liye 10 MB tak ki koi bhi file (PDF / video / Word):
//   multipart { department, key, index, total, chunk } → `<key>.part<index>`
//   JSON { action: "complete", department, key, total } → tukde jod kar `key`
// Phir browser aam JSON register (POST /files) karta hai (wahan R2 HEAD + size
// check). Key usi case + department ke prefix ki honi chahiye (presign plan).
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const isJson = (request.headers.get("content-type") || "").includes("application/json");
    const body = isJson ? ((await request.json().catch(() => null)) as Record<string, unknown> | null) : null;
    const form = isJson ? null : await request.formData();
    const read = (name: string) => (isJson ? body?.[name] : form?.get(name));

    const department = String(read("department") || "").toUpperCase() as CaseDepartment;
    if (!(CASE_DEPARTMENTS as readonly string[]).includes(department)) return badRequest("Department sahi nahi hai");
    if (!hasPermission(session, DEPARTMENT_PERMISSIONS[department])) {
      return forbidden("Is department ke files upload karne ki permission nahi hai");
    }
    const item = (await findAccessibleCase(session, id)) ?? (await prisma.case.findFirst({ where: { id } }));
    if (!item) return notFound("Case nahi mila");
    if (item.status === "CANCELLED") return badRequest("Cancelled case par file upload nahi ho sakti");

    const key = typeof read("key") === "string" ? String(read("key")).trim() : "";
    const expected = `office/${caseFilePrefix(item.caseNumber, department)}/`;
    const rest = key.startsWith(expected) ? key.slice(expected.length) : "";
    if (!rest || rest.includes("/") || !/^[A-Za-z0-9._-]+$/.test(rest) || !departmentFileTypeFromKey(key)) {
      return badRequest("File key sahi nahi hai — dobara upload karein");
    }
    const total = Number(read("total"));
    if (!Number.isInteger(total) || total < 1 || total > MAX_PARTS) return badRequest("Tukdon ki tadad sahi nahi");

    if (!isJson) {
      const index = Number(read("index"));
      const chunk = form?.get("chunk");
      if (!Number.isInteger(index) || index < 0 || index >= total) return badRequest("Tukda number sahi nahi");
      if (!(chunk instanceof File) || chunk.size <= 0 || chunk.size > MAX_PART_BYTES) {
        return badRequest("Tukda sahi nahi hai");
      }
      await putOfficeObject(chunkPartKey(key, index), Buffer.from(await chunk.arrayBuffer()), "application/octet-stream");
      return NextResponse.json({ ok: true, index });
    }

    if (body?.action !== "complete") return badRequest("Action sahi nahi hai");
    // Pehle se save hui file kabhi overwrite na ho.
    const [registered, existingObject] = await Promise.all([
      prisma.caseFile.findFirst({ where: { fileKey: key }, select: { id: true } }),
      headOfficeFile(key),
    ]);
    if (registered || existingObject) return badRequest("Ye file pehle se save ho chuki hai");

    const parts: Buffer[] = [];
    for (let index = 0; index < total; index++) {
      const part = await readOfficeObject(chunkPartKey(key, index));
      if (!part) return badRequest(`Tukda ${index + 1} nahi mila — dobara upload karein`);
      parts.push(part);
    }
    const joined = Buffer.concat(parts);
    if (joined.length > CHUNKED_UPLOAD_MAX_BYTES) return badRequest("File 10 MB se bari hai");
    await putOfficeObject(key, joined, contentTypeForDepartmentKey(key));
    await Promise.all(
      Array.from({ length: total }, (_, index) => deleteOfficeFile(chunkPartKey(key, index)).catch(() => undefined))
    );
    return NextResponse.json({ ok: true, key, size: joined.length });
  } catch (error) {
    return serverError(error);
  }
}
