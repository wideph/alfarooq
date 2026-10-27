import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission, type AdminSession } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import {
  MAX_FILES_PER_UPLOAD,
  caseFilePrefix,
  caseFileVisibility,
  registerCaseFiles,
  type NewCaseFile,
} from "@/lib/office/case-files";
import { notifyAdmins, notifyCourierStage, notifyRole } from "@/lib/office/notifications";
import {
  deleteOfficeFile,
  departmentFileMaxBytes,
  departmentFileTypeFromKey,
  headOfficeFile,
  originalFilenameFromKey,
  planDepartmentUpload,
  uploadDepartmentFile,
} from "@/lib/office/r2";
import { cleanText, toJson } from "@/lib/office/serializers";
import { creditDeptCommission } from "@/lib/office/dept-commission";
import {
  CASE_DEPARTMENTS,
  DEPARTMENT_PERMISSIONS,
  type CaseDepartment,
} from "@/lib/office/workflow";

export const preferredRegion = ["sin1"];

export const maxDuration = 300;

type RouteParams = { params: Promise<{ id: string }> };

// GET: department files of a case. §W26: url / downloadUrl ab STABLE same-origin
// routes hain (/files/<fileId>) jo har click par taaza signed R2 URL par
// redirect karte hain — pehle list ke signed URLs 15 min baad expire ho jate
// the aur tab khula rehne par file "kharab"/blank dikhti thi.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const where = await caseFileVisibility(session, id);
    if (!where) return notFound("Case nahi mila");

    const files = await prisma.caseFile.findMany({ where, orderBy: { createdAt: "asc" } });
    const uploaderIds = [...new Set(files.map((file) => file.uploadedById))];
    const uploaders = await prisma.admin.findMany({
      where: { id: { in: uploaderIds } },
      select: { id: true, name: true },
    });
    const names = Object.fromEntries(uploaders.map((uploader) => [uploader.id, uploader.name]));

    const items = files.map((file) => {
      const base = `/api/office/cases/${id}/files/${file.id}`;
      return {
        id: file.id,
        department: file.department,
        stepKey: file.stepKey,
        title: file.title,
        // §W23: download filename hamesha ORIGINAL file name (title nahi).
        fileName: originalFilenameFromKey(file.fileKey),
        fileType: file.fileType,
        createdAt: file.createdAt,
        uploadedById: file.uploadedById,
        uploadedByName: names[file.uploadedById] || null,
        url: base,
        downloadUrl: `${base}?download=1`,
      };
    });
    return NextResponse.json({ items: toJson(items) });
  } catch (error) {
    return serverError(error);
  }
}

type UploadBody = {
  department?: unknown;
  stepKey?: unknown;
  title?: unknown;
  // title (optional) per file — client multi-file numbering ("x (2/3)") khud
  // bhejta hai taake direct + fallback dono raaston ke titles ek jaise hon.
  uploads?: Array<{ key?: unknown; title?: unknown }>;
};

// POST — department files register/upload karta hai (ek ya KAI files, §W26).
// Do tareeqe:
//   1. JSON { department, stepKey?, title?, uploads: [{ key }] } — browser ne
//      files /files/upload-url ke signed URLs se SEEDHA R2 par upload ki hain
//      (Vercel ki 4.5 MB body limit ke bahar; video / badi PDF / kai images).
//      Server har key ka prefix + R2 par maujoodgi + size verify karta hai.
//   2. multipart (file — ek ya kai, department, stepKey?, title?) — purana
//      raasta; client sirf choti files ke fallback ke liye use karta hai.
// Dono raaste registerCaseFiles() se EK transaction mein rows + workflow
// transition (§W11.1) karte hain.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  // Fail hone par R2 se saaf karne wali keys (validation ke baad set hoti hain).
  let cleanupKeys: string[] = [];
  try {
    const isJson = (request.headers.get("content-type") || "").includes("application/json");
    let body: UploadBody | null = null;
    let formData: FormData | null = null;
    if (isJson) {
      body = (await request.json().catch(() => null)) as UploadBody | null;
      if (!body || typeof body !== "object") return badRequest("Request sahi nahi hai");
    } else {
      formData = await request.formData();
    }
    const read = (name: keyof UploadBody) => (isJson ? body?.[name] : formData?.get(name));

    const department = String(read("department") || "").toUpperCase() as CaseDepartment;
    if (!(CASE_DEPARTMENTS as readonly string[]).includes(department)) {
      return badRequest("Department sahi nahi hai (FILING | PRINTING | ATTESTATION | COURIER)");
    }
    if (!hasPermission(session, DEPARTMENT_PERMISSIONS[department])) {
      return forbidden("Is department ke files upload karne ki permission nahi hai");
    }

    // §W18: full path jab caseScope allow kare (purana behavior); warna upar
    // wali department write permission cross-office dept work authorize karti
    // hai (maslan filing permission wala booking user kisi bhi office ke case
    // par filing file upload kar sakta hai).
    const item =
      (await findAccessibleCase(session, id)) ??
      (await prisma.case.findFirst({ where: { id } }));
    if (!item) return notFound("Case nahi mila");
    if (item.status === "CANCELLED") return badRequest("Cancelled case par file upload nahi ho sakti");

    const stepKey = cleanText(read("stepKey"), 60);
    const title = cleanText(read("title"), 200);
    const prefix = caseFilePrefix(item.caseNumber, department);

    const files: NewCaseFile[] = [];
    if (isJson) {
      const uploads = Array.isArray(body?.uploads) ? body.uploads : [];
      if (uploads.length === 0) return badRequest("Koi file nahi bheji gayi");
      if (uploads.length > MAX_FILES_PER_UPLOAD) {
        return badRequest(`Ek dafa mein zyada se zyada ${MAX_FILES_PER_UPLOAD} files`);
      }
      const expected = `office/${prefix}/`;
      const keys = uploads.map((upload) => (typeof upload?.key === "string" ? upload.key.trim() : ""));
      for (const key of keys) {
        const rest = key.startsWith(expected) ? key.slice(expected.length) : "";
        if (!rest || rest.includes("/") || !/^[A-Za-z0-9._-]+$/.test(rest)) {
          return badRequest("File key sahi nahi hai — dobara upload karein");
        }
      }
      if (new Set(keys).size !== keys.length) return badRequest("Aik hi file do dafa bheji gayi");
      const already = await prisma.caseFile.findFirst({
        where: { fileKey: { in: keys } },
        select: { id: true },
      });
      if (already) return badRequest("Ye file pehle se save ho chuki hai");

      const heads = await Promise.all(keys.map((key) => headOfficeFile(key)));
      for (const [index, key] of keys.entries()) {
        const type = departmentFileTypeFromKey(key);
        const head = heads[index];
        const name = originalFilenameFromKey(key);
        if (!type) return badRequest(`"${name}" — sirf PDF, image, video ya Word file allowed hai`);
        if (!head) return badRequest(`"${name}" R2 par nahi mili — dobara upload karein`);
        if (head.size <= 0 || head.size > departmentFileMaxBytes(type)) {
          await deleteOfficeFile(key).catch(() => undefined);
          return badRequest(
            type === "video"
              ? `"${name}" — video 100 MB se badi nahi ho sakti`
              : `"${name}" — file 10 MB se badi nahi ho sakti`
          );
        }
        const ownTitle = uploads[index]?.title;
        files.push(
          ownTitle === undefined ? { key, type } : { key, type, title: cleanText(ownTitle, 200) }
        );
      }
      cleanupKeys = keys;
    } else {
      const picked = (formData?.getAll("file") || []).filter(
        (entry): entry is File => entry instanceof File && entry.size > 0
      );
      if (picked.length === 0) return badRequest("File zaroori hai");
      if (picked.length > MAX_FILES_PER_UPLOAD) {
        return badRequest(`Ek dafa mein zyada se zyada ${MAX_FILES_PER_UPLOAD} files`);
      }
      // Pehle SAB files validate — aadhi upload ho kar aadhi fail na hon.
      try {
        for (const file of picked) planDepartmentUpload({ name: file.name, type: file.type, size: file.size }, prefix);
      } catch (error) {
        return badRequest(error instanceof Error ? error.message : "File sahi nahi hai");
      }
      for (const file of picked) {
        const uploaded = await uploadDepartmentFile(file, prefix);
        cleanupKeys.push(uploaded.key);
        files.push({ key: uploaded.key, type: uploaded.type });
      }
    }

    const result = await registerCaseFiles({ session, item, department, stepKey, title, files });
    cleanupKeys = [];

    await afterUpload(session, item, department, stepKey, result);

    const created = result.created.map((row) => ({
      id: row.id,
      department: row.department,
      stepKey: row.stepKey,
      title: row.title,
      fileType: row.fileType,
      createdAt: row.createdAt,
    }));
    return NextResponse.json(
      toJson({ file: created[0], files: created, status: result.nextStatus }),
      { status: 201 }
    );
  } catch (error) {
    if (cleanupKeys.length > 0) {
      await Promise.all(cleanupKeys.map((key) => deleteOfficeFile(key).catch(() => undefined)));
    }
    return serverError(error);
  }
}

// Commission credits (never throw) + audit log + notifications — upload ke
// baad, chahe kitni bhi files ek sath aayi hon (transition ek hi dafa).
async function afterUpload(
  session: AdminSession,
  item: { id: string; caseNumber: string; status: string },
  department: CaseDepartment,
  stepKey: string | null,
  result: Awaited<ReturnType<typeof registerCaseFiles>>
) {
  const id = item.id;
  // F4: department commission credits (never throw, never fail the upload).
  // PRINTING → the acting printing user earned when this first printing
  // upload moved the case to PRINTED; ATTESTATION → the acting attestation
  // user earned when the case just flipped to ATTESTATION_COMPLETE.
  // §W32: bina set wala case printing ke saath aage (ATTESTATION_COMPLETE /
  // courier stage) chala jata hai — commission phir bhi printing user ko.
  const printedNow = result.printedNow;
  if (printedNow) {
    await creditDeptCommission({ adminId: session.adminId, caseId: id, kind: "PRINTING" });
  }
  if (result.completed) {
    await creditDeptCommission({ adminId: session.adminId, caseId: id, kind: "ATTESTATION" });
  }
  // §W30: courier slip ne case DELIVERED kiya → acting courier user ka
  // commission (rule na ho to 0; idempotent, never throws).
  if (result.delivered) {
    await creditDeptCommission({ adminId: session.adminId, caseId: id, kind: "COURIER" });
  }

  // W13.2: audit log + notifications response ke baad.
  after(async () => {
    for (const row of result.created) {
      await logOfficeAction(session, {
        action: "case.file.upload",
        entity: "CaseFile",
        entityId: row.id,
        after: { caseId: id, department, stepKey, fileType: row.fileType, nextStatus: result.nextStatus },
      });
    }

    // §W11.8: file.upload → admins + next-stage department ke users.
    if (result.nextStatus !== item.status) {
      const link = `/office/cases/${id}`;
      const title = `Case ${item.caseNumber}: ${department} file uploaded`;
      if (result.nextStatus === "WAITING_FOR_PRINTING") {
        await notifyRole("printing", { type: "file.upload", title, link });
        await notifyAdmins({ type: "file.upload", title, link });
      } else if (result.nextStatus === "PRINTED") {
        await notifyRole("atta", { type: "file.upload", title, link });
        await notifyAdmins({ type: "file.upload", title, link });
      } else {
        await notifyAdmins({ type: "file.upload", title, link });
      }
      // §W30: attestation complete + payment pehle se poori → courier stage.
      await notifyCourierStage(id, result.nextStatus);
    }
  });
}

// DELETE ?id= — the uploader's own department (write permission) or super admin.
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    const fileId = new URL(request.url).searchParams.get("id") || "";
    const file = await prisma.caseFile.findFirst({ where: { id: fileId, caseId: id } });
    if (!file) return notFound("File nahi mili");

    const isAdmin = session.role === "admin";
    const ownDepartment =
      (CASE_DEPARTMENTS as readonly string[]).includes(file.department) &&
      hasPermission(session, DEPARTMENT_PERMISSIONS[file.department as CaseDepartment]);
    if (!isAdmin && !ownDepartment) {
      return forbidden("File sirf usi department ya super admin delete kar sakta hai");
    }

    await prisma.caseFile.delete({ where: { id: file.id } });
    await deleteOfficeFile(file.fileKey).catch((error) =>
      console.error("[office] case file delete fail", error)
    );
    // W13.2: audit log response ke baad.
    after(async () => {
      await logOfficeAction(session, {
        action: "case.file.delete",
        entity: "CaseFile",
        entityId: file.id,
        before: { caseId: id, department: file.department, stepKey: file.stepKey },
      });
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError(error);
  }
}
