import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { notifyAdmins } from "@/lib/office/notifications";
import { findAccessibleCase } from "@/lib/office/case-access";
import { parseAmount } from "@/lib/office/money";
import { cleanText, toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// GET: discount requests of a case (anyone who can see the case).
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    const items = await prisma.discountRequest.findMany({
      where: { caseId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(toJson({ items }));
  } catch (error) {
    return serverError(error);
  }
}

// POST { amount, reason } — booking office (office:cases:write) can only
// REQUEST a discount; admin/cashier decide via /api/office/discount-requests.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    if (item.status === "CANCELLED") return badRequest("Cancelled case par discount nahi ho sakta");

    const body = await request.json();
    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai");
    if (amount.greaterThan(item.agreedAmount)) {
      return badRequest("Discount agreed amount se zyada nahi ho sakta");
    }

    const pending = await prisma.discountRequest.count({ where: { caseId: id, status: "PENDING" } });
    if (pending > 0) return badRequest("Is case ka pehle se ek discount request pending hai");

    const created = await prisma.discountRequest.create({
      data: {
        caseId: id,
        amount,
        reason: cleanText(body.reason, 500),
        createdById: session.adminId,
      },
    });

    await logOfficeAction(session, {
      action: "discount.request",
      entity: "DiscountRequest",
      entityId: created.id,
      after: { caseId: id, amount, reason: created.reason },
    });

    // §W11.8 — nayi discount request par admins ko notification.
    await notifyAdmins({
      type: "request",
      title: `Case ${item.caseNumber}: discount request`,
      body: created.reason || null,
      link: `/office/cases/${id}`,
    });

    return NextResponse.json(toJson(created), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
