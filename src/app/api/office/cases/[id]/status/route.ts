import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { CASE_STATUSES, type CaseStatus } from "@/lib/office/permissions";
import { cleanText } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// Attestation office / super admin: printed flag + manual case status.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:attestation:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    const body = await request.json();
    const data: { status?: string; isPrinted?: boolean; printedAt?: Date | null } = {};
    // Super admin (F1) kisi bhi CASE_STATUSES par ja sakta hai — lekin wajah
    // (note/remarks) lazmi hai; ye note OfficeAuditLog ke after.note mein
    // store hota hai. Baqi roles ke rules neechy wese hi hain.
    let adminNote: string | null = null;

    if (body.isPrinted !== undefined) {
      const isPrinted = Boolean(body.isPrinted);
      data.isPrinted = isPrinted;
      data.printedAt = isPrinted ? item.printedAt || new Date() : null;
      if (isPrinted && ["NEW", "PAYMENT_PENDING", "IN_PROCESS"].includes(item.status)) data.status = "PRINTED";
    }

    if (body.status !== undefined) {
      const status = body.status as CaseStatus;
      if (!CASE_STATUSES.includes(status)) return badRequest("Status sahi nahi hai");
      if (session.role === "admin") {
        adminNote = cleanText(body.note ?? body.remarks, 500);
        if (!adminNote) return badRequest("Status change ki wajah (note/remarks) lazmi hai");
      } else if (status === "CANCELLED") {
        return forbidden("Case sirf super admin cancel kar sakta hai");
      }
      data.status = status;
      if (status === "PRINTED" && !item.isPrinted) {
        data.isPrinted = true;
        data.printedAt = new Date();
      }
    }

    if (Object.keys(data).length === 0) return badRequest("Kuch change nahi kiya");

    await prisma.case.update({ where: { id }, data });
    await logOfficeAction(session, {
      action: "case.status",
      entity: "Case",
      entityId: id,
      before: { status: item.status, isPrinted: item.isPrinted },
      after: { ...data, ...(adminNote ? { note: adminNote } : {}) },
    });
    return NextResponse.json(await loadCaseDetail(session, id));
  } catch (error) {
    return serverError(error);
  }
}
