import { NextRequest, NextResponse } from "next/server";
import { guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { finalizeProfitShare } from "@/lib/office/profit-share";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// BR4.3 / 4.4 — finalize or re-finalize profit share for a PROFIT_SHARE case.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:ledger:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    const summary = await finalizeProfitShare(id, session);
    await logOfficeAction(session, {
      action: "case.profit.finalize",
      entity: "Case",
      entityId: id,
      after: summary,
    });
    return NextResponse.json({ ...(await loadCaseDetail(session, id) as object), profitSummary: summary });
  } catch (error) {
    return serverError(error);
  }
}
