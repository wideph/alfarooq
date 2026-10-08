import { NextRequest, NextResponse, after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { caseScope } from "@/lib/office/case-access";
import { recomputeCaseFinancials } from "@/lib/office/commission";
import { parseAmount } from "@/lib/office/money";
import { notifyRole, notifyUsers } from "@/lib/office/notifications";
import { autoDistributeOnPaymentReceived } from "@/lib/office/profit-share";
import { PAYMENT_METHODS, PAYMENT_STATUSES, type PaymentMethod, type PaymentStatus } from "@/lib/office/permissions";
import { PAYMENT_STATUS_LABELS } from "@/lib/office/labels";
import { deleteOfficeFile } from "@/lib/office/r2";
import { activateWorkflowOnFirstPayment } from "@/lib/office/workflow";
import { generateSetDates } from "@/lib/office/date-engine";
import { cleanText, parseDateOnly, toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// Cashier / super admin: status (RECEIVED / NOT_RECEIVED / BOGUS / PENDING),
// paymentDate, amount, method, remarks. Always recomputes the case (BR1.2–1.5).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:payments:verify");
  if (denied) return denied;
  const { id } = await params;
  try {
    const existing = await prisma.payment.findFirst({ where: { id, case: caseScope(session) } });
    if (!existing) return notFound("Payment nahi mili");

    const body = await request.json();
    const data: Prisma.PaymentUncheckedUpdateInput = {};
    let newStatus: PaymentStatus | null = null;

    if (body.status !== undefined) {
      const status = body.status as PaymentStatus;
      if (!PAYMENT_STATUSES.includes(status)) return badRequest("Status sahi nahi hai");
      newStatus = status;
      data.status = status;
      data.verifiedById = status === "PENDING" ? null : session.adminId;
      data.verifiedAt = status === "PENDING" ? null : new Date();
    }
    if (body.paymentDate !== undefined) {
      const paymentDate = parseDateOnly(body.paymentDate);
      if (!paymentDate) return badRequest("Payment date sahi nahi hai");
      data.paymentDate = paymentDate;
    }
    if (body.amount !== undefined) {
      const amount = parseAmount(body.amount, { allowZero: false });
      if (amount === null) return badRequest("Amount sahi nahi hai");
      data.amount = amount;
    }
    if (body.method !== undefined) {
      if (!PAYMENT_METHODS.includes(body.method as PaymentMethod)) return badRequest("Method sahi nahi hai");
      data.method = body.method;
    }
    if (body.remarks !== undefined) data.remarks = cleanText(body.remarks, 500);
    if (body.reference !== undefined) data.reference = cleanText(body.reference, 120);
    if (Object.keys(data).length === 0) return badRequest("Kuch change nahi kiya");

    const payment = await prisma.payment.update({ where: { id }, data });

    const result = await recomputeCaseFinancials(existing.caseId, session, { paymentId: id });

    // §W11.1: ATTESTATION_COMPLETE par poora payment (remaining=0, agreed>0)
    // → WAITING_FOR_COURIER. Business write request path mein; courier
    // notification after() mein (W13.2).
    let notifyCourier = false;
    if (result.remaining === 0 && result.agreedAmount > 0) {
      const caseRow = await prisma.case.findUnique({
        where: { id: existing.caseId },
        select: { status: true },
      });
      if (caseRow?.status === "ATTESTATION_COMPLETE") {
        await prisma.case.update({
          where: { id: existing.caseId },
          data: { status: "WAITING_FOR_COURIER" },
        });
        notifyCourier = true;
      }
    }

    // Wave 2 (§N5/N7): the FIRST payment that turns RECEIVED activates the
    // workflow — case becomes WAITING_FOR_FILE (visible to filing). Runs AFTER
    // the recompute. Failures are logged, never thrown.
    let datesNeeded = false;
    if (newStatus === "RECEIVED" && existing.status !== "RECEIVED") {
      const caseId = existing.caseId;
      // §W11.4: PROFIT_SHARE office — har RECEIVED payment par pool
      // auto-distribute (idempotent). Kabhi throw nahi karta.
      await autoDistributeOnPaymentReceived(caseId, session);
      ({ datesNeeded } = await activateWorkflowOnFirstPayment(caseId));
    }

    // W13.2: audit log + notifications + AI date generation sab response ke
    // baad — verify response foran return hota hai.
    const statusChanged = Boolean(newStatus && newStatus !== existing.status);
    after(async () => {
      await logOfficeAction(session, {
        action: "payment.verify",
        entity: "Payment",
        entityId: id,
        before: existing,
        after: data,
      });
      if (notifyCourier) {
        const caseRow = await prisma.case.findUnique({
          where: { id: existing.caseId },
          select: { caseNumber: true },
        });
        await notifyRole("courier", {
          type: "case.status",
          title: `Case ${caseRow?.caseNumber || ""}: Payment complete — waiting for courier`,
          link: `/office/cases/${existing.caseId}`,
        });
      }
      // §W11.8: verify decision → payment submitter + case creator.
      if (newStatus && statusChanged) {
        const caseRow = await prisma.case.findUnique({
          where: { id: existing.caseId },
          select: { caseNumber: true, createdByAdminId: true },
        });
        await notifyUsers([existing.submittedById, caseRow?.createdByAdminId], {
          type: "payment.verify",
          title: `Payment ${PAYMENT_STATUS_LABELS[newStatus] || newStatus} — case ${caseRow?.caseNumber || ""}`,
          link: `/office/cases/${existing.caseId}`,
        });
      }
      if (datesNeeded) {
        try {
          await generateSetDates(existing.caseId);
        } catch (error) {
          console.error("[office] generateSetDates fail", error);
        }
      }
    });

    return NextResponse.json(
      toJson({ payment: { ...payment, hasSlip: Boolean(payment.slipKey), slipKey: undefined }, ...result })
    );
  } catch (error) {
    return serverError(error);
  }
}

// Booking office may delete its own PENDING payment; verifier may delete any
// non-RECEIVED payment; super admin anything (with recompute).
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const existing = await prisma.payment.findFirst({ where: { id, case: caseScope(session) } });
    if (!existing) return notFound("Payment nahi mili");

    const isAdmin = session.role === "admin";
    const canVerify = session.permissions?.includes("office:payments:verify") || isAdmin;
    const ownPending = existing.submittedById === session.adminId && existing.status === "PENDING";
    if (!isAdmin && !(canVerify && existing.status !== "RECEIVED") && !ownPending) {
      return forbidden("Ye payment delete nahi kar sakte");
    }

    await prisma.payment.delete({ where: { id } });
    if (existing.slipKey) {
      await deleteOfficeFile(existing.slipKey).catch((error) =>
        console.error("[office] slip delete fail", error)
      );
    }
    await logOfficeAction(session, { action: "payment.delete", entity: "Payment", entityId: id, before: existing });

    const result = await recomputeCaseFinancials(existing.caseId, session);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return serverError(error);
  }
}

// AI date research can take minutes on first (uncached) generation — allow long runs on Vercel.
export const maxDuration = 300;
