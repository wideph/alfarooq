import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { memberBalance, memberBalances, officeBalances } from "@/lib/office/ledger";
import { parseAmount } from "@/lib/office/money";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/office/permissions";
import { addDays, cleanText, parseDateOnly, toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

// GET ?officeId=&memberId=&from=&to=&page=
// Cashier / super admin (office:ledger:read) see every office; a booking
// office login sees only its own office account.
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const isBookingOffice = session.role === "booking_office";
  if (!isBookingOffice && !hasPermission(session, "office:ledger:read")) return forbidden();

  const { searchParams } = new URL(request.url);
  const officeId = isBookingOffice ? session.bookingOfficeId || "" : searchParams.get("officeId") || "";
  const memberId = searchParams.get("memberId") || "";
  const from = parseDateOnly(searchParams.get("from"));
  const to = parseDateOnly(searchParams.get("to"));
  const page = Math.max(1, Number(searchParams.get("page")) || 1);
  const pageSize = 100;

  const where: Prisma.LedgerEntryWhereInput = {};
  if (officeId) where.bookingOfficeId = officeId;
  if (memberId) where.memberId = memberId;
  if (from || to) {
    where.entryDate = {
      ...(from ? { gte: from } : {}),
      ...(to ? { lt: addDays(to, 1) } : {}),
    };
  }

  const [items, total, balances, members, singleMemberBalance] = await Promise.all([
    prisma.ledgerEntry.findMany({
      where,
      orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        bookingOffice: { select: { id: true, name: true, type: true } },
        member: { select: { id: true, name: true } },
        case: { select: { id: true, caseNumber: true, clientName: true } },
      },
    }),
    prisma.ledgerEntry.count({ where }),
    officeBalances(officeId ? [officeId] : undefined),
    officeId ? memberBalances(officeId) : Promise.resolve({}),
    // §N9 per-user ledger: ?memberId= returns that member's running balance too
    // (all-time, scoped to the office when known — not just the page/range).
    memberId ? memberBalance(memberId, officeId || undefined) : Promise.resolve(null),
  ]);

  return NextResponse.json({
    items: toJson(items),
    total,
    page,
    pageSize,
    officeBalances: balances,
    memberBalances: members,
    memberBalance: singleMemberBalance,
  });
}

// POST payout { bookingOfficeId, memberId?, amount, entryDate, method, remarks }
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:ledger:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const bookingOfficeId = typeof body.bookingOfficeId === "string" ? body.bookingOfficeId : "";
    const office = await prisma.bookingOffice.findUnique({ where: { id: bookingOfficeId } });
    if (!office) return notFound("Booking office nahi mila");
    if (office.type === "SALARY") return badRequest("Salary office ko payout nahi, salary entry lagti hai");

    const memberId = typeof body.memberId === "string" && body.memberId ? body.memberId : null;
    if (memberId) {
      const member = await prisma.bookingOfficeMember.findFirst({ where: { id: memberId, bookingOfficeId } });
      if (!member) return notFound("Member nahi mila");
    }

    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai");
    const entryDate = parseDateOnly(body.entryDate);
    if (!entryDate) return badRequest("Date zaroori hai");
    const method = String(body.method || "CASH") as PaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) return badRequest("Method sahi nahi hai");

    const entry = await prisma.ledgerEntry.create({
      data: {
        bookingOfficeId,
        memberId,
        type: "PAYOUT",
        direction: "DEBIT",
        amount,
        entryDate,
        method,
        remarks: cleanText(body.remarks, 500),
        createdById: session.adminId,
      },
      include: {
        bookingOffice: { select: { id: true, name: true, type: true } },
        member: { select: { id: true, name: true } },
      },
    });

    await logOfficeAction(session, {
      action: "ledger.payout",
      entity: "LedgerEntry",
      entityId: entry.id,
      after: entry,
    });

    return NextResponse.json(toJson(entry), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

// DELETE ?id= — super admin only, PAYOUT / manual rows only (auto rows are
// owned by the recompute engine and must be reversed by it).
export async function DELETE(request: NextRequest) {
  const { session, denied } = await guardOffice("office:ledger:write");
  if (denied) return denied;
  if (session.role !== "admin") return forbidden("Ledger row sirf super admin delete kar sakta hai");
  const id = new URL(request.url).searchParams.get("id") || "";
  const existing = await prisma.ledgerEntry.findUnique({ where: { id } });
  if (!existing) return notFound("Entry nahi mili");
  if (existing.type !== "PAYOUT") return badRequest("Sirf payout entry delete ho sakti hai");
  await prisma.ledgerEntry.delete({ where: { id } });
  await logOfficeAction(session, { action: "ledger.delete", entity: "LedgerEntry", entityId: id, before: existing });
  return NextResponse.json({ success: true });
}
