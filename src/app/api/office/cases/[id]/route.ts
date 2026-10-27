import { NextRequest, NextResponse, after } from "next/server";
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
import { CUSTOM_LABEL_COLORS } from "@/lib/office/labels";
import { getOfficeCategories } from "@/lib/office/setup-cache";
import { advanceCourierStage, parseCaseInput } from "@/lib/office/workflow";
import { notifyCourierStage } from "@/lib/office/notifications";

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
//
// §F22.4 (verified): is PATCH mein (aur admin ke direct status-change path
// cases/[id]/status mein — applyStatusSideEffects) koi dept commission credit
// NAHI hota. Admin jump se bypass hue steps ka commission na kisi user ko
// jata hai, na kahin aur, na case expense mein — commission sirf dept worker
// ke real action par credit hota hai (files / attestations routes).
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
    // always keep at least one of Roll Number / Registration Number.
    if (body.clientName !== undefined) {
      data.clientName = cleanText(body.clientName, 200) || "";
    }
    if (body.rollNumber !== undefined) data.rollNumber = cleanText(body.rollNumber, 80);
    if (body.registrationNumber !== undefined) data.registrationNumber = cleanText(body.registrationNumber, 80);
    const nextRoll = data.rollNumber !== undefined ? (data.rollNumber as string | null) : existing.rollNumber;
    const nextReg =
      data.registrationNumber !== undefined ? (data.registrationNumber as string | null) : existing.registrationNumber;
    if (!nextRoll && !nextReg) return badRequest("Roll Number ya Registration Number lazmi hai");
    if (body.notes !== undefined) data.notes = cleanText(body.notes, 2000);
    if (body.agreedAmountRemarks !== undefined) {
      data.agreedAmountRemarks = cleanText(body.agreedAmountRemarks, 500);
    }
    if (body.courierNumber !== undefined) data.courierNumber = cleanText(body.courierNumber, 120);
    // §W21: online verification number — nullable-able string field.
    if (body.onlineVerificationNumber !== undefined) {
      data.onlineVerificationNumber = cleanText(body.onlineVerificationNumber, 120);
    }
    if (body.isUrgent !== undefined) data.isUrgent = Boolean(body.isUrgent);
    // §W44: admin ka custom label (khali = hata dein).
    if (body.customLabel !== undefined || body.customLabelColor !== undefined) {
      if (session.role !== "admin") return forbidden("Label sirf super admin laga sakta hai");
      if (body.customLabel !== undefined) data.customLabel = cleanText(body.customLabel, 40) || null;
      if (body.customLabelColor !== undefined) {
        const color = typeof body.customLabelColor === "string" ? body.customLabelColor : "";
        data.customLabelColor = CUSTOM_LABEL_COLORS.includes(color) ? color : null;
      }
    }

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
        // §W20: categories static hain — cached list se validate (DB round-trip
        // bach gayi); sirf existence check tha, isActive pehle bhi nahi dekhte the.
        const category = (await getOfficeCategories()).find((row) => row.id === categoryId) ?? null;
        if (!category) return badRequest("Category nahi mili");
        data.category = { connect: { id: categoryId } };
      } else {
        data.category = { disconnect: true };
      }
      // Commission follows the grid until something has been credited.
      // §W45: admin ne "Nahi" / "Partial" chuna tha to wahi faisla qaim rehta
      // hai (sirf "Poora" / member ka case grid ke saath chalta hai).
      if (
        existing.bookingOffice.type === "FIXED_COMMISSION" &&
        !existing.commissionHalfCreditedAt &&
        categoryId !== existing.categoryId &&
        existing.commissionMode !== "NONE" &&
        existing.commissionMode !== "PARTIAL"
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
    // Business write stays in the request path (BR2 recompute); audit log
    // response ke baad chalti hai (W13.2).
    let courierStage: Awaited<ReturnType<typeof advanceCourierStage>> = null;
    if (agreedChanged) {
      await recomputeCaseFinancials(id, session);
      // §W30: agreed kam hone se baqi 0 ho gaya → courier stage (forward-only).
      courierStage = await advanceCourierStage(id);
    }
    after(async () => {
      await logOfficeAction(session, {
        action: "case.update",
        entity: "Case",
        entityId: id,
        before: existing,
        after: data,
      });
      await notifyCourierStage(id, courierStage);
    });

    // Full detail is intentionally returned here: multiple detail-tab callers
    // apply the response directly via onUpdated(res.data). (Slimming this
    // shape is a UI-side change — see docs/office-module/05_AGENT_LOG.md W12.)
    const detail = await loadCaseDetail(session, updated.id);
    return NextResponse.json(detail);
  } catch (error) {
    return serverError(error);
  }
}

// §W12.5 — admin force delete: koi bhi case delete ho sakta hai (purana
// "received payment / ledger exists" guard hata diya). Poora cascade ek
// interactive transaction mein; R2 objects + audit rows + notifications
// commit ke baad best-effort. Ledger rows delete hone se users ki
// earning/wasool/due har jagah apne aap sahi ho jati hai.
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  if (session.role !== "admin") return forbidden("Case sirf super admin delete kar sakta hai");
  const { id } = await params;

  try {
    const existing = await prisma.case.findUnique({
      where: { id },
      select: {
        id: true,
        caseNumber: true,
        clientPictureKey: true,
        payments: { select: { id: true, slipKey: true } },
        files: { select: { fileKey: true } },
        remarks: { select: { id: true } },
      },
    });
    if (!existing) return notFound("Case nahi mila");

    const paymentIds = existing.payments.map((payment) => payment.id);
    const remarkIds = existing.remarks.map((remark) => remark.id);

    // Dependency order: children first, case row last. §W20-R5 (review #4):
    // interactive tx ke 12 sequential round-trips (cross-region par ~2-4s) ki
    // jagah batch array form — order preserved, ~1 round-trip.
    await prisma.$transaction([
      prisma.ledgerEntry.deleteMany({
        where: { OR: [{ caseId: id }, { paymentId: { in: paymentIds } }] },
      }),
      prisma.caseExpense.deleteMany({ where: { caseId: id } }),
      prisma.caseAttestation.deleteMany({ where: { caseId: id } }),
      ...(remarkIds.length
        ? [prisma.caseRemarkRecipient.deleteMany({ where: { remarkId: { in: remarkIds } } })]
        : []),
      prisma.caseRemark.deleteMany({ where: { caseId: id } }),
      prisma.caseContact.deleteMany({ where: { caseId: id } }),
      prisma.caseAddress.deleteMany({ where: { caseId: id } }),
      prisma.discountRequest.deleteMany({ where: { caseId: id } }),
      prisma.bonusRequest.deleteMany({ where: { caseId: id } }),
      prisma.caseFile.deleteMany({ where: { caseId: id } }),
      prisma.payment.deleteMany({ where: { caseId: id } }),
      prisma.case.delete({ where: { id } }),
    ]);

    // After commit (best-effort): R2 objects, then audit + notification rows
    // for this case. Audit rows wipe hone ke baad "case.delete" ka audit row
    // mumkin nahi — is liye jaan boojh kar koi audit log nahi likha jata.
    const r2Keys = [
      ...existing.files.map((file) => file.fileKey),
      ...existing.payments.map((payment) => payment.slipKey).filter((key): key is string => Boolean(key)),
      ...(existing.clientPictureKey ? [existing.clientPictureKey] : []),
    ];
    await Promise.all([
      ...r2Keys.map((key) =>
        deleteOfficeFile(key).catch((error) => console.error("[office] case.delete R2 cleanup fail", key, error))
      ),
      prisma.officeAuditLog
        .deleteMany({
          where: {
            OR: [
              { entity: "Case", entityId: id },
              { entity: "Payment", entityId: { in: paymentIds } },
            ],
          },
        })
        .catch((error) => console.error("[office] case.delete audit cleanup fail", error)),
      prisma.notification
        .deleteMany({ where: { link: { contains: `/office/cases/${id}` } } })
        .catch((error) => console.error("[office] case.delete notification cleanup fail", error)),
    ]);

    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError(error);
  }
}
