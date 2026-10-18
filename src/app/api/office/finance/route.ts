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
// alag hai: yahan net = received − deductionsTotal.
// §W21.2 expense buckets LEDGER-TRUTH se (double-count fix):
//   admin-borne expense = expense total − member-tagged EXPENSE debits
//   (remarks: `Office expense share [` / `Commission expense share [` /
//   `Commission expense [`). Member debits ka hissa admin members se recover
//   kar chuka hota hai — dobara minus karna double count hai. Is se har type
//   cover hota hai: PROFIT_SHARE office expenses ka sirf admin ka hissa
//   (100% − members%) minus hota hai; FIXED_COMMISSION flag=true expenses 0;
//   SALARY / flag=false expenses pooray. Company expenses sirf top-level
//   bucket mein (kisi office se attributed nahi).

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
  companyExpenses: Prisma.Decimal;
  commissions: Prisma.Decimal;
  profitShares: Prisma.Decimal;
  extraShares: Prisma.Decimal;
  salaries: Prisma.Decimal;
  bonuses: Prisma.Decimal;
  deptCommissions: Prisma.Decimal;
  adjustments: Prisma.Decimal;
  // §W21.4 — transparency: expense ka wo hissa jo MEMBERS ne apne shares se
  // diya (EXPENSE debits). Admin-borne = raw − memberShare. Sirf display ke
  // liye (modal subtext) — deductions mein shamil NAHI.
  caseExpensesMemberShare: Prisma.Decimal;
  officeExpensesMemberShare: Prisma.Decimal;
};

function newProfitBucket(): ProfitBucket {
  const zero = () => new Prisma.Decimal(0);
  return {
    received: zero(),
    caseExpenses: zero(),
    officeExpenses: zero(),
    companyExpenses: zero(),
    commissions: zero(),
    profitShares: zero(),
    extraShares: zero(),
    salaries: zero(),
    bonuses: zero(),
    deptCommissions: zero(),
    adjustments: zero(),
    caseExpensesMemberShare: zero(),
    officeExpensesMemberShare: zero(),
  };
}

function addLedgerToBucket(bucket: ProfitBucket, type: string, signed: Prisma.Decimal) {
  if (type === "COMMISSION_HALF" || type === "COMMISSION_FINAL" || type === "COMMISSION_ADJUST") {
    bucket.commissions = bucket.commissions.plus(signed);
  } else if (type === "PROFIT_SHARE" || type === "ADJUSTMENT") {
    // §W21.4: ADJUSTMENT entries SIRF finalizeProfitShare ke share re-calc
    // deltas hain (koi aur ADJUSTMENT creator nahi) — is liye wo profit
    // shares ka hi hissa hain. Gross credits + alag "adjustments" line
    // admin ke liye confusing thi ("− Rs −118,230" double-negative); ab
    // profitShares NET show hota hai (credits + adjustment deltas).
    bucket.profitShares = bucket.profitShares.plus(signed);
  } else if (type === "EXTRA_SHARE") {
    bucket.extraShares = bucket.extraShares.plus(signed);
  } else if (type === "BONUS") {
    bucket.bonuses = bucket.bonuses.plus(signed);
  } else if (type === "DEPT_COMMISSION") {
    bucket.deptCommissions = bucket.deptCommissions.plus(signed);
  }
}

function profitJson(bucket: ProfitBucket) {
  const deductionsTotal = bucket.caseExpenses
    .plus(bucket.officeExpenses)
    .plus(bucket.companyExpenses)
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
    companyExpenses: toNumber(bucket.companyExpenses),
    commissions: toNumber(bucket.commissions),
    profitShares: toNumber(bucket.profitShares),
    extraShares: toNumber(bucket.extraShares),
    salaries: toNumber(bucket.salaries),
    bonuses: toNumber(bucket.bonuses),
    deptCommissions: toNumber(bucket.deptCommissions),
    adjustments: toNumber(bucket.adjustments),
    caseExpensesMemberShare: toNumber(bucket.caseExpensesMemberShare),
    officeExpensesMemberShare: toNumber(bucket.officeExpensesMemberShare),
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
    const [payments, shares, expenseDebits, caseExpenses, salariesRaw, otherExpenses, officeExpenses, liabilities, offices, remainingRows] =
      await Promise.all([
        prisma.payment.findMany({
          where: { status: "RECEIVED", ...(inRange ? { paymentDate: inRange } : {}) },
          select: { amount: true, paymentDate: true, case: { select: { bookingOfficeId: true } } },
        }),
        prisma.ledgerEntry.findMany({
          where: { type: { in: PROFIT_LEDGER_TYPES }, ...(inRange ? { entryDate: inRange } : {}) },
          select: { amount: true, direction: true, entryDate: true, bookingOfficeId: true, type: true },
        }),
        // §W21.2 — member-tagged EXPENSE DEBITS (admin in se recover karta hai):
        // remarks prefixes → `Office expense share [` (PROFIT_SHARE W15.1),
        // `Commission expense share [` (FIXED_COMMISSION office flag=true W21),
        // `Commission expense [` (FIXED_COMMISSION case flag=true W21).
        prisma.ledgerEntry.findMany({
          where: { type: "EXPENSE", direction: "DEBIT", ...(inRange ? { entryDate: inRange } : {}) },
          select: { amount: true, bookingOfficeId: true, remarks: true },
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
    // §W21.2 — expense buckets LEDGER-TRUTH se (har office type ke liye ek hi
    // sahi rule, koi type-wise guessing nahi):
    //   admin-borne expense = expense table total − member-tagged EXPENSE debits
    // Member debits ka matlab: expense ka wo hissa members ke payout se kat chuka
    // (admin recover kar chuka) — usay admin profit se minus karna DOUBLE COUNT hai.
    //   - PROFIT_SHARE office expense: members apne % hisse ke debits dete hain;
    //     admin sirf APNA hissa (OE − member debits) bear karta hai.
    //   - FIXED_COMMISSION flag=true (case/office): poora recover → 0 admin cost.
    //   - FIXED_COMMISSION flag=false / SALARY: koi member debit nahi → poora admin cost.
    const caseExpRawByOffice: Record<string, Prisma.Decimal> = {};
    const officeExpRawByOffice: Record<string, Prisma.Decimal> = {};
    const caseExpShareByOffice: Record<string, Prisma.Decimal> = {};
    const officeExpShareByOffice: Record<string, Prisma.Decimal> = {};
    const addTo = (map: Record<string, Prisma.Decimal>, key: string, amount: Prisma.Decimal) => {
      map[key] = (map[key] || zero()).plus(amount);
    };
    for (const d of expenseDebits) {
      const remarks = d.remarks || "";
      if (remarks.startsWith("Commission expense [")) addTo(caseExpShareByOffice, d.bookingOfficeId, d.amount);
      else if (remarks.startsWith("Commission expense share [") || remarks.startsWith("Office expense share ["))
        addTo(officeExpShareByOffice, d.bookingOfficeId, d.amount);
      // untagged office-level debits (FIXED_COMMISSION flag=false) kisi member
      // ke payout se nahi kat-te → admin ka cost rehta hai → share maps mein nahi.
    }
    for (const e of caseExpenses) {
      caseExpenseTotal = caseExpenseTotal.plus(e.amount);
      day(e.expenseDate).caseExpenses = day(e.expenseDate).caseExpenses.plus(e.amount);
      addTo(caseExpRawByOffice, e.case.bookingOfficeId, e.amount);
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
      // §W21.1: company expenses admin profit ka hissa hain (kisi ek office se
      // attributed nahi — sirf top-level bucket mein).
      totalProfit.companyExpenses = totalProfit.companyExpenses.plus(e.amount);
    }
    // §N8: every OfficeExpense shows in the per-office breakdown; only SALARY
    // office expenses are company costs (others are already netted via ledger
    // debits / profit-share pool, so subtracting them would double count).
    // §W21: profit buckets mein officeExpenses ALL offices ki raw total hain.
    for (const e of officeExpenses) {
      officeExpenseTotal = officeExpenseTotal.plus(e.amount);
      office(e.bookingOfficeId).officeExpenses = office(e.bookingOfficeId).officeExpenses.plus(e.amount);
      addTo(officeExpRawByOffice, e.bookingOfficeId, e.amount);
      if (officeType[e.bookingOfficeId] === "SALARY") {
        officeExpenseCompanyCost = officeExpenseCompanyCost.plus(e.amount);
        day(e.expenseDate).officeExpenses = day(e.expenseDate).officeExpenses.plus(e.amount);
      }
    }
    // §W21.2 — ab buckets finalize: raw expense − member-tagged debits (floor 0).
    {
      const officeIds = new Set([
        ...Object.keys(caseExpRawByOffice),
        ...Object.keys(officeExpRawByOffice),
      ]);
      for (const officeId of officeIds) {
        const caseBorne = Prisma.Decimal.max(
          (caseExpRawByOffice[officeId] || zero()).minus(caseExpShareByOffice[officeId] || zero()),
          0
        );
        const officeBorne = Prisma.Decimal.max(
          (officeExpRawByOffice[officeId] || zero()).minus(officeExpShareByOffice[officeId] || zero()),
          0
        );
        profitOffice(officeId).caseExpenses = profitOffice(officeId).caseExpenses.plus(caseBorne);
        profitOffice(officeId).officeExpenses = profitOffice(officeId).officeExpenses.plus(officeBorne);
        // §W21.4 — member-borne hissa bhi record karo (modal transparency).
        profitOffice(officeId).caseExpensesMemberShare = profitOffice(officeId).caseExpensesMemberShare.plus(
          caseExpShareByOffice[officeId] || zero()
        );
        profitOffice(officeId).officeExpensesMemberShare = profitOffice(officeId).officeExpensesMemberShare.plus(
          officeExpShareByOffice[officeId] || zero()
        );
        totalProfit.caseExpenses = totalProfit.caseExpenses.plus(caseBorne);
        totalProfit.officeExpenses = totalProfit.officeExpenses.plus(officeBorne);
        totalProfit.caseExpensesMemberShare = totalProfit.caseExpensesMemberShare.plus(
          caseExpShareByOffice[officeId] || zero()
        );
        totalProfit.officeExpensesMemberShare = totalProfit.officeExpensesMemberShare.plus(
          officeExpShareByOffice[officeId] || zero()
        );
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
