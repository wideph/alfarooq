import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { dec, round2, sum, toNumber } from "@/lib/office/money";
import { formatDateOnly } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ memberId: string }> };

// Keep in sync with ../route.ts (route files cannot export shared constants).
const EARNING_TYPES = [
  "COMMISSION_HALF",
  "COMMISSION_FINAL",
  "COMMISSION_ADJUST",
  "EXTRA_SHARE",
  "PROFIT_SHARE",
  "ADJUSTMENT",
  "BONUS",
  // §W45: discount ka commission wala hissa (DEBIT) — earning se minus.
  "DISCOUNT",
];

// EXPENSE debit remarks ko display description tak strip karta hai:
//   "Office expense share [<expenseId>]: <desc>" → "<desc>"
//   "Office expense: <desc>"                    → "<desc>"
function expenseDescription(remarks: string | null): string {
  if (!remarks) return "";
  const tagged = /^Office expense share \[[^\]]+\]:\s*/.exec(remarks);
  if (tagged) return remarks.slice(tagged[0].length);
  const plain = /^Office expense:\s*/.exec(remarks);
  if (plain) return remarks.slice(plain[0].length);
  return remarks;
}

// §W12.3/W16 — Finance user detail: member info + har earning entry (type,
// case, date, amount, remarks) + har payout (date, method, amount, remarks) +
// EXPENSE share rows + totals/summary.
// DUE = earning − expenseShare − wasool (list route jaisa hi formula).
export async function GET(_request: Request, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { memberId } = await params;
  try {
    const member = await prisma.bookingOfficeMember.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        name: true,
        adminId: true,
        profitPercent: true,
        bookingOffice: { select: { id: true, name: true, type: true } },
      },
    });
    if (!member) return notFound("Member nahi mila");

    // admin / office:ledger:read → koi bhi member; warna booking_office SIRF
    // apna member record dekh sakta hai (dusre ka money data 403).
    if (!hasPermission(session, "office:ledger:read")) {
      const isOwn =
        session.role === "booking_office" && member.adminId === session.adminId;
      if (!isOwn) return forbidden();
    }

    const [earningRows, payoutRows, expenseRows] = await Promise.all([
      // Earning rows include ADJUSTMENT debits (downward re-calc) so the
      // detail list explains the net total; direction is shown per row.
      prisma.ledgerEntry.findMany({
        where: { memberId, type: { in: EARNING_TYPES } },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          type: true,
          direction: true,
          amount: true,
          entryDate: true,
          remarks: true,
          case: { select: { id: true, caseNumber: true } },
        },
      }),
      prisma.ledgerEntry.findMany({
        where: { memberId, direction: "DEBIT", type: "PAYOUT" },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        select: { id: true, amount: true, entryDate: true, method: true, remarks: true },
      }),
      // Office general expenses ka member-wise hissa (§W15.1 allocation rows).
      prisma.ledgerEntry.findMany({
        where: { memberId, direction: "DEBIT", type: "EXPENSE" },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        select: { id: true, amount: true, entryDate: true, remarks: true },
      }),
    ]);

    // Net earning = credits − debits (downward ADJUSTMENT rows).
    const totalEarning = earningRows.reduce(
      (acc, row) => (row.direction === "CREDIT" ? acc.plus(row.amount) : acc.minus(row.amount)),
      new Prisma.Decimal(0)
    );
    const expenseShare = sum(expenseRows.map((row) => row.amount));
    const wasool = sum(payoutRows.map((row) => row.amount));
    const due = totalEarning.minus(expenseShare).minus(wasool);

    // §W40 — PROFIT_SHARE office: owner ka formula (all-time) —
    //   office profit = received − office exp − case exp − department exp − other
    //   aap ka hissa  = office profit × aap ki %
    // Account (earning − office expense share) isi ke barabar hona chahiye.
    let officeProfit: Record<string, number> | null = null;
    if (member.bookingOffice.type === "PROFIT_SHARE") {
      const officeId = member.bookingOffice.id;
      const [received, caseExp, officeExp, dept, salaries] = await Promise.all([
        prisma.payment.aggregate({ where: { status: "RECEIVED", case: { bookingOfficeId: officeId } }, _sum: { amount: true } }),
        prisma.caseExpense.aggregate({ where: { case: { bookingOfficeId: officeId } }, _sum: { amount: true } }),
        prisma.officeExpense.aggregate({ where: { bookingOfficeId: officeId }, _sum: { amount: true } }),
        prisma.ledgerEntry.groupBy({ by: ["direction"], where: { bookingOfficeId: officeId, type: "DEPT_COMMISSION" }, _sum: { amount: true } }),
        prisma.salaryEntry.aggregate({ where: { bookingOfficeId: officeId }, _sum: { amount: true } }),
      ]);
      const deptNet = dept.reduce(
        (acc, row) => (row.direction === "CREDIT" ? acc.plus(row._sum.amount ?? 0) : acc.minus(row._sum.amount ?? 0)),
        new Prisma.Decimal(0)
      );
      const profit = dec(received._sum.amount ?? 0)
        .minus(dec(officeExp._sum.amount ?? 0))
        .minus(dec(caseExp._sum.amount ?? 0))
        .minus(deptNet)
        .minus(dec(salaries._sum.amount ?? 0));
      const percent = dec(member.profitPercent);
      officeProfit = {
        received: toNumber(dec(received._sum.amount ?? 0)),
        officeExpenses: toNumber(dec(officeExp._sum.amount ?? 0)),
        caseExpenses: toNumber(dec(caseExp._sum.amount ?? 0)),
        deptCommissions: toNumber(deptNet),
        otherExpenses: toNumber(dec(salaries._sum.amount ?? 0)),
        officeProfit: toNumber(profit),
        percent: toNumber(percent),
        share: toNumber(round2(profit.mul(percent).div(100))),
        // §W45: bonus / discount formula ke bahar hain — muqable mein sirf
        // profit share + adjustment − expense share.
        account: toNumber(
          earningRows
            .filter((row) => row.type !== "BONUS" && row.type !== "DISCOUNT")
            .reduce((acc, row) => (row.direction === "CREDIT" ? acc.plus(row.amount) : acc.minus(row.amount)), new Prisma.Decimal(0))
            .minus(expenseShare)
        ),
      };
    }

    return NextResponse.json({
      member: {
        memberId: member.id,
        name: member.name,
        adminId: member.adminId,
        profitPercent: toNumber(member.profitPercent),
        officeId: member.bookingOffice.id,
        officeName: member.bookingOffice.name,
        officeType: member.bookingOffice.type,
      },
      earnings: earningRows.map((row) => ({
        id: row.id,
        date: formatDateOnly(row.entryDate),
        type: row.type,
        direction: row.direction,
        amount: toNumber(row.amount),
        caseId: row.case?.id ?? null,
        caseNumber: row.case?.caseNumber ?? null,
        remarks: row.remarks,
      })),
      payouts: payoutRows.map((row) => ({
        id: row.id,
        date: formatDateOnly(row.entryDate),
        method: row.method,
        amount: toNumber(row.amount),
        remarks: row.remarks,
      })),
      expenses: expenseRows.map((row) => ({
        id: row.id,
        entryDate: formatDateOnly(row.entryDate),
        description: expenseDescription(row.remarks),
        amount: toNumber(row.amount),
      })),
      totals: {
        totalEarning: toNumber(totalEarning),
        wasool: toNumber(wasool),
        due: toNumber(due),
      },
      officeProfit,
      summary: {
        earning: toNumber(totalEarning),
        expenseShare: toNumber(expenseShare),
        wasool: toNumber(wasool),
        due: toNumber(due),
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
