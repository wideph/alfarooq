import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parseAmount } from "@/lib/office/money";
import { toJson } from "@/lib/office/serializers";

type RouteParams = { params: Promise<{ id: string }> };

// Replaces the whole commission grid of a FIXED_COMMISSION office:
// body = { items: [{ categoryId, amount }] }. Missing categories are removed.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  const { id } = await params;

  try {
    const office = await prisma.bookingOffice.findUnique({ where: { id } });
    if (!office) return notFound("Booking office nahi mila");
    if (office.type !== "FIXED_COMMISSION") {
      return badRequest("Commission grid sirf fixed-commission office ke liye hai");
    }

    const body = await request.json();
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const items: Array<{ categoryId: string; amount: ReturnType<typeof parseAmount> }> = [];
    for (const item of rawItems) {
      const categoryId = typeof item?.categoryId === "string" ? item.categoryId : "";
      const amount = parseAmount(item?.amount);
      if (!categoryId || amount === null) return badRequest("Commission amount sahi nahi hai");
      items.push({ categoryId, amount });
    }

    const categoryIds = items.map((item) => item.categoryId);
    const categories = await prisma.caseCategory.findMany({ where: { id: { in: categoryIds } } });
    if (categories.length !== new Set(categoryIds).size) {
      return badRequest("Koi category nahi mili");
    }

    const before = await prisma.bookingOfficeCommission.findMany({ where: { bookingOfficeId: id } });

    await prisma.$transaction([
      prisma.bookingOfficeCommission.deleteMany({
        where: { bookingOfficeId: id, categoryId: { notIn: categoryIds } },
      }),
      ...items.map((item) =>
        prisma.bookingOfficeCommission.upsert({
          where: { bookingOfficeId_categoryId: { bookingOfficeId: id, categoryId: item.categoryId } },
          update: { amount: item.amount! },
          create: { bookingOfficeId: id, categoryId: item.categoryId, amount: item.amount! },
        })
      ),
    ]);

    const after = await prisma.bookingOfficeCommission.findMany({
      where: { bookingOfficeId: id },
      include: { category: { select: { id: true, name: true } } },
    });

    await logOfficeAction(session, {
      action: "office_commissions.replace",
      entity: "BookingOffice",
      entityId: id,
      before,
      after,
    });

    return NextResponse.json(toJson(after));
  } catch (error) {
    return serverError(error);
  }
}
