import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";
import { dec, round2, sum, toNumber } from "@/lib/office/money";
import { todayPakistan } from "@/lib/office/serializers";

// docs/office-module/03_BUSINESS_RULES.md BR4 — PROFIT_SHARE offices.
// profit = received − case expenses; each active member gets profitPercent %.
// Re-running creates ADJUSTMENT rows for any difference (never edits old rows).

const SHARE_TYPES = ["PROFIT_SHARE", "ADJUSTMENT"];

export type ProfitShareSummary = {
  received: number;
  expenses: number;
  profit: number;
  shares: Array<{ memberId: string; name: string; percent: number; target: number; delta: number }>;
};

export async function finalizeProfitShare(caseId: string, session: AdminSession): Promise<ProfitShareSummary> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.case.findUnique({
      where: { id: caseId },
      include: {
        bookingOffice: {
          select: { id: true, type: true, members: { where: { isActive: true } } },
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
    const profit = Prisma.Decimal.max(received.minus(expenses), 0);
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
      profit: toNumber(profit),
      shares,
    };
  });
}
