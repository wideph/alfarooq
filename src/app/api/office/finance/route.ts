import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, serverError } from "@/lib/office/guard";
import { totalLiabilities } from "@/lib/office/ledger";
import { toNumber } from "@/lib/office/money";
import { addDays, formatDateOnly, parseDateOnly, todayPakistan } from "@/lib/office/serializers";

// docs/office-module/03_BUSINESS_RULES.md BR6 — super admin income report.
// GET ?preset=today|week|month  or  ?from=YYYY-MM-DD&to=YYYY-MM-DD

const SHARE_TYPES = ["COMMISSION_HALF", "COMMISSION_FINAL", "COMMISSION_ADJUST", "EXTRA_SHARE", "PROFIT_SHARE", "ADJUSTMENT"];

function resolveRange(searchParams: URLSearchParams): { from: Date; to: Date } | null {
  const preset = searchParams.get("preset") || "";
  const today = todayPakistan();
  if (preset === "today") return { from: today, to: today };
  if (preset === "week") {
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

    const [payments, shares, caseExpenses, salariesRaw, otherExpenses, liabilities] = await Promise.all([
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
      totalLiabilities(),
    ]);

    const salaries = salariesRaw.filter((entry) => {
      const date = salaryEffectiveDate(entry);
      return date >= from && date < toExclusive;
    });

    type DayRow = { income: Prisma.Decimal; commissions: Prisma.Decimal; caseExpenses: Prisma.Decimal; salaries: Prisma.Decimal; otherExpenses: Prisma.Decimal };
    const days: Record<string, DayRow> = {};
    const zero = () => new Prisma.Decimal(0);
    const day = (date: Date): DayRow => {
      const key = formatDateOnly(date);
      if (!days[key]) days[key] = { income: zero(), commissions: zero(), caseExpenses: zero(), salaries: zero(), otherExpenses: zero() };
      return days[key];
    };

    const offices = await prisma.bookingOffice.findMany({ select: { id: true, name: true, type: true } });
    const perOffice: Record<string, { income: Prisma.Decimal; commissions: Prisma.Decimal; salaries: Prisma.Decimal }> = {};
    const office = (id: string) => {
      if (!perOffice[id]) perOffice[id] = { income: zero(), commissions: zero(), salaries: zero() };
      return perOffice[id];
    };

    let income = zero();
    let commissions = zero();
    let caseExpenseTotal = zero();
    let salaryTotal = zero();
    let otherTotal = zero();

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

    const profit = income.minus(commissions).minus(caseExpenseTotal).minus(salaryTotal).minus(otherTotal);

    return NextResponse.json({
      from: formatDateOnly(from),
      to: formatDateOnly(to),
      summary: {
        income: toNumber(income),
        commissions: toNumber(commissions),
        caseExpenses: toNumber(caseExpenseTotal),
        salaries: toNumber(salaryTotal),
        otherExpenses: toNumber(otherTotal),
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
          profit: toNumber(row.income.minus(row.commissions).minus(row.caseExpenses).minus(row.salaries).minus(row.otherExpenses)),
        })),
      offices: offices
        .map((o) => ({
          id: o.id,
          name: o.name,
          type: o.type,
          income: toNumber(perOffice[o.id]?.income || 0),
          commissions: toNumber(perOffice[o.id]?.commissions || 0),
          salaries: toNumber(perOffice[o.id]?.salaries || 0),
        }))
        .filter((o) => o.income || o.commissions || o.salaries),
    });
  } catch (error) {
    return serverError(error);
  }
}
