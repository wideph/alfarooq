import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";
import { dec, round2, sum, toNumber } from "@/lib/office/money";
import { todayPakistan } from "@/lib/office/serializers";
import { refreshExpectedPrintingDate } from "@/lib/office/working-day";

// docs/office-module/03_BUSINESS_RULES.md BR1, BR3.
// Single entry point that keeps a case's money state consistent after any
// payment / commission / agreed-amount change. Idempotent: calling it twice in
// a row changes nothing the second time.

const COMMISSION_TYPES = ["COMMISSION_HALF", "COMMISSION_FINAL", "COMMISSION_ADJUST"];

export type CaseTotals = {
  received: number;
  remaining: number;
  extra: number;
  pendingCount: number;
  agreedAmount: number;
};

export function computeTotals(
  payments: Array<{ amount: Prisma.Decimal | number; status: string }>,
  agreedAmount: Prisma.Decimal | number
): CaseTotals {
  const received = sum(payments.filter((p) => p.status === "RECEIVED").map((p) => p.amount));
  const agreed = dec(agreedAmount);
  const remaining = Prisma.Decimal.max(agreed.minus(received), 0);
  const extra = Prisma.Decimal.max(received.minus(agreed), 0);
  return {
    received: toNumber(received),
    remaining: toNumber(remaining),
    extra: toNumber(extra),
    pendingCount: payments.filter((p) => p.status === "PENDING").length,
    agreedAmount: toNumber(agreed),
  };
}

function netOf(entries: Array<{ direction: string; amount: Prisma.Decimal }>) {
  return entries.reduce(
    (acc, entry) => (entry.direction === "CREDIT" ? acc.plus(entry.amount) : acc.minus(entry.amount)),
    new Prisma.Decimal(0)
  );
}

export type RecomputeResult = CaseTotals & {
  needsExtraDecision: number | null;
  status: string;
};

export async function recomputeCaseFinancials(
  caseId: string,
  session: AdminSession,
  options: { paymentId?: string | null } = {}
): Promise<RecomputeResult> {
  const result = await prisma.$transaction(async (tx) => {
    const item = await tx.case.findUnique({
      where: { id: caseId },
      include: {
        bookingOffice: { select: { id: true, type: true } },
        payments: { select: { id: true, amount: true, status: true } },
        ledger: {
          where: { type: { in: [...COMMISSION_TYPES, "EXTRA_SHARE"] } },
          select: { type: true, direction: true, amount: true },
        },
      },
    });
    if (!item) throw new Error("Case nahi mila");

    const totals = computeTotals(item.payments, item.agreedAmount);
    const received = dec(totals.received);
    const agreed = dec(item.agreedAmount);
    const extra = dec(totals.extra);
    const now = new Date();
    const entryDate = todayPakistan();
    const caseUpdate: Prisma.CaseUpdateInput = {};
    let needsExtraDecision: number | null = null;

    if (item.bookingOffice.type === "FIXED_COMMISSION") {
      const commission = dec(item.commissionAmount);
      const half = round2(commission.div(2));

      // BR3.5 target credited commission.
      let target = new Prisma.Decimal(0);
      if (received.greaterThan(0)) {
        target = agreed.greaterThan(0) && received.greaterThanOrEqualTo(agreed) ? commission : half;
      }

      const commissionEntries = item.ledger.filter((entry) => COMMISSION_TYPES.includes(entry.type));
      const current = netOf(commissionEntries);
      const diff = round2(target.minus(current));

      if (!diff.isZero()) {
        let type = "COMMISSION_ADJUST";
        if (diff.greaterThan(0) && current.isZero() && target.equals(half)) type = "COMMISSION_HALF";
        else if (diff.greaterThan(0) && target.equals(commission) && !current.isZero()) type = "COMMISSION_FINAL";
        else if (diff.greaterThan(0) && target.equals(commission) && current.isZero()) type = "COMMISSION_FINAL";

        await tx.ledgerEntry.create({
          data: {
            bookingOfficeId: item.bookingOfficeId,
            caseId,
            paymentId: options.paymentId || null,
            type,
            direction: diff.greaterThan(0) ? "CREDIT" : "DEBIT",
            amount: diff.abs(),
            entryDate,
            remarks:
              type === "COMMISSION_ADJUST"
                ? "Auto adjust (payment / commission change)"
                : type === "COMMISSION_HALF"
                  ? "First payment accepted"
                  : "Final payment accepted",
            createdById: session.adminId,
          },
        });
      }

      caseUpdate.commissionHalfCreditedAt =
        target.greaterThanOrEqualTo(half) && half.greaterThan(0)
          ? item.commissionHalfCreditedAt || now
          : null;
      caseUpdate.commissionFullCreditedAt =
        target.equals(commission) && commission.greaterThan(0)
          ? item.commissionFullCreditedAt || now
          : null;

      // BR3.6 extra amount share.
      if (extra.greaterThan(0) && item.extraSharePercent === null) {
        needsExtraDecision = toNumber(extra);
      } else {
        const percent = dec(item.extraSharePercent);
        const extraTarget = round2(extra.mul(percent).div(100));
        const extraEntries = item.ledger.filter((entry) => entry.type === "EXTRA_SHARE");
        const extraCurrent = netOf(extraEntries);
        const extraDiff = round2(extraTarget.minus(extraCurrent));
        if (!extraDiff.isZero()) {
          await tx.ledgerEntry.create({
            data: {
              bookingOfficeId: item.bookingOfficeId,
              caseId,
              paymentId: options.paymentId || null,
              type: "EXTRA_SHARE",
              direction: extraDiff.greaterThan(0) ? "CREDIT" : "DEBIT",
              amount: extraDiff.abs(),
              entryDate,
              remarks: extraCurrent.isZero()
                ? `Extra amount ${toNumber(extra)} ka ${toNumber(percent)}%`
                : "Extra share adjust",
              createdById: session.adminId,
            },
          });
        }
        caseUpdate.extraShareCreditedAt = extraTarget.greaterThan(0)
          ? item.extraShareCreditedAt || now
          : null;
      }
    }

    // Automatic forward-only status moves (02_ARCHITECTURE.md §6).
    let status = item.status;
    if (received.greaterThan(0) && (status === "NEW" || status === "PAYMENT_PENDING")) {
      status = "IN_PROCESS";
    } else if (received.isZero() && status === "NEW" && totals.pendingCount > 0) {
      status = "PAYMENT_PENDING";
    }
    if (status !== item.status) caseUpdate.status = status;

    if (Object.keys(caseUpdate).length > 0) {
      await tx.case.update({ where: { id: caseId }, data: caseUpdate });
    }

    return { ...totals, needsExtraDecision, status };
  });

  // Working-day lookup may call the AI, so it stays outside the transaction.
  await refreshExpectedPrintingDate(caseId);

  return result;
}
