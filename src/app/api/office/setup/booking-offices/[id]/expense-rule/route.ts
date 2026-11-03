import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parsePercent } from "@/lib/office/money";
import { toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// §W51 — PUT { percent } (0–100): commission office ke case expenses ka kitna %
// commission member ke account se minus. Default 0 (koi expense commission se
// nahi katta). Ye rule case bante waqt case par likh diya jata hai — badalne
// se SIRF naye cases par asar, purane cases waise hi. Kisi khas expense ka %
// admin case page se alag badal sakta hai.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const office = await prisma.bookingOffice.findUnique({
      where: { id },
      select: { id: true, name: true, type: true, expenseDeductPercent: true },
    });
    if (!office) return notFound("Booking office nahi mila");
    if (office.type !== "FIXED_COMMISSION") return badRequest("Ye rule sirf commission office ke liye hai");

    const body = await request.json().catch(() => ({}));
    const percent = parsePercent(body.percent === "" || body.percent === undefined ? 0 : body.percent);
    if (percent === null) return badRequest("Percentage 0 se 100 ke darmiyan ho");

    const updated = await prisma.bookingOffice.update({
      where: { id },
      data: { expenseDeductPercent: percent },
      select: { id: true, expenseDeductPercent: true },
    });
    await logOfficeAction(session, {
      action: "booking-office.expense-rule",
      entity: "BookingOffice",
      entityId: id,
      before: { expenseDeductPercent: office.expenseDeductPercent },
      after: { expenseDeductPercent: percent },
    });
    return NextResponse.json(toJson({ ok: true, ...updated }));
  } catch (error) {
    return serverError(error);
  }
}
