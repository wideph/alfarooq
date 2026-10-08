import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { computeTotals, recomputeCaseFinancials } from "@/lib/office/commission";
import { dec, parseAmount } from "@/lib/office/money";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// BR2. Two actions on one route:
//   { action: "claim",  remaining }  booking office states what is still due (PENDING)
//   { action: "accept" }             cashier accepts the claim as-is
//   { action: "edit",   remaining }  cashier sets a different remaining
// accept/edit set agreedAmount = received + remaining and recompute.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id, { payments: { select: { amount: true, status: true } } });
    if (!item) return notFound("Case nahi mila");
    const body = await request.json();
    const action = String(body.action || "");

    if (action === "claim") {
      if (!hasPermission(session, "office:cases:write") && !hasPermission(session, "office:payments:submit")) {
        return forbidden();
      }
      const remaining = parseAmount(body.remaining);
      if (remaining === null) return badRequest("Remaining amount sahi nahi hai");
      await prisma.case.update({
        where: { id },
        data: { claimedRemaining: remaining, claimedRemainingStatus: "PENDING" },
      });
      await logOfficeAction(session, {
        action: "case.remaining.claim",
        entity: "Case",
        entityId: id,
        before: { claimedRemaining: item.claimedRemaining },
        after: { claimedRemaining: remaining },
      });
      return NextResponse.json(await loadCaseDetail(session, id));
    }

    if (action === "accept" || action === "edit") {
      if (!hasPermission(session, "office:payments:verify")) return forbidden();
      const remaining = action === "accept" ? item.claimedRemaining : parseAmount(body.remaining);
      if (remaining === null || remaining === undefined) return badRequest("Remaining amount nahi mila");
      const totals = computeTotals(item.payments, item.agreedAmount);
      const agreedAmount = dec(totals.received).plus(remaining);
      await prisma.case.update({
        where: { id },
        data: { agreedAmount, claimedRemaining: remaining, claimedRemainingStatus: "ACCEPTED" },
      });
      await logOfficeAction(session, {
        action: `case.remaining.${action}`,
        entity: "Case",
        entityId: id,
        before: { agreedAmount: item.agreedAmount, claimedRemaining: item.claimedRemaining },
        after: { agreedAmount, remaining },
      });
      const result = await recomputeCaseFinancials(id, session);
      const detail = await loadCaseDetail(session, id);
      return NextResponse.json({ ...(detail as object), needsExtraDecision: result.needsExtraDecision });
    }

    return badRequest("Action sahi nahi hai");
  } catch (error) {
    return serverError(error);
  }
}
