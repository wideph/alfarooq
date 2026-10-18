import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parseAmount } from "@/lib/office/money";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/office/permissions";
import { cleanText, parseDateOnly, todayPakistan, toJson } from "@/lib/office/serializers";
import { getOfficeDirectory } from "@/lib/office/setup-cache";
import { DEPT_COMMISSION_TYPE } from "@/lib/office/dept-commission";

export const preferredRegion = ["sin1"];

// F4 — dept commission payout (admin/cashier only): pays down a dept user's
// remaining commission. LedgerEntry requires a bookingOfficeId, so the payout
// is booked against the office of the user's most recent DEPT_COMMISSION
// entry; with no entries yet, the first active office; else 400.
// Row: type PAYOUT, direction DEBIT, adminId = paid user, memberId null.
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (!hasPermission(session, "office:ledger:write")) return forbidden();

  try {
    const body = await request.json();
    const adminId = typeof body.adminId === "string" ? body.adminId : "";
    if (!adminId) return badRequest("adminId zaroori hai");
    const admin = await prisma.admin.findUnique({
      where: { id: adminId },
      select: { id: true, name: true },
    });
    if (!admin) return notFound("User nahi mila");

    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai (0 se zyada)");

    let method: PaymentMethod | null = null;
    if (body.method !== undefined && body.method !== null && body.method !== "") {
      const raw = String(body.method).toUpperCase() as PaymentMethod;
      if (!PAYMENT_METHODS.includes(raw)) return badRequest("Method sahi nahi hai");
      method = raw;
    }
    const entryDate = parseDateOnly(body.entryDate) ?? todayPakistan();
    const remarks = cleanText(body.remarks, 500);

    // bookingOfficeId resolution: user's latest commission entry's office →
    // first active office → fail.
    const lastCredit = await prisma.ledgerEntry.findFirst({
      where: { type: DEPT_COMMISSION_TYPE, adminId },
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      select: { bookingOfficeId: true },
    });
    let bookingOfficeId = lastCredit?.bookingOfficeId ?? "";
    if (!bookingOfficeId) {
      const offices = await getOfficeDirectory();
      bookingOfficeId = offices.find((office) => office.isActive)?.id ?? offices[0]?.id ?? "";
    }
    if (!bookingOfficeId) return badRequest("Koi booking office nahi mila — payout book nahi ho sakta");

    const entry = await prisma.ledgerEntry.create({
      data: {
        bookingOfficeId,
        memberId: null,
        adminId,
        caseId: null,
        type: "PAYOUT",
        direction: "DEBIT",
        amount,
        entryDate,
        method,
        remarks,
        createdById: session.adminId,
      },
    });

    after(async () => {
      await logOfficeAction(session, {
        action: "dept-commission.payout",
        entity: "LedgerEntry",
        entityId: entry.id,
        after: { adminId, adminName: admin.name, amount, bookingOfficeId, method, entryDate },
      });
    });

    return NextResponse.json(toJson({ ok: true, entry }), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
