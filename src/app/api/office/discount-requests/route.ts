import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission, type AdminSession } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { recomputeCaseFinancials } from "@/lib/office/commission";
import { dec, parseAmount, round2, toNumber } from "@/lib/office/money";
import { todayPakistan, toJson } from "@/lib/office/serializers";

const DEDUCT_OPTIONS = ["COMMISSION", "PROFIT", "PARTIAL"] as const;

function canDecide(session: AdminSession) {
  return session.role === "admin" || hasPermission(session, "office:payments:verify");
}

// GET — admin / cashier: pending discount requests + history across offices.
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (!canDecide(session)) return forbidden("Discount requests sirf admin / cashier dekhein");

  const { searchParams } = new URL(request.url);
  const status = (searchParams.get("status") || "").toUpperCase();

  const items = await prisma.discountRequest.findMany({
    where: status && ["PENDING", "ACCEPTED", "REJECTED"].includes(status) ? { status } : {},
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 200,
    include: {
      case: {
        select: {
          id: true,
          caseNumber: true,
          clientName: true,
          agreedAmount: true,
          bookingOffice: { select: { id: true, name: true } },
        },
      },
    },
  });
  return NextResponse.json(toJson({ items }));
}

// PATCH { id, action: ACCEPT | REJECT, deductFrom?, partialCommissionAmount? }
// On ACCEPT (§N8), inside one transaction:
//   - the request is marked ACCEPTED with the decision,
//   - Case.agreedAmount is decremented by the discount so the existing
//     recompute (remaining = agreed - received) stays consistent,
//   - COMMISSION  → DEBIT LedgerEntry type DISCOUNT on the office (reduces
//     what the company owes the office = comes out of commission),
//     PROFIT → no office-ledger impact (company absorbs it, audit-only),
//     PARTIAL → commission part (partialCommissionAmount) DEBITs the office,
//     the remainder is absorbed by profit.
// Afterwards recomputeCaseFinancials re-syncs commission credits / status.
export async function PATCH(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (!canDecide(session)) return forbidden("Discount sirf admin / cashier decide karein");

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const action = String(body.action || "").toUpperCase();
    if (!["ACCEPT", "REJECT"].includes(action)) return badRequest("Action sahi nahi hai");

    const existing = await prisma.discountRequest.findUnique({
      where: { id },
      include: { case: { select: { id: true, caseNumber: true, agreedAmount: true, bookingOfficeId: true, status: true } } },
    });
    if (!existing) return notFound("Discount request nahi mili");
    if (existing.status !== "PENDING") return badRequest("Ye request pehle se decide ho chuki hai");

    if (action === "REJECT") {
      const updated = await prisma.discountRequest.update({
        where: { id },
        data: { status: "REJECTED", decidedById: session.adminId, decidedAt: new Date() },
      });
      await logOfficeAction(session, {
        action: "discount.reject",
        entity: "DiscountRequest",
        entityId: id,
        before: existing,
        after: { status: "REJECTED" },
      });
      return NextResponse.json(toJson(updated));
    }

    // ACCEPT
    const deductFrom = String(body.deductFrom || "").toUpperCase();
    if (!(DEDUCT_OPTIONS as readonly string[]).includes(deductFrom)) {
      return badRequest("deductFrom zaroori hai (COMMISSION | PROFIT | PARTIAL)");
    }

    const amount = dec(existing.amount);
    let commissionPart = dec(0);
    if (deductFrom === "COMMISSION") commissionPart = amount;
    if (deductFrom === "PARTIAL") {
      const partial = parseAmount(body.partialCommissionAmount, { allowZero: false });
      if (partial === null || !partial.lessThan(amount)) {
        return badRequest("Partial commission amount discount se kam aur zero se zyada hona chahiye");
      }
      commissionPart = partial;
    }

    if (amount.greaterThan(existing.case.agreedAmount)) {
      return badRequest("Discount maujooda agreed amount se zyada hai");
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.discountRequest.update({
        where: { id },
        data: {
          status: "ACCEPTED",
          deductFrom,
          decidedById: session.adminId,
          decidedAt: new Date(),
        },
      });

      // See route comment: agreedAmount shrinks; recompute keeps remaining
      // and commission-credit maths consistent afterwards.
      await tx.case.update({
        where: { id: existing.caseId },
        data: { agreedAmount: round2(dec(existing.case.agreedAmount).minus(amount)) },
      });

      if (commissionPart.greaterThan(0)) {
        await tx.ledgerEntry.create({
          data: {
            bookingOfficeId: existing.case.bookingOfficeId,
            caseId: existing.caseId,
            type: "DISCOUNT",
            direction: "DEBIT",
            amount: commissionPart,
            entryDate: todayPakistan(),
            remarks: `Case ${existing.case.caseNumber} discount (${deductFrom})`,
            createdById: session.adminId,
          },
        });
      }

      await logOfficeAction(
        session,
        {
          action: "discount.accept",
          entity: "DiscountRequest",
          entityId: id,
          before: existing,
          after: {
            status: "ACCEPTED",
            deductFrom,
            amount: toNumber(amount),
            commissionPart: toNumber(commissionPart),
            profitPart: toNumber(round2(amount.minus(commissionPart))),
          },
        },
        tx
      );

      return row;
    }, { maxWait: 10000, timeout: 30000 });

    const result = await recomputeCaseFinancials(existing.caseId, session);
    return NextResponse.json(toJson({ request: updated, ...result }));
  } catch (error) {
    return serverError(error);
  }
}
