import { Prisma } from "@prisma/client";
import { dec, round2 } from "@/lib/office/money";

// §W56 — commission office: extra payment (received − agreed) ka faisla
// TUKRON (ExtraShareTranche) mein. Har tukra: extraAmount (kitni extra raqam
// tay hui), shareAmount (us mein se office ko Rs), receivedAt (faisle ke waqt
// kul received).
//   - Tay shuda tukra baad mein dobara nahi khulta — extra service se agreed
//     barhe to bhi office ka hissa wahi (owner: "pehli settle shuda amount
//     dubara sy consider nahi ki jay gi").
//   - §W57: payment wapas / kam ho (received < receivedAt, yaani valid < 1)
//     ya admin asal agreed badle → wo tukra (aur baad wale) recompute mein
//     PERMANENT delete; nayi extra par naya faisla. valid = clamp((received −
//     (receivedAt − extraAmount)) / extraAmount, 0, 1).
//   - Baqi faisla = extra − (tay shuda × valid). Misaal: 55,000 case, 60,000
//     aaye → 5,000 tay. 10,000 service, 13,000 aur aaye → received 73,000,
//     agreed 65,000, extra 8,000 − 5,000 = sirf 3,000 ka naya faisla.

export type TrancheLike = {
  extraAmount: Prisma.Decimal | number | string;
  shareAmount: Prisma.Decimal | number | string;
  receivedAt: Prisma.Decimal | number | string;
};

export function trancheValidFraction(tranche: TrancheLike, received: Prisma.Decimal): Prisma.Decimal {
  const amount = dec(tranche.extraAmount);
  if (!amount.greaterThan(0)) return dec(0);
  const floor = dec(tranche.receivedAt).minus(amount);
  const fraction = received.minus(floor).div(amount);
  return Prisma.Decimal.min(Prisma.Decimal.max(fraction, 0), 1);
}

export function extraShareState(input: {
  received: Prisma.Decimal | number;
  extra: Prisma.Decimal | number;
  tranches: TrancheLike[];
}) {
  const received = dec(input.received);
  let covered = dec(0);
  let target = dec(0);
  for (const tranche of input.tranches) {
    const fraction = trancheValidFraction(tranche, received);
    covered = covered.plus(dec(tranche.extraAmount).mul(fraction));
    target = target.plus(round2(dec(tranche.shareAmount).mul(fraction)));
  }
  const unsettled = round2(Prisma.Decimal.max(dec(input.extra).minus(covered), 0));
  return { covered: round2(covered), target: round2(target), unsettled };
}

// Faisla → office ka hissa (Rs). PERCENT: extra × % ; AMOUNT: seedha Rs (0 se
// extra tak). null = ghalat input.
export function decisionShare(
  extraAmount: Prisma.Decimal,
  decision: { mode: string; value: unknown }
): { share: Prisma.Decimal; percent: Prisma.Decimal | null; mode: "PERCENT" | "AMOUNT" } | null {
  const text = typeof decision.value === "number" ? String(decision.value) : String(decision.value ?? "").trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = new Prisma.Decimal(text);
  if (decision.mode === "PERCENT") {
    if (value.greaterThan(100)) return null;
    return { share: round2(extraAmount.mul(value).div(100)), percent: value, mode: "PERCENT" };
  }
  if (decision.mode === "AMOUNT") {
    if (value.greaterThan(extraAmount)) return null;
    return { share: round2(value), percent: null, mode: "AMOUNT" };
  }
  return null;
}

export class ExtraDecisionError extends Error {}

// §W56 — admin ka extra faisla (commission route + tests isi ko chalate hain).
// trancheId na ho → abhi ki BAQI extra ka naya tukra; ho → us tukre ka hissa
// badalna. Ek transaction; caller baad mein recomputeCaseFinancials chalata hai.
export async function applyExtraDecision(
  caseId: string,
  actorId: string,
  decision: { mode?: unknown; value?: unknown; trancheId?: unknown }
) {
  const { prisma } = await import("@/lib/prisma");
  const { computeTotals } = await import("@/lib/office/commission");
  return prisma.$transaction(async (tx) => {
    const item = await tx.case.findUnique({
      where: { id: caseId },
      select: {
        agreedAmount: true,
        payments: { select: { amount: true, status: true } },
        extraTranches: { orderBy: { createdAt: "asc" } },
      },
    });
    if (!item) throw new ExtraDecisionError("Case nahi mila");
    const mode = String(decision.mode || "").toUpperCase();
    const trancheId = typeof decision.trancheId === "string" ? decision.trancheId : "";
    const totals = computeTotals(item.payments, item.agreedAmount);
    const received = dec(totals.received);

    let log: Record<string, unknown>;
    if (trancheId) {
      const tranche = item.extraTranches.find((row) => row.id === trancheId);
      if (!tranche) throw new ExtraDecisionError("Ye extra faisla is case ka nahi");
      const share = decisionShare(tranche.extraAmount, { mode, value: decision.value });
      if (!share) {
        throw new ExtraDecisionError(mode === "AMOUNT" ? `Raqam 0 se ${tranche.extraAmount.toString()} tak` : "Percentage 0 se 100");
      }
      await tx.extraShareTranche.update({
        where: { id: tranche.id },
        data: { shareAmount: share.share, mode: share.mode, percent: share.percent },
      });
      log = { trancheId, extraAmount: tranche.extraAmount, before: tranche.shareAmount, after: share.share, mode };
    } else {
      const state = extraShareState({ received, extra: totals.extra, tranches: item.extraTranches });
      if (!state.unsettled.greaterThan(0)) throw new ExtraDecisionError("Abhi koi nayi extra raqam tay karne ko nahi");
      const share = decisionShare(state.unsettled, { mode, value: decision.value });
      if (!share) {
        throw new ExtraDecisionError(mode === "AMOUNT" ? `Raqam 0 se ${state.unsettled.toString()} tak` : "Percentage 0 se 100");
      }
      const created = await tx.extraShareTranche.create({
        data: {
          caseId,
          extraAmount: state.unsettled,
          shareAmount: share.share,
          mode: share.mode,
          percent: share.percent,
          receivedAt: received,
          decidedById: actorId,
        },
      });
      log = { trancheId: created.id, extraAmount: state.unsettled, share: share.share, mode };
    }
    // §W57: Case.extraSharePercent ab kabhi nahi likha jata — faisla SIRF
    // tukron mein (purana % case par reh kar baad mein dobara zinda hota tha).
    return log;
  }, { maxWait: 10000, timeout: 30000 });
}
