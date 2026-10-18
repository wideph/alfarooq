import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parseAmount, round2, toNumber } from "@/lib/office/money";
import { findCachedOffice } from "@/lib/office/setup-cache";
import { addDays, cleanText, formatDateOnly, parseDateOnly, toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

// Office-level general expenses (OfficeExpense) — docs/office-module/06_NEW_REQUIREMENTS.md §N8.
// Accounting per booking office type (LedgerEntry written in the SAME transaction):
//   FIXED_COMMISSION → EXPENSE DEBIT on the office ledger (memberId when given) so it
//     reduces the commission balance ("minus from that user's commission"). The
//     company profit impact is zero — the debit only reduces the office payout.
//     §W21 (F5): jab deductFromCommission=true ho to single office-level debit ki
//     jagah PER-MEMBER split debits banti hain (tag `Commission expense share [`).
//   PROFIT_SHARE     → §W15.1: PER-MEMBER EXPENSE DEBIT rows — har active member
//     (profitPercent > 0) ke account se amount × percent/100 minus; agar expense
//     par memberId hai to poora amount sirf us member par. Remarks tag
//     `Office expense share [<expenseId>]: <description>` se identify hote hain.
//     Profit pool ab office expenses se depend NAHI karta (pool = received −
//     case expenses ONLY), is liye koi re-finalize nahi chalta.
//   SALARY           → NO ledger debit. The expense is a company (admin) cost and
//     is subtracted in the finance report (BR6-style) only.
// Case expenses stay on CaseExpense and NEVER reduce commission (N8).

// GET ?officeId=&from=&to= — office:ledger:read (admin/cashier: sab ya
// officeId se filter); a booking_office login only sees its own office
// (officeId param ignore hota hai). Response: { ok, expenses: [...] } with
// per-member `allocations` derived from the §W15.1 EXPENSE ledger rows
// (remarks tag `Office expense share [<expenseId>]: ...`). FIXED_COMMISSION
// office-level expenses have no per-member rows → allocations [].
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const isBookingOffice = session.role === "booking_office";
  if (!isBookingOffice && !hasPermission(session, "office:ledger:read")) return forbidden();

  const { searchParams } = new URL(request.url);
  const bookingOfficeId = isBookingOffice
    ? session.bookingOfficeId || "__none__"
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
    },
  });

  // Per-member split: ONE query over the allocation ledger rows of the
  // returned offices, bucketed by the [<expenseId>] tag in remarks. Dono tag
  // prefixes: §W15.1 `Office expense share [` (PROFIT_SHARE) aur §W21
  // `Commission expense share [` (FIXED_COMMISSION + deductFromCommission).
  const officeIds = [...new Set(items.map((item) => item.bookingOfficeId))];
  const allocationRows = officeIds.length
    ? await prisma.ledgerEntry.findMany({
        where: {
          bookingOfficeId: { in: officeIds },
          type: "EXPENSE",
          direction: "DEBIT",
          OR: [
            { remarks: { startsWith: "Office expense share [" } },
            { remarks: { startsWith: "Commission expense share [" } },
          ],
        },
        select: {
          amount: true,
          remarks: true,
          member: { select: { id: true, name: true } },
        },
      })
    : [];

  const wanted = new Set(items.map((item) => item.id));
  const allocationsByExpense = new Map<string, Array<{ memberId: string | null; memberName: string | null; amount: number }>>();
  for (const row of allocationRows) {
    const match = /\[([^\]]+)\]/.exec(row.remarks || "");
    if (!match || !wanted.has(match[1])) continue;
    const list = allocationsByExpense.get(match[1]) ?? [];
    list.push({
      memberId: row.member?.id ?? null,
      memberName: row.member?.name ?? null,
      amount: toNumber(row.amount),
    });
    allocationsByExpense.set(match[1], list);
  }

  return NextResponse.json({
    ok: true,
    expenses: items.map((item) => ({
      id: item.id,
      officeId: item.bookingOffice.id,
      officeName: item.bookingOffice.name,
      officeType: item.bookingOffice.type,
      entryDate: formatDateOnly(item.expenseDate),
      description: item.description,
      amount: toNumber(item.amount),
      deductFromCommission: item.deductFromCommission,
      allocations: allocationsByExpense.get(item.id) ?? [],
    })),
  });
}

// POST { bookingOfficeId, memberId?, amount, description, expenseDate, deductFromCommission? }
// §W21 (F5): deductFromCommission (default false) SIRF FIXED_COMMISSION office par
// asar karti hai — expense tamam active members par profitPercent se split (sab
// percents 0 hon to equal split) ho kar har member ke commission ledger se
// EXPENSE DEBIT kat-ta hai; remarks tag `Commission expense share [<expenseId>]:`.
// Members na hon to ek office-level row (memberId null). PROFIT_SHARE / SALARY
// par flag store hota hai magar behavior bilkul wahi rehta hai (double-deduct nahi).
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:expenses:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const bookingOfficeId = typeof body.bookingOfficeId === "string" ? body.bookingOfficeId : "";
    const memberId = typeof body.memberId === "string" && body.memberId ? body.memberId : null;
    const deductFromCommission =
      body.deductFromCommission === true || body.deductFromCommission === "true" || body.deductFromCommission === "1";
    // §W20: office cached directory se; member check usi ke parallel (dono
    // independent hain — pehle 2 sequential round-trips thi).
    const [office, member] = await Promise.all([
      findCachedOffice(bookingOfficeId),
      memberId
        ? prisma.bookingOfficeMember.findFirst({ where: { id: memberId, bookingOfficeId } })
        : Promise.resolve(null),
    ]);
    if (!office) return notFound("Booking office nahi mila");
    if (memberId && !member) return notFound("Member nahi mila");

    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai");
    const description = cleanText(body.description, 300) || "Office expense";
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
          deductFromCommission,
          createdById: session.adminId,
        },
        include: {
          bookingOffice: { select: { id: true, name: true, type: true } },
          member: { select: { id: true, name: true } },
        },
      });

      // §N8/§W15.1: SALARY office expenses are charged to the company (no office
      // ledger debit); commission offices get an office-level EXPENSE debit;
      // partner (PROFIT_SHARE) offices get PER-MEMBER EXPENSE debits.
      // §W21 (F5): FIXED_COMMISSION + deductFromCommission → per-member split.
      if (office.type === "FIXED_COMMISSION" && deductFromCommission) {
        const remarks = `Commission expense share [${created.id}]: ${description}`;
        // Tamam active members (percent 0 wale bhi — fallback equal split ke
        // liye chahiye). ProfitPercent ka total > 0 ho to percent split, warna
        // equal split. Rounding remainder office/admin ka hissa rehta hai.
        const members = await tx.bookingOfficeMember.findMany({
          where: { bookingOfficeId, isActive: true },
          select: { id: true, profitPercent: true },
        });
        const totalPercent = members.reduce((acc, member) => acc.plus(member.profitPercent), new Prisma.Decimal(0));
        const shareRows = (
          totalPercent.greaterThan(0)
            ? members.map((member) => ({
                memberId: member.id,
                amount: round2(amount.mul(member.profitPercent).div(100)),
              }))
            : members.map((member) => ({
                memberId: member.id,
                amount: round2(amount.div(members.length)),
              }))
        ).filter((row) => !row.amount.isZero());
        if (shareRows.length > 0) {
          await tx.ledgerEntry.createMany({
            data: shareRows.map((row) => ({
              bookingOfficeId,
              memberId: row.memberId,
              type: "EXPENSE",
              direction: "DEBIT",
              amount: row.amount,
              entryDate: expenseDate,
              remarks,
              createdById: session.adminId,
            })),
          });
        } else {
          // Office ka koi active member nahi → single office-level row.
          await tx.ledgerEntry.create({
            data: {
              bookingOfficeId,
              memberId: null,
              type: "EXPENSE",
              direction: "DEBIT",
              amount,
              entryDate: expenseDate,
              remarks,
              createdById: session.adminId,
            },
          });
        }
      } else if (office.type === "PROFIT_SHARE") {
        // §W15.1 — per-share allocation. memberId set ho to poora amount sirf
        // us member par; warna tamam active members (percent > 0) par
        // amount × percent/100. Admin remainder admin ki apni cost hai (koi
        // entry nahi).
        const remarks = `Office expense share [${created.id}]: ${description}`;
        if (memberId) {
          await tx.ledgerEntry.create({
            data: {
              bookingOfficeId,
              memberId,
              type: "EXPENSE",
              direction: "DEBIT",
              amount,
              entryDate: expenseDate,
              remarks,
              createdById: session.adminId,
            },
          });
        } else {
          const members = await tx.bookingOfficeMember.findMany({
            where: { bookingOfficeId, isActive: true, profitPercent: { gt: 0 } },
            select: { id: true, profitPercent: true },
          });
          // §W20: per-member share rows ek hi createMany mein (pehle har member
          // ke liye alag INSERT round-trip tha).
          const shareRows = members
            .map((member) => ({
              bookingOfficeId,
              memberId: member.id,
              type: "EXPENSE",
              direction: "DEBIT",
              amount: round2(amount.mul(member.profitPercent).div(100)),
              entryDate: expenseDate,
              remarks,
              createdById: session.adminId,
            }))
            .filter((row) => !row.amount.isZero());
          if (shareRows.length > 0) {
            await tx.ledgerEntry.createMany({ data: shareRows });
          }
        }
      } else if (office.type !== "SALARY") {
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

    // §W15.1 — pool ab office expenses par depend nahi karta; koi re-finalize
    // nahi chalta (wave-14 refinalizeOfficeCases remove kar diya gaya).
    return NextResponse.json(toJson(expense), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

// DELETE ?id= — super admin only. PROFIT_SHARE: isi transaction mein per-member
// allocation rows DELETE hote hain (remarks tag se identify). Baqi types ke liye
// the ledger is never rewritten (BR1.5), so the EXPENSE debit is neutralised
// with a reversing CREDIT on the same entryDate.
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
    if (existing.deductFromCommission && existing.bookingOffice.type === "FIXED_COMMISSION") {
      // §W21 (F5) — commission-share rows isi tx mein delete (remarks tag).
      await tx.ledgerEntry.deleteMany({
        where: {
          bookingOfficeId: existing.bookingOfficeId,
          type: "EXPENSE",
          remarks: { startsWith: `Commission expense share [${id}]:` },
        },
      });
    } else if (existing.bookingOffice.type === "PROFIT_SHARE") {
      // §W15.1 — per-member allocation rows isi tx mein delete (remarks tag).
      await tx.ledgerEntry.deleteMany({
        where: {
          bookingOfficeId: existing.bookingOfficeId,
          type: "EXPENSE",
          remarks: { startsWith: `Office expense share [${id}]:` },
        },
      });
    } else if (existing.bookingOffice.type !== "SALARY") {
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
