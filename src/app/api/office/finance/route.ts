import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, serverError } from "@/lib/office/guard";
import { totalLiabilities } from "@/lib/office/ledger";
import { getOfficeDirectory } from "@/lib/office/setup-cache";
import { dec, toNumber } from "@/lib/office/money";
import { addDays, formatDateOnly, parseDateOnly, todayPakistan } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

// docs/office-module/03_BUSINESS_RULES.md BR6 — super admin income report.
// GET ?preset=today|daily|week|weekly|month  or  ?from=YYYY-MM-DD&to=YYYY-MM-DD
// §W21: range optional — koi preset/from/to nahi to report ALL-TIME chalti hai
// (from/to response mein null). ?officeId= dene par top-level `profit` sirf us
// office ka scoped hota hai (offices[] waisi hi rehti hai).
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
//
// §W21 `profit` object (top-level + per office): raw bucket list — received,
// expenses, aur har share/deduction ledger type ka net. Ye summary.profit se
// alag hai: yahan officeExpenses ALL offices ki count hoti hain (admin ko
// poora breakdown chahiye), aur net = received − deductionsTotal.

const SHARE_TYPES = ["COMMISSION_HALF", "COMMISSION_ADJUST", "COMMISSION_FINAL", "EXTRA_SHARE", "PROFIT_SHARE", "ADJUSTMENT"];
// §W21 profit buckets ke liye ledger types (SHARE_TYPES + BONUS + DEPT_COMMISSION).
const PROFIT_LEDGER_TYPES = [...SHARE_TYPES, "BONUS", "DEPT_COMMISSION"];

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

// §W21 profit bucket — sab Decimal; JSON numbers mein convert hote hain.
type ProfitBucket = {
  received: Prisma.Decimal;
  caseExpenses: Prisma.Decimal;
  officeExpenses: Prisma.Decimal;
  commissions: Prisma.Decimal;
  profitShares: Prisma.Decimal;
  extraShares: Prisma.Decimal;
  salaries: Prisma.Decimal;
  bonuses: Prisma.Decimal;
  deptCommissions: Prisma.Decimal;
  adjustments: Prisma.Decimal;
};

function newProfitBucket(): ProfitBucket {
  const zero = () => new Prisma.Decimal(0);
  return {
    received: zero(),
    caseExpenses: zero(),
    officeExpenses: zero(),
    commissions: zero(),
    profitShares: zero(),
    extraShares: zero(),
    salaries: zero(),
    bonuses: zero(),
    deptCommissions: zero(),
    adjustments: zero(),
  };
}

function addLedgerToBucket(bucket: ProfitBucket, type: string, signed: Prisma.Decimal) {
  if (type === "COMMISSION_HALF" || type === "COMMISSION_FINAL" || type === "COMMISSION_ADJUST") {
    bucket.commissions = bucket.commissions.plus(signed);
  } else if (type === "PROFIT_SHARE") {
    bucket.profitShares = bucket.profitShares.plus(signed);
  } else if (type === "EXTRA_SHARE") {
    bucket.extraShares = bucket.extraShares.plus(signed);
  } else if (type === "BONUS") {
    bucket.bonuses = bucket.bonuses.plus(signed);
  } else if (type === "DEPT_COMMISSION") {
    bucket.deptCommissions = bucket.deptCommissions.plus(signed);
  } else if (type === "ADJUSTMENT") {
    bucket.adjustments = bucket.adjustments.plus(signed);
  }
}

function profitJson(bucket: ProfitBucket) {
  const deductionsTotal = bucket.caseExpenses
    .plus(bucket.officeExpenses)
    .plus(bucket.commissions)
    .plus(bucket.profitShares)
    .plus(bucket.extraShares)
    .plus(bucket.salaries)
    .plus(bucket.bonuses)
    .plus(bucket.deptCommissions)
    .plus(bucket.adjustments);
  return {
    received: toNumber(bucket.received),
    caseExpenses: toNumber(bucket.caseExpenses),
    officeExpenses: toNumber(bucket.officeExpenses),
    commissions: toNumber(bucket.commissions),
    profitShares: toNumber(bucket.profitShares),
    extraShares: toNumber(bucket.extraShares),
    salaries: toNumber(bucket.salaries),
    bonuses: toNumber(bucket.bonuses),
    deptCommissions: toNumber(bucket.deptCommissions),
    adjustments: toNumber(bucket.adjustments),
    deductionsTotal: toNumber(deductionsTotal),
    net: toNumber(bucket.received.minus(deductionsTotal)),
  };
}

export async function GET(request: NextRequest) {
  const { denied } = await guardOffice("office:finance:read");
  if (denied) return denied;
  try {
    const searchParams = new URL(request.url).searchParams;
    const scopeOfficeId = searchParams.get("officeId") || "";
    const hasRangeInput = Boolean(
      searchParams.get("preset") || searchParams.get("from") || searchParams.get("to")
    );
    const range = resolveRange(searchParams);
    // §W21: range input diya ho magar invalid ho to 400; bilkul na diya ho to
    // ALL-TIME report (profit bhi all-time).
    if (!range && hasRangeInput) return badRequest("from/to dates YYYY-MM-DD format mein dein");
    const from = range?.from ?? null;
    const to = range?.to ?? null;
    const toExclusive = to ? addDays(to, 1) : null;
    const inRange = from && toExclusive ? { gte: from, lt: toExclusive } : undefined;
    const fromMonth = from ? formatDateOnly(from).slice(0, 7) : "";
    const toMonth = to ? formatDateOnly(to).slice(0, 7) : "";

    // §W20: offices list cached directory se (pehle report queries ke BAAD ek
    // alag sequential round-trip thi) — ab sab ek hi parallel batch mein.
    const [payments, shares, caseExpenses, salariesRaw, otherExpenses, officeExpenses, liabilities, offices, remainingRows] =
      await Promise.all([
        prisma.payment.findMany({
          where: { status: "RECEIVED", ...(inRange ? { paymentDate: inRange } : {}) },
          select: { amount: true, paymentDate: true, case: { select: { bookingOfficeId: true } } },
        }),
        prisma.ledgerEntry.findMany({
          where: { type: { in: PROFIT_LEDGER_TYPES }, ...(inRange ? { entryDate: inRange } : {}) },
          select: { amount: true, direction: true, entryDate: true, bookingOfficeId: true, type: true },
        }),
        prisma.caseExpense.findMany({
          where: inRange ? { expenseDate: inRange } : {},
          select: { amount: true, expenseDate: true, case: { select: { bookingOfficeId: true } } },
        }),
        prisma.salaryEntry.findMany({
          where: inRange
            ? {
                OR: [
                  { paidDate: inRange },
                  { paidDate: null, periodMonth: { gte: fromMonth, lte: toMonth } },
                ],
              }
            : {},
          select: { amount: true, paidDate: true, periodMonth: true, bookingOfficeId: true },
        }),
        prisma.companyExpense.findMany({
          where: inRange ? { expenseDate: inRange } : {},
          select: { amount: true, expenseDate: true },
        }),
        // §N8 — office-level general expenses (OfficeExpense); typed per office below.
        prisma.officeExpense.findMany({
          where: inRange ? { expenseDate: inRange } : {},
          select: { amount: true, expenseDate: true, bookingOfficeId: true },
        }),
        totalLiabilities(),
        getOfficeDirectory(),
        // §W21 per-office `remaining` (dashboard wala formula): tamam non-CANCELLED
        // cases par max(agreedAmount − received, 0). Point-in-time outstanding hai
        // — range se bound nahi. Batch query, koi N+1 nahi.
        prisma.case.findMany({
          where: { status: { not: "CANCELLED" } },
          select: {
            bookingOfficeId: true,
            agreedAmount: true,
            payments: { where: { status: "RECEIVED" }, select: { amount: true } },
          },
        }),
      ]);

    const salaries = salariesRaw.filter((entry) => {
      if (!from || !toExclusive) return true; // all-time
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

    const officeType: Record<string, string> = Object.fromEntries(offices.map((o) => [o.id, o.type]));
    const perOffice: Record<string, { income: Prisma.Decimal; commissions: Prisma.Decimal; salaries: Prisma.Decimal; officeExpenses: Prisma.Decimal }> = {};
    const office = (id: string) => {
      if (!perOffice[id]) perOffice[id] = { income: zero(), commissions: zero(), salaries: zero(), officeExpenses: zero() };
      return perOffice[id];
    };
    // §W21 — per-office remaining + profit buckets.
    const remainingByOffice: Record<string, Prisma.Decimal> = {};
    const profitByOffice: Record<string, ProfitBucket> = {};
    const profitOffice = (id: string): ProfitBucket => {
      if (!profitByOffice[id]) profitByOffice[id] = newProfitBucket();
      return profitByOffice[id];
    };
    const totalProfit = newProfitBucket();

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
      profitOffice(p.case.bookingOfficeId).received = profitOffice(p.case.bookingOfficeId).received.plus(p.amount);
      totalProfit.received = totalProfit.received.plus(p.amount);
    }
    for (const s of shares) {
      const signed = s.direction === "CREDIT" ? s.amount : s.amount.neg();
      // summary/days/offices[].commissions ka purana matlab (SHARE_TYPES ka net)
      // waisa hi rakhte hain; BONUS/DEPT_COMMISSION sirf profit buckets mein.
      if (SHARE_TYPES.includes(s.type)) {
        commissions = commissions.plus(signed);
        day(s.entryDate).commissions = day(s.entryDate).commissions.plus(signed);
        office(s.bookingOfficeId).commissions = office(s.bookingOfficeId).commissions.plus(signed);
      }
      addLedgerToBucket(profitOffice(s.bookingOfficeId), s.type, signed);
      addLedgerToBucket(totalProfit, s.type, signed);
    }
    for (const e of caseExpenses) {
      caseExpenseTotal = caseExpenseTotal.plus(e.amount);
      day(e.expenseDate).caseExpenses = day(e.expenseDate).caseExpenses.plus(e.amount);
      profitOffice(e.case.bookingOfficeId).caseExpenses = profitOffice(e.case.bookingOfficeId).caseExpenses.plus(e.amount);
      totalProfit.caseExpenses = totalProfit.caseExpenses.plus(e.amount);
    }
    for (const s of salaries) {
      const date = salaryEffectiveDate(s);
      salaryTotal = salaryTotal.plus(s.amount);
      day(date).salaries = day(date).salaries.plus(s.amount);
      office(s.bookingOfficeId).salaries = office(s.bookingOfficeId).salaries.plus(s.amount);
      profitOffice(s.bookingOfficeId).salaries = profitOffice(s.bookingOfficeId).salaries.plus(s.amount);
      totalProfit.salaries = totalProfit.salaries.plus(s.amount);
    }
    for (const e of otherExpenses) {
      otherTotal = otherTotal.plus(e.amount);
      day(e.expenseDate).otherExpenses = day(e.expenseDate).otherExpenses.plus(e.amount);
    }
    // §N8: every OfficeExpense shows in the per-office breakdown; only SALARY
    // office expenses are company costs (others are already netted via ledger
    // debits / profit-share pool, so subtracting them would double count).
    // §W21: profit buckets mein officeExpenses ALL offices ki raw total hain.
    for (const e of officeExpenses) {
      officeExpenseTotal = officeExpenseTotal.plus(e.amount);
      office(e.bookingOfficeId).officeExpenses = office(e.bookingOfficeId).officeExpenses.plus(e.amount);
      profitOffice(e.bookingOfficeId).officeExpenses = profitOffice(e.bookingOfficeId).officeExpenses.plus(e.amount);
      totalProfit.officeExpenses = totalProfit.officeExpenses.plus(e.amount);
      if (officeType[e.bookingOfficeId] === "SALARY") {
        officeExpenseCompanyCost = officeExpenseCompanyCost.plus(e.amount);
        day(e.expenseDate).officeExpenses = day(e.expenseDate).officeExpenses.plus(e.amount);
      }
    }
    for (const item of remainingRows) {
      const received = item.payments.reduce((acc, payment) => acc.plus(payment.amount), new Prisma.Decimal(0));
      const remaining = Prisma.Decimal.max(dec(item.agreedAmount).minus(received), 0);
      if (remaining.isZero()) continue;
      remainingByOffice[item.bookingOfficeId] = (remainingByOffice[item.bookingOfficeId] || zero()).plus(remaining);
    }

    const profit = income
      .minus(commissions)
      .minus(caseExpenseTotal)
      .minus(salaryTotal)
      .minus(otherTotal)
      .minus(officeExpenseCompanyCost);

    // §W21: ?officeId= ho to top-level profit us office ka scoped bucket.
    const topProfit = scopeOfficeId ? profitOffice(scopeOfficeId) : totalProfit;

    return NextResponse.json({
      from: from ? formatDateOnly(from) : null,
      to: to ? formatDateOnly(to) : null,
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
      // §W21: admin profit breakdown (range ke mutabiq; range na ho to all-time).
      profit: profitJson(topProfit),
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
          // §W21: outstanding dues (non-CANCELLED cases, range-independent) +
          // usi office ka profit bucket.
          remaining: toNumber(remainingByOffice[o.id] || 0),
          profit: profitJson(profitOffice(o.id)),
        }))
        .filter((o) => o.income || o.commissions || o.salaries || o.officeExpenses || o.remaining),
    });
  } catch (error) {
    return serverError(error);
  }
}
