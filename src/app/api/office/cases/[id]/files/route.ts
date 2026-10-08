import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { notifyAdmins, notifyRole } from "@/lib/office/notifications";
import { deleteOfficeFile, getOfficeFileSignedUrl, uploadDepartmentFile } from "@/lib/office/r2";
import { cleanText, toJson } from "@/lib/office/serializers";
import {
  CASE_DEPARTMENTS,
  DEPARTMENT_PERMISSIONS,
  evaluateCaseCompletion,
  type CaseDepartment,
} from "@/lib/office/workflow";

export const preferredRegion = ["sin1"];

export const maxDuration = 300;

type RouteParams = { params: Promise<{ id: string }> };

// GET: department files of a case, with short-lived signed URLs (same pattern
// as payment slips — private R2 bucket, never cached).
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");

    // §W11.6: booking office users ko FILING department ki files sirf tab
    // dikhen jab admin ne is case par permission di ho.
    const hideFilingFiles =
      session.role === "booking_office" && !item.filingFilesVisibleToBooking;

    const files = await prisma.caseFile.findMany({
      where: hideFilingFiles
        ? { caseId: id, department: { not: "FILING" } }
        : { caseId: id },
      orderBy: { createdAt: "asc" },
    });
    const uploaderIds = [...new Set(files.map((file) => file.uploadedById))];
    const uploaders = await prisma.admin.findMany({
      where: { id: { in: uploaderIds } },
      select: { id: true, name: true },
    });
    const names = Object.fromEntries(uploaders.map((uploader) => [uploader.id, uploader.name]));

    const items = await Promise.all(
      files.map(async (file) => ({
        id: file.id,
        department: file.department,
        stepKey: file.stepKey,
        title: file.title,
        fileType: file.fileType,
        createdAt: file.createdAt,
        uploadedById: file.uploadedById,
        uploadedByName: names[file.uploadedById] || null,
        url: await getOfficeFileSignedUrl(file.fileKey),
      }))
    );
    return NextResponse.json({ items: toJson(items) });
  } catch (error) {
    return serverError(error);
  }
}

// POST multipart: file + department (FILING|PRINTING|ATTA|COURIER) + optional
// stepKey + title. Moves the case forward in the department workflow (§W11.1):
//   first FILING file   → WAITING_FOR_FILE → WAITING_FOR_PRINTING
//   first PRINTING file → WAITING_FOR_PRINTING → PRINTED (+ isPrinted)
//   ATTA step files     → optional per step; FINAL file + all set steps DONE
//                         → ATTESTATION_COMPLETE (see evaluateCaseCompletion)
//   COURIER slip        → WAITING_FOR_COURIER → DELIVERED
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const formData = await request.formData();
    const department = String(formData.get("department") || "").toUpperCase() as CaseDepartment;
    if (!(CASE_DEPARTMENTS as readonly string[]).includes(department)) {
      return badRequest("Department sahi nahi hai (FILING | PRINTING | ATTA | COURIER)");
    }
    if (!hasPermission(session, DEPARTMENT_PERMISSIONS[department])) {
      return forbidden("Is department ke files upload karne ki permission nahi hai");
    }

    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    if (item.status === "CANCELLED") return badRequest("Cancelled case par file upload nahi ho sakti");

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) return badRequest("File zaroori hai");
    const stepKey = cleanText(formData.get("stepKey"), 60);
    const title = cleanText(formData.get("title"), 200);

    const uploaded = await uploadDepartmentFile(
      file,
      `cases/${item.caseNumber}/${department.toLowerCase()}`
    );

    const result = await prisma.$transaction(async (tx) => {
      const created = await tx.caseFile.create({
        data: {
          caseId: id,
          department,
          stepKey,
          fileKey: uploaded.key,
          fileType: uploaded.type,
          title,
          uploadedById: session.adminId,
        },
      });

      let nextStatus = item.status;
      const caseData: { status?: string; isPrinted?: boolean; printedAt?: Date } = {};

      if (department === "FILING" && item.status === "WAITING_FOR_FILE") {
        const earlier = await tx.caseFile.count({
          where: { caseId: id, department: "FILING", id: { not: created.id } },
        });
        if (earlier === 0) {
          caseData.status = "WAITING_FOR_PRINTING";
          nextStatus = "WAITING_FOR_PRINTING";
        }
      } else if (department === "PRINTING" && item.status === "WAITING_FOR_PRINTING") {
        const earlier = await tx.caseFile.count({
          where: { caseId: id, department: "PRINTING", id: { not: created.id } },
        });
        if (earlier === 0) {
          caseData.status = "PRINTED";
          caseData.isPrinted = true;
          caseData.printedAt = new Date();
          nextStatus = "PRINTED";
        }
      } else if (department === "COURIER") {
        // §W11.1: courier slip sirf tab DELIVERED karta hai jab case courier
        // stage par ho (payment complete ho chuki ho).
        if (item.status === "WAITING_FOR_COURIER") {
          caseData.status = "DELIVERED";
          nextStatus = "DELIVERED";
        }
      }

      if (Object.keys(caseData).length > 0) {
        await tx.case.update({ where: { id }, data: caseData });
      }

      // ATTA uploads (step files or the mandatory FINAL file) may complete the
      // attestation stage (→ ATTESTATION_COMPLETE).
      let completed = false;
      if (department === "ATTA") {
        completed = await evaluateCaseCompletion(id, tx);
        if (completed) nextStatus = "ATTESTATION_COMPLETE";
      }

      return { created, nextStatus };
    }, { maxWait: 10000, timeout: 30000 });

    // W13.2: audit log + notifications response ke baad (R2 upload request
    // path mein rehta hai — file upload ke baghair row ka koi matlab nahi).
    after(async () => {
      await logOfficeAction(session, {
        action: "case.file.upload",
        entity: "CaseFile",
        entityId: result.created.id,
        after: { caseId: id, department, stepKey, fileType: uploaded.type, nextStatus: result.nextStatus },
      });

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
      }
    });

    return NextResponse.json(
      toJson({
        file: {
          id: result.created.id,
          department: result.created.department,
          stepKey: result.created.stepKey,
          title: result.created.title,
          fileType: result.created.fileType,
          createdAt: result.created.createdAt,
        },
        status: result.nextStatus,
      }),
      { status: 201 }
    );
  } catch (error) {
    return serverError(error);
  }
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
