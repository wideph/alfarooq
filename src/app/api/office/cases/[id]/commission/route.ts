import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { recomputeCaseFinancials } from "@/lib/office/commission";
import { parseAmount } from "@/lib/office/money";
import { cleanText } from "@/lib/office/serializers";
import { applyExtraDecision, ExtraDecisionError } from "@/lib/office/extra-share";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// BR3.2 (reduce commission) and BR3.6 (extra-amount share). Cashier / super admin.
// §W56: extra ka faisla TUKRON mein (extra-share.ts applyExtraDecision) —
//   { extraDecision: { mode: "PERCENT" | "AMOUNT", value, trancheId? } }
//   trancheId na ho → abhi ki BAQI (tay na shuda) extra ka naya tukra;
//   trancheId ho → us tukre ka hissa badalna (% ya Rs).
//   Purana { extraSharePercent } bhi chalta hai (= PERCENT faisla).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:ledger:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id, { bookingOffice: { select: { type: true } } });
    if (!item) return notFound("Case nahi mila");
    if (item.bookingOffice.type !== "FIXED_COMMISSION") {
      return badRequest("Commission sirf fixed-commission office ke case par lagti hai");
    }

    const body = await request.json();
    const remarks = cleanText(body.reason, 300);
    let commissionAmount: ReturnType<typeof parseAmount> | undefined;
    if (body.commissionAmount !== undefined) {
      commissionAmount = parseAmount(body.commissionAmount);
      if (commissionAmount === null) return badRequest("Commission amount sahi nahi hai");
      if (!remarks) return badRequest("Commission change ki wajah likhein");
    }
    const rawDecision: { mode?: unknown; value?: unknown; trancheId?: unknown } | null =
      body.extraDecision && typeof body.extraDecision === "object"
        ? (body.extraDecision as { mode?: unknown; value?: unknown; trancheId?: unknown })
        : body.extraSharePercent !== undefined
          ? { mode: "PERCENT", value: body.extraSharePercent }
          : null;
    if (commissionAmount === undefined && !rawDecision) return badRequest("Kuch change nahi kiya");

    if (commissionAmount) await prisma.case.update({ where: { id }, data: { commissionAmount } });
    const extraLog = rawDecision ? await applyExtraDecision(id, session.adminId, rawDecision) : null;

    await logOfficeAction(session, {
      action: "case.commission",
      entity: "Case",
      entityId: id,
      before: { commissionAmount: item.commissionAmount, extraSharePercent: item.extraSharePercent },
      after: { ...(commissionAmount ? { commissionAmount } : {}), ...(extraLog ? { extraDecision: extraLog } : {}), remarks },
    });

    const result = await recomputeCaseFinancials(id, session);
    const detail = await loadCaseDetail(session, id);
    return NextResponse.json({ ...(detail as object), needsExtraDecision: result.needsExtraDecision });
  } catch (error) {
    if (error instanceof ExtraDecisionError) return badRequest(error.message);
    return serverError(error);
  }
}
