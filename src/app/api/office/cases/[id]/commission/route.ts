import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { recomputeCaseFinancials } from "@/lib/office/commission";
import { parseAmount, parsePercent } from "@/lib/office/money";
import { cleanText } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// BR3.2 (reduce commission) and BR3.6 (extra-amount share %). Cashier / super admin.
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
    const data: { commissionAmount?: ReturnType<typeof parseAmount>; extraSharePercent?: ReturnType<typeof parsePercent> } = {};
    const remarks = cleanText(body.reason, 300);

    if (body.commissionAmount !== undefined) {
      const commissionAmount = parseAmount(body.commissionAmount);
      if (commissionAmount === null) return badRequest("Commission amount sahi nahi hai");
      if (!remarks) return badRequest("Commission change ki wajah likhein");
      data.commissionAmount = commissionAmount;
    }
    if (body.extraSharePercent !== undefined) {
      const extraSharePercent = parsePercent(body.extraSharePercent);
      if (extraSharePercent === null) return badRequest("Extra share % 0 se 100 ke darmiyan ho");
      data.extraSharePercent = extraSharePercent;
    }
    if (Object.keys(data).length === 0) return badRequest("Kuch change nahi kiya");

    await prisma.case.update({
      where: { id },
      data: {
        ...(data.commissionAmount !== undefined ? { commissionAmount: data.commissionAmount! } : {}),
        ...(data.extraSharePercent !== undefined ? { extraSharePercent: data.extraSharePercent! } : {}),
      },
    });
    await logOfficeAction(session, {
      action: "case.commission",
      entity: "Case",
      entityId: id,
      before: { commissionAmount: item.commissionAmount, extraSharePercent: item.extraSharePercent },
      after: { ...data, remarks },
    });

    const result = await recomputeCaseFinancials(id, session);
    const detail = await loadCaseDetail(session, id);
    return NextResponse.json({ ...(detail as object), needsExtraDecision: result.needsExtraDecision });
  } catch (error) {
    return serverError(error);
  }
}
