import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, serverError } from "@/lib/office/guard";
import { totalLiabilities } from "@/lib/office/ledger";
import { toNumber } from "@/lib/office/money";
import { addDays, formatDateOnly, parseDateOnly, todayPakistan } from "@/lib/office/serializers";

// docs/office-module/03_BUSINESS_RULES.md BR6 — super admin income report.
// GET ?preset=today|daily|week|weekly|month  or  ?from=YYYY-MM-DD&to=YYYY-MM-DD
//
// §N8 office-expense rules (no double counting):
//   - FIXED_COMMISSION office expenses DEBIT the office ledger (type EXPENSE),
//     which is NOT in SHARE_TYPES — so they never hit `commissions` and are NOT
//     subtracted again here. Company profit impact is zero: the debit only
//     reduces the office payout liability.
//   - PROFIT_SHARE office expenses are already netted out of the PROFIT_SHARE
//     credits by finalizeProfitShare() (pool = received − case exp − office exp),
//     so they are NOT subtracted again here either.
//   - SALARY office expenses have no ledger debit; they ARE company costs and
//     are subtracted below as `officeExpenses`.

const SHARE_TYPES = ["COMMISSION_HALF", "COMMISSION_FINAL", "COMMISSION_ADJUST", "EXTRA_SHARE", "PROFIT_SHARE", "ADJUSTMENT"];

function resolveRange(searchParams: URLSearchParams): { from: Date; to: Date } | null {
  const preset = searchParams.get("preset") || "";
  const today = todayPakistan();
  if (preset === "today" || preset === "daily") return { from: today, to: today };
  if (preset === "week" || preset === "weekly") {
    const day = today.getUTCDay(); // 0 = Sunday
    const monday = addDays(today, day === 0 ? -6 : 1 - day);
    return { from: monday, to: addDays(monday, 6) };
  }
  if (preset === "month") {
    const from = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const to = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    return { from, to };
  }
  const from = parseDateOnly(searchParams.get("from"));
  const to = parseDateOnly(searchParams.get("to"));
  if (!from || !to || to < from) return null;
  return { from, to };
}

function salaryEffectiveDate(entry: { paidDate: Date | null; periodMonth: string }) {
  if (entry.paidDate) return entry.paidDate;
  const [year, month] = entry.periodMonth.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

export async function GET(request: NextRequest) {
  const { denied } = await guardOffice("office:finance:read");
  if (denied) return denied;
  try {
    const range = resolveRange(new URL(request.url).searchParams);
    if (!range) return badRequest("from/to dates YYYY-MM-DD format mein dein");
    const { from, to } = range;
    const toExclusive = addDays(to, 1);
    const inRange = { gte: from, lt: toExclusive };
    const fromMonth = formatDateOnly(from).slice(0, 7);
    const toMonth = formatDateOnly(to).slice(0, 7);

    const [payments, shares, caseExpenses, salariesRaw, otherExpenses, officeExpenses, liabilities] = await Promise.all([
      prisma.payment.findMany({
        where: { status: "RECEIVED", paymentDate: inRange },
        select: { amount: true, paymentDate: true, case: { select: { bookingOfficeId: true } } },
      }),
      prisma.ledgerEntry.findMany({
        where: { type: { in: SHARE_TYPES }, entryDate: inRange },
        select: { amount: true, direction: true, entryDate: true, bookingOfficeId: true },
      }),
      prisma.caseExpense.findMany({ where: { expenseDate: inRange }, select: { amount: true, expenseDate: true } }),
      prisma.salaryEntry.findMany({
        where: {
          OR: [
            { paidDate: inRange },
            { paidDate: null, periodMonth: { gte: fromMonth, lte: toMonth } },
          ],
        },
        select: { amount: true, paidDate: true, periodMonth: true, bookingOfficeId: true },
      }),
      prisma.companyExpense.findMany({ where: { expenseDate: inRange }, select: { amount: true, expenseDate: true } }),
      // §N8 — office-level general expenses (OfficeExpense); typed per office below.
      prisma.officeExpense.findMany({
        where: { expenseDate: inRange },
        select: { amount: true, expenseDate: true, bookingOfficeId: true },
      }),
      totalLiabilities(),
    ]);

    const salaries = salariesRaw.filter((entry) => {
      const date = salaryEffectiveDate(entry);
      return date >= from && date < toExclusive;
    });

    type DayRow = { income: Prisma.Decimal; commissions: Prisma.Decimal; caseExpenses: Prisma.Decimal; salaries: Prisma.Decimal; otherExpenses: Prisma.Decimal; officeExpenses: Prisma.Decimal };
    const days: Record<string, DayRow> = {};
    const zero = () => new Prisma.Decimal(0);
    const day = (date: Date): DayRow => {
      const key = formatDateOnly(date);
      if (!days[key]) days[key] = { income: zero(), commissions: zero(), caseExpenses: zero(), salaries: zero(), otherExpenses: zero(), officeExpenses: zero() };
      return days[key];
    };

    const offices = await prisma.bookingOffice.findMany({ select: { id: true, name: true, type: true } });
    const officeType: Record<string, string> = Object.fromEntries(offices.map((o) => [o.id, o.type]));
    const perOffice: Record<string, { income: Prisma.Decimal; commissions: Prisma.Decimal; salaries: Prisma.Decimal; officeExpenses: Prisma.Decimal }> = {};
    const office = (id: string) => {
      if (!perOffice[id]) perOffice[id] = { income: zero(), commissions: zero(), salaries: zero(), officeExpenses: zero() };
      return perOffice[id];
    };

    let income = zero();
    let commissions = zero();
    let caseExpenseTotal = zero();
    let salaryTotal = zero();
    let otherTotal = zero();
    let officeExpenseCompanyCost = zero(); // SALARY-office office expenses only
    let officeExpenseTotal = zero(); // all offices, informational

    for (const p of payments) {
      income = income.plus(p.amount);
      day(p.paymentDate).income = day(p.paymentDate).income.plus(p.amount);
      office(p.case.bookingOfficeId).income = office(p.case.bookingOfficeId).income.plus(p.amount);
    }
    for (const s of shares) {
      const signed = s.direction === "CREDIT" ? s.amount : s.amount.neg();
      commissions = commissions.plus(signed);
      day(s.entryDate).commissions = day(s.entryDate).commissions.plus(signed);
      office(s.bookingOfficeId).commissions = office(s.bookingOfficeId).commissions.plus(signed);
    }
    for (const e of caseExpenses) {
      caseExpenseTotal = caseExpenseTotal.plus(e.amount);
      day(e.expenseDate).caseExpenses = day(e.expenseDate).caseExpenses.plus(e.amount);
    }
    for (const s of salaries) {
      const date = salaryEffectiveDate(s);
      salaryTotal = salaryTotal.plus(s.amount);
      day(date).salaries = day(date).salaries.plus(s.amount);
      office(s.bookingOfficeId).salaries = office(s.bookingOfficeId).salaries.plus(s.amount);
    }
    for (const e of otherExpenses) {
      otherTotal = otherTotal.plus(e.amount);
      day(e.expenseDate).otherExpenses = day(e.expenseDate).otherExpenses.plus(e.amount);
    }
    // §N8: every OfficeExpense shows in the per-office breakdown; only SALARY
    // office expenses are company costs (others are already netted via ledger
    // debits / profit-share pool, so subtracting them would double count).
    for (const e of officeExpenses) {
      officeExpenseTotal = officeExpenseTotal.plus(e.amount);
      office(e.bookingOfficeId).officeExpenses = office(e.bookingOfficeId).officeExpenses.plus(e.amount);
      if (officeType[e.bookingOfficeId] === "SALARY") {
        officeExpenseCompanyCost = officeExpenseCompanyCost.plus(e.amount);
        day(e.expenseDate).officeExpenses = day(e.expenseDate).officeExpenses.plus(e.amount);
      }
    }

    const profit = income
      .minus(commissions)
      .minus(caseExpenseTotal)
      .minus(salaryTotal)
      .minus(otherTotal)
      .minus(officeExpenseCompanyCost);

    return NextResponse.json({
      from: formatDateOnly(from),
      to: formatDateOnly(to),
      summary: {
        income: toNumber(income),
        commissions: toNumber(commissions),
        caseExpenses: toNumber(caseExpenseTotal),
        salaries: toNumber(salaryTotal),
        otherExpenses: toNumber(otherTotal),
        // §N8: SALARY-office office expenses (company cost, subtracted above)
        // and the all-office total (informational, NOT subtracted).
        officeExpenses: toNumber(officeExpenseCompanyCost),
        officeExpensesTotal: toNumber(officeExpenseTotal),
        profit: toNumber(profit),
        liabilities,
        paymentsCount: payments.length,
      },
      days: Object.entries(days)
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .map(([date, row]) => ({
          date,
          income: toNumber(row.income),
          commissions: toNumber(row.commissions),
          caseExpenses: toNumber(row.caseExpenses),
          salaries: toNumber(row.salaries),
          otherExpenses: toNumber(row.otherExpenses),
          officeExpenses: toNumber(row.officeExpenses),
          profit: toNumber(
            row.income
              .minus(row.commissions)
              .minus(row.caseExpenses)
              .minus(row.salaries)
              .minus(row.otherExpenses)
              .minus(row.officeExpenses)
          ),
        })),
      offices: offices
        .map((o) => ({
          id: o.id,
          name: o.name,
          type: o.type,
          income: toNumber(perOffice[o.id]?.income || 0),
          commissions: toNumber(perOffice[o.id]?.commissions || 0),
          salaries: toNumber(perOffice[o.id]?.salaries || 0),
          officeExpenses: toNumber(perOffice[o.id]?.officeExpenses || 0),
        }))
        .filter((o) => o.income || o.commissions || o.salaries || o.officeExpenses),
    });
  } catch (error) {
    return serverError(error);
  }
}
