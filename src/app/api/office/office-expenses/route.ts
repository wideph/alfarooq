import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parseAmount } from "@/lib/office/money";
import { addDays, cleanText, parseDateOnly, toJson } from "@/lib/office/serializers";

// Office-level general expenses (OfficeExpense) — docs/office-module/06_NEW_REQUIREMENTS.md §N8.
// Accounting per booking office type (LedgerEntry written in the SAME transaction):
//   FIXED_COMMISSION → EXPENSE DEBIT on the office ledger (memberId when given) so it
//     reduces the commission balance ("minus from that user's commission"). The
//     company profit impact is zero — the debit only reduces the office payout.
//   PROFIT_SHARE     → EXPENSE DEBIT on the office ledger; the expense is ALSO
//     deducted from the case profit pool in finalizeProfitShare() (N8: partner
//     office expenses come out of the whole before shares are distributed).
//   SALARY           → NO ledger debit. The expense is a company (admin) cost and
//     is subtracted in the finance report (BR6-style) only.
// Case expenses stay on CaseExpense and NEVER reduce commission (N8).

// GET ?bookingOfficeId=&from=&to= — office:ledger:read; a booking_office login
// only sees its own office (same scoping as /api/office/ledger).
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const isBookingOffice = session.role === "booking_office";
  if (!isBookingOffice && !hasPermission(session, "office:ledger:read")) return forbidden();

  const { searchParams } = new URL(request.url);
  const bookingOfficeId = isBookingOffice
    ? session.bookingOfficeId || ""
    : searchParams.get("bookingOfficeId") || searchParams.get("officeId") || "";
  const from = parseDateOnly(searchParams.get("from"));
  const to = parseDateOnly(searchParams.get("to"));

  const where: Prisma.OfficeExpenseWhereInput = {};
  if (bookingOfficeId) where.bookingOfficeId = bookingOfficeId;
  if (from || to) where.expenseDate = { ...(from ? { gte: from } : {}), ...(to ? { lt: addDays(to, 1) } : {}) };

  const items = await prisma.officeExpense.findMany({
    where,
    orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }],
    take: 300,
    include: {
      bookingOffice: { select: { id: true, name: true, type: true } },
      member: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(toJson(items));
}

// POST { bookingOfficeId, memberId?, amount, description, expenseDate }
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const bookingOfficeId = typeof body.bookingOfficeId === "string" ? body.bookingOfficeId : "";
    const office = await prisma.bookingOffice.findUnique({ where: { id: bookingOfficeId } });
    if (!office) return notFound("Booking office nahi mila");

    const memberId = typeof body.memberId === "string" && body.memberId ? body.memberId : null;
    if (memberId) {
      const member = await prisma.bookingOfficeMember.findFirst({ where: { id: memberId, bookingOfficeId } });
      if (!member) return notFound("Member nahi mila");
    }

    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai");
    const description = cleanText(body.description, 300);
    if (!description) return badRequest("Expense ki tafseel likhein");
    const expenseDate = parseDateOnly(body.expenseDate);
    if (!expenseDate) return badRequest("Date zaroori hai");

    const expense = await prisma.$transaction(async (tx) => {
      const created = await tx.officeExpense.create({
        data: {
          bookingOfficeId,
          memberId,
          amount,
          description,
          expenseDate,
          createdById: session.adminId,
        },
        include: {
          bookingOffice: { select: { id: true, name: true, type: true } },
          member: { select: { id: true, name: true } },
        },
      });

      // §N8: SALARY office expenses are charged to the company (no office ledger
      // debit); commission/partner offices get an EXPENSE debit on their ledger.
      if (office.type !== "SALARY") {
        await tx.ledgerEntry.create({
          data: {
            bookingOfficeId,
            memberId,
            type: "EXPENSE",
            direction: "DEBIT",
            amount,
            entryDate: expenseDate,
            remarks: `Office expense: ${description}`,
            createdById: session.adminId,
          },
        });
      }

      await logOfficeAction(
        session,
        { action: "office_expense.create", entity: "OfficeExpense", entityId: created.id, after: created },
        tx
      );
      return created;
    }, { maxWait: 10000, timeout: 30000 });

    return NextResponse.json(toJson(expense), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

// DELETE ?id= — super admin only. The ledger is never rewritten (BR1.5), so the
// EXPENSE debit is neutralised with a reversing CREDIT on the same entryDate.
export async function DELETE(request: NextRequest) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  if (session.role !== "admin") return forbidden("Office expense sirf super admin delete kar sakta hai");

  const id = new URL(request.url).searchParams.get("id") || "";
  const existing = await prisma.officeExpense.findUnique({
    where: { id },
    include: { bookingOffice: { select: { type: true } } },
  });
  if (!existing) return notFound("Expense nahi mila");

  await prisma.$transaction(async (tx) => {
    if (existing.bookingOffice.type !== "SALARY") {
      await tx.ledgerEntry.create({
        data: {
          bookingOfficeId: existing.bookingOfficeId,
          memberId: existing.memberId,
          type: "EXPENSE",
          direction: "CREDIT",
          amount: existing.amount,
          entryDate: existing.expenseDate,
          remarks: `Office expense delete — reversal: ${existing.description}`,
          createdById: session.adminId,
        },
      });
    }
    await tx.officeExpense.delete({ where: { id } });
    await logOfficeAction(
      session,
      { action: "office_expense.delete", entity: "OfficeExpense", entityId: id, before: existing },
      tx
    );
  }, { maxWait: 10000, timeout: 30000 });

  return NextResponse.json({ success: true });
}
