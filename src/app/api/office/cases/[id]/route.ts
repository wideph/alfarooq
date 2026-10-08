import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { recomputeCaseFinancials } from "@/lib/office/commission";
import { parseAmount } from "@/lib/office/money";
import { uploadOfficeFile, deleteOfficeFile } from "@/lib/office/r2";
import { cleanText } from "@/lib/office/serializers";
import { parseCaseInput } from "@/lib/office/workflow";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  const detail = await loadCaseDetail(session, id);
  if (!detail) return notFound("Case nahi mila");
  return NextResponse.json(detail);
}

// Basic fields. agreedAmount: booking office may change it only before any
// payment is RECEIVED; cashier / super admin any time (then recompute, BR2).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  const { id } = await params;

  try {
    const existing = await findAccessibleCase(session, id, {
      bookingOffice: { select: { type: true } },
      payments: { select: { status: true } },
    });
    if (!existing) return notFound("Case nahi mila");

    const { fields: body, clientPicture } = await parseCaseInput(request);
    const data: Prisma.CaseUpdateInput = {};

    // §N7: client name is optional (empty string allowed), but the case must
    // always keep at least one of r-number / reg-number.
    if (body.clientName !== undefined) {
      data.clientName = cleanText(body.clientName, 200) || "";
    }
    if (body.rollNumber !== undefined) data.rollNumber = cleanText(body.rollNumber, 80);
    if (body.registrationNumber !== undefined) data.registrationNumber = cleanText(body.registrationNumber, 80);
    const nextRoll = data.rollNumber !== undefined ? (data.rollNumber as string | null) : existing.rollNumber;
    const nextReg =
      data.registrationNumber !== undefined ? (data.registrationNumber as string | null) : existing.registrationNumber;
    if (!nextRoll && !nextReg) return badRequest("r-number ya reg-number lazmi hai");
    if (body.notes !== undefined) data.notes = cleanText(body.notes, 2000);
    if (body.agreedAmountRemarks !== undefined) {
      data.agreedAmountRemarks = cleanText(body.agreedAmountRemarks, 500);
    }
    if (body.courierNumber !== undefined) data.courierNumber = cleanText(body.courierNumber, 120);
    if (body.isUrgent !== undefined) data.isUrgent = Boolean(body.isUrgent);

    // §W11.6: filing-files visibility for booking office users — admin-only.
    if (body.filingFilesVisibleToBooking !== undefined) {
      if (session.role !== "admin") {
        return forbidden("Filing files ki visibility sirf super admin badal sakta hai");
      }
      const raw = body.filingFilesVisibleToBooking;
      data.filingFilesVisibleToBooking = raw === true || raw === "true" || raw === "1";
    }

    if (body.categoryId !== undefined) {
      const categoryId = typeof body.categoryId === "string" && body.categoryId ? body.categoryId : null;
      if (categoryId) {
        const category = await prisma.caseCategory.findUnique({ where: { id: categoryId } });
        if (!category) return badRequest("Category nahi mili");
        data.category = { connect: { id: categoryId } };
      } else {
        data.category = { disconnect: true };
      }
      // Commission follows the grid until something has been credited.
      if (
        existing.bookingOffice.type === "FIXED_COMMISSION" &&
        !existing.commissionHalfCreditedAt &&
        categoryId !== existing.categoryId
      ) {
        const grid = categoryId
          ? await prisma.bookingOfficeCommission.findUnique({
              where: { bookingOfficeId_categoryId: { bookingOfficeId: existing.bookingOfficeId, categoryId } },
            })
          : null;
        data.commissionAmount = grid ? grid.amount : new Prisma.Decimal(0);
      }
    }

    let agreedChanged = false;
    if (body.agreedAmount !== undefined) {
      const agreedAmount = parseAmount(body.agreedAmount);
      if (agreedAmount === null) return badRequest("Agreed amount sahi nahi hai");
      const hasReceived = existing.payments.some((p) => p.status === "RECEIVED");
      if (hasReceived && !hasPermission(session, "office:payments:verify")) {
        return forbidden("Payment receive hone ke baad agreed amount cashier / admin badal sakta hai");
      }
      if (!agreedAmount.equals(existing.agreedAmount)) {
        data.agreedAmount = agreedAmount;
        agreedChanged = true;
      }
    }

    // Client picture replace (multipart) → R2 like payment slips.
    if (clientPicture) {
      const uploaded = await uploadOfficeFile(clientPicture, `clients/${existing.caseNumber}`);
      data.clientPictureKey = uploaded.key;
      data.clientPictureType = uploaded.type;
    }

    if (Object.keys(data).length === 0) return badRequest("Kuch change nahi kiya");

    const updated = await prisma.case.update({ where: { id }, data });
    if (clientPicture && existing.clientPictureKey) {
      await deleteOfficeFile(existing.clientPictureKey).catch((error) =>
        console.error("[office] old client picture delete fail", error)
      );
    }
    await logOfficeAction(session, {
      action: "case.update",
      entity: "Case",
      entityId: id,
      before: existing,
      after: data,
    });

    if (agreedChanged) await recomputeCaseFinancials(id, session);

    const detail = await loadCaseDetail(session, updated.id);
    return NextResponse.json(detail);
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  if (session.role !== "admin") return forbidden("Case sirf super admin delete kar sakta hai");
  const { id } = await params;

  const existing = await prisma.case.findUnique({
    where: { id },
    include: { payments: { select: { status: true } }, _count: { select: { ledger: true } } },
  });
  if (!existing) return notFound("Case nahi mila");
  if (existing.payments.some((p) => p.status === "RECEIVED") || existing._count.ledger > 0) {
    return badRequest("Received payment ya ledger wale case ko delete nahi kar sakte; CANCELLED karein");
  }

  await prisma.case.delete({ where: { id } });
  await logOfficeAction(session, { action: "case.delete", entity: "Case", entityId: id, before: existing });
  return NextResponse.json({ success: true });
}
