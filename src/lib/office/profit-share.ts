import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";
import { dec, round2, sum, toNumber } from "@/lib/office/money";
import { todayPakistan } from "@/lib/office/serializers";

// docs/office-module/03_BUSINESS_RULES.md BR4 — PROFIT_SHARE offices.
// profit = received − case expenses; each active member gets profitPercent %.
// Re-running creates ADJUSTMENT rows for any difference (never edits old rows).
//
// §N8 (06_NEW_REQUIREMENTS.md): partner (profit-share) office ke tamam general
// office expenses (OfficeExpense) pool se PEHLE minus hote hain, phir profit
// members ke profitPercent ke hisaab se bant-ta hai:
//   profit pool = received − case expenses − office expenses
// Office expenses are office-level (not per case), so the pool can never be
// negative per case — it is floored at 0. The EXPENSE ledger debit written by
// /api/office/office-expenses is separate from these share rows; re-finalize
// stays idempotent because only PROFIT_SHARE/ADJUSTMENT rows are compared.

const SHARE_TYPES = ["PROFIT_SHARE", "ADJUSTMENT"];

export type ProfitShareSummary = {
  received: number;
  expenses: number;
  officeExpenses: number;
  profit: number;
  shares: Array<{ memberId: string; name: string; percent: number; target: number; delta: number }>;
};

export async function finalizeProfitShare(caseId: string, session: AdminSession): Promise<ProfitShareSummary> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.case.findUnique({
      where: { id: caseId },
      include: {
        bookingOffice: {
          select: {
            id: true,
            type: true,
            members: { where: { isActive: true } },
            // §N8 — partner office general expenses, deducted from the pool.
            expenses: { select: { amount: true } },
          },
        },
        payments: { where: { status: "RECEIVED" }, select: { amount: true } },
        expenses: { select: { amount: true } },
        ledger: {
          where: { type: { in: SHARE_TYPES } },
          select: { memberId: true, direction: true, amount: true },
        },
      },
    });
    if (!item) throw new Error("Case nahi mila");
    if (item.bookingOffice.type !== "PROFIT_SHARE") throw new Error("Ye profit-share office ka case nahi hai");

    const received = sum(item.payments.map((p) => p.amount));
    if (received.isZero()) throw new Error("Abhi koi payment receive nahi hui");
    const expenses = sum(item.expenses.map((e) => e.amount));
    const officeExpenses = sum(item.bookingOffice.expenses.map((e) => e.amount));
    // §N8: pool = received − case expenses − office expenses (floor 0).
    const profit = Prisma.Decimal.max(received.minus(expenses).minus(officeExpenses), 0);
    const entryDate = todayPakistan();

    const shares: ProfitShareSummary["shares"] = [];
    for (const member of item.bookingOffice.members) {
      const percent = dec(member.profitPercent);
      if (percent.isZero()) continue;
      const target = round2(profit.mul(percent).div(100));
      const current = item.ledger
        .filter((entry) => entry.memberId === member.id)
        .reduce(
          (acc, entry) => (entry.direction === "CREDIT" ? acc.plus(entry.amount) : acc.minus(entry.amount)),
          new Prisma.Decimal(0)
        );
      const delta = round2(target.minus(current));
      if (!delta.isZero()) {
        await tx.ledgerEntry.create({
          data: {
            bookingOfficeId: item.bookingOfficeId,
            memberId: member.id,
            caseId,
            type: current.isZero() ? "PROFIT_SHARE" : "ADJUSTMENT",
            direction: delta.greaterThan(0) ? "CREDIT" : "DEBIT",
            amount: delta.abs(),
            entryDate,
            remarks: current.isZero()
              ? `Profit ${toNumber(profit)} ka ${toNumber(percent)}%`
              : "Profit share re-calculate",
            createdById: session.adminId,
          },
        });
      }
      shares.push({
        memberId: member.id,
        name: member.name,
        percent: toNumber(percent),
        target: toNumber(target),
        delta: toNumber(delta),
      });
    }

    await tx.case.update({ where: { id: caseId }, data: { profitFinalizedAt: new Date() } });

    return {
      received: toNumber(received),
      expenses: toNumber(expenses),
      officeExpenses: toNumber(officeExpenses),
      profit: toNumber(profit),
      shares,
    };
  }, { maxWait: 10000, timeout: 30000 });
}
