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
  // §W11.4 — members ke percents ka total (baqi 100 − percentSum admin ka hissa).
  percentSum: number;
  // §W11.4 — admin remainder: profit − member targets (floor 0). "ager kisi
  // partner office k share holder ka total 50% banta hai to baqi 50% admin ka hai".
  adminShare: number;
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

    // §W11.4 — percent total + admin remainder (explicit in summary).
    const percentSum = shares.reduce((acc, share) => acc.plus(dec(share.percent)), new Prisma.Decimal(0));
    const targetSum = shares.reduce((acc, share) => acc.plus(dec(share.target)), new Prisma.Decimal(0));
    const adminShare = Prisma.Decimal.max(profit.minus(targetSum), 0);

    return {
      received: toNumber(received),
      expenses: toNumber(expenses),
      officeExpenses: toNumber(officeExpenses),
      profit: toNumber(profit),
      percentSum: toNumber(percentSum),
      adminShare: toNumber(adminShare),
      shares,
    };
  }, { maxWait: 10000, timeout: 30000 });
}

// Wave 11 (§W11.4) — partner (PROFIT_SHARE) office: FIRST payment RECEIVED
// hote hi pool distributable ho jata hai. Ye wrapper payment-verify path se
// call hota hai; finalizeProfitShare idempotent hai (pehli dafa PROFIT_SHARE,
// baad mein ADJUSTMENT rows), is liye har received payment par dobara chal
// sakta hai. Kabhi throw nahi karta — payment flow kabhi fail nahi hona chahiye.
export async function autoDistributeOnPaymentReceived(
  caseId: string,
  session: AdminSession
): Promise<void> {
  try {
    const item = await prisma.case.findUnique({
      where: { id: caseId },
      select: {
        bookingOffice: { select: { type: true } },
        payments: { where: { status: "RECEIVED" }, select: { amount: true } },
      },
    });
    if (!item || item.bookingOffice.type !== "PROFIT_SHARE") return;
    // §W11.4 — skip when received is 0 (koi asal amount nahi aaya).
    const received = sum(item.payments.map((p) => p.amount));
    if (received.isZero()) return;
    const summary = await finalizeProfitShare(caseId, session);
    console.log(
      `[office] partner auto-distribute case=${caseId} profit=${summary.profit} admin=${summary.adminShare} shares=${summary.shares.length}`
    );
  } catch (error) {
    console.error("[office] autoDistributeOnPaymentReceived fail", error);
  }
}
