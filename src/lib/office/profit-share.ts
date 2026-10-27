import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";
import { dec, round2, sum, toNumber } from "@/lib/office/money";
import { todayPakistan } from "@/lib/office/serializers";

// docs/office-module/03_BUSINESS_RULES.md BR4 — PROFIT_SHARE offices.
// Re-running creates ADJUSTMENT rows for any difference (never edits old rows).
//
// §W15.1 (06_NEW_REQUIREMENTS.md) — office general expenses pool mein SHAAMIL
// NAHI (warna N cases par N-times deduction). Office expense per-member EXPENSE
// DEBIT ledger rows se har member ke account se us ke share ke mutabiq minus
// hota hai (office-expenses route) — natija wahi: member ka hissa office
// expense ke baad.
//
// §W40 — owner ka formula (office level):
//   Profit = received − office expenses − case expenses − department expenses
//   aur ye profit admin + members mein un ki percentage ke mutabiq.
// Case pool = received − case expenses − is case ki DEPT_COMMISSION (printing /
// attestation / courier) — pehle department commission pool se nahi katti thi
// (poori admin ke hisse se jati thi). Pool 0 par clamp NAHI (case ka nuqsan
// bhi sab mein bant-ta hai, warna office formula se farq). Har paisay wale
// badlaav (payment create / verify / status / amount / delete, case expense,
// department commission) ke baad `syncProfitShare` — pehle sirf naye RECEIVED
// par chalta tha, is liye payment hatne / badalne par shares purane rehte the.

const SHARE_TYPES = ["PROFIT_SHARE", "ADJUSTMENT"];
const DEPT_COMMISSION_TYPE = "DEPT_COMMISSION";

export type ProfitShareSummary = {
  received: number;
  expenses: number;
  // §W40 — is case ki department commissions (pool se minus).
  deptCommissions: number;
  // §W15.1 — office expenses pool se bahar; field response-compat ke liye
  // hai aur hamesha 0 hai (per-member EXPENSE debits ledger mein hain).
  officeExpenses: number;
  profit: number;
  // §W11.4 — members ke percents ka total (baqi 100 − percentSum admin ka hissa).
  percentSum: number;
  // §W11.4 — admin remainder: profit − member targets.
  adminShare: number;
  shares: Array<{ memberId: string; name: string; percent: number; target: number; delta: number }>;
};

async function distributeProfitShare(caseId: string, actorId: string): Promise<ProfitShareSummary | null> {
  return prisma.$transaction(async (tx) => {
    const item = await tx.case.findUnique({
      where: { id: caseId },
      include: {
        bookingOffice: {
          select: {
            id: true,
            type: true,
            // §W12.6 — ALL members (not just active): the snapshot may reference
            // a member who is now inactive; their share is still honored.
            members: true,
          },
        },
        payments: { where: { status: "RECEIVED" }, select: { amount: true } },
        expenses: { select: { amount: true } },
        ledger: {
          where: { type: { in: [...SHARE_TYPES, DEPT_COMMISSION_TYPE] } },
          select: { memberId: true, direction: true, amount: true, type: true },
        },
      },
    });
    if (!item) throw new Error("Case nahi mila");
    if (item.bookingOffice.type !== "PROFIT_SHARE") throw new Error("Ye profit-share office ka case nahi hai");

    const signed = (entry: { direction: string; amount: Prisma.Decimal }) =>
      entry.direction === "CREDIT" ? entry.amount : entry.amount.neg();
    const shareRows = item.ledger.filter((entry) => SHARE_TYPES.includes(entry.type));
    const received = sum(item.payments.map((p) => p.amount));
    const expenses = sum(item.expenses.map((e) => e.amount));
    const deptCommissions = sum(item.ledger.filter((entry) => entry.type === DEPT_COMMISSION_TYPE).map(signed));
    const profit = received.minus(expenses).minus(deptCommissions);

    // Abhi tak koi paisa / kharcha nahi aur koi share bana hi nahi → kuch nahi
    // (snapshot bhi pehli asal distribution par banta hai).
    if (shareRows.length === 0 && received.isZero() && expenses.isZero() && deptCommissions.isZero()) return null;

    const entryDate = todayPakistan();

    // §W12.6 — profitShareSnapshot (Json {memberId: percent}): pehli distribution
    // par members ke percents freeze ho jate hain. Admin panel se profitPercent
    // badalne se PURANE cases ka distribution nahi badalta — snapshot present ho
    // to wahi percents use hote hain (inactive member bhi honor hota hai).
    // Snapshot absent ho to current ACTIVE members ke percents se ban kar isi
    // transaction mein case par save ho jata hai.
    let snapshot: Record<string, number>;
    const existing = item.profitShareSnapshot;
    if (existing && typeof existing === "object" && !Array.isArray(existing)) {
      snapshot = existing as Record<string, number>;
    } else {
      snapshot = {};
      for (const member of item.bookingOffice.members) {
        if (!member.isActive) continue;
        snapshot[member.id] = toNumber(dec(member.profitPercent));
      }
    }
    const memberById = new Map(item.bookingOffice.members.map((member) => [member.id, member]));

    const shares: ProfitShareSummary["shares"] = [];
    // Members not in the snapshot get target 0 (skipped entirely).
    for (const [memberId, percentValue] of Object.entries(snapshot)) {
      const percent = dec(percentValue);
      const target = round2(profit.mul(percent).div(100));
      const current = shareRows
        .filter((entry) => entry.memberId === memberId)
        .reduce((acc, entry) => acc.plus(signed(entry)), new Prisma.Decimal(0));
      if (percent.isZero() && current.isZero()) continue;
      const delta = round2(target.minus(current));
      if (!delta.isZero()) {
        await tx.ledgerEntry.create({
          data: {
            bookingOfficeId: item.bookingOfficeId,
            memberId,
            caseId,
            type: current.isZero() ? "PROFIT_SHARE" : "ADJUSTMENT",
            direction: delta.greaterThan(0) ? "CREDIT" : "DEBIT",
            amount: delta.abs(),
            entryDate,
            remarks: current.isZero()
              ? `Profit ${toNumber(profit)} ka ${toNumber(percent)}%`
              : `Profit share re-calculate (profit ${toNumber(profit)} ka ${toNumber(percent)}%)`,
            createdById: actorId,
          },
        });
      }
      shares.push({
        memberId,
        name: memberById.get(memberId)?.name ?? "Member",
        percent: toNumber(percent),
        target: toNumber(target),
        delta: toNumber(delta),
      });
    }

    await tx.case.update({
      where: { id: caseId },
      data: {
        profitFinalizedAt: new Date(),
        // §W12.6 — first distribution writes the snapshot (same transaction).
        ...(item.profitShareSnapshot ? {} : { profitShareSnapshot: snapshot }),
      },
    });

    // §W11.4 — percent total + admin remainder (explicit in summary).
    const percentSum = shares.reduce((acc, share) => acc.plus(dec(share.percent)), new Prisma.Decimal(0));
    const targetSum = shares.reduce((acc, share) => acc.plus(dec(share.target)), new Prisma.Decimal(0));

    return {
      received: toNumber(received),
      expenses: toNumber(expenses),
      deptCommissions: toNumber(deptCommissions),
      officeExpenses: 0,
      profit: toNumber(profit),
      percentSum: toNumber(percentSum),
      adminShare: toNumber(profit.minus(targetSum)),
      shares,
    };
  }, { maxWait: 10000, timeout: 30000 });
}

// BR4.3 / 4.4 — manual "profit share calculate" (POST /cases/[id]/profit).
export async function finalizeProfitShare(caseId: string, session: AdminSession): Promise<ProfitShareSummary> {
  const summary = await distributeProfitShare(caseId, session.adminId);
  if (!summary) throw new Error("Abhi koi payment receive nahi hui");
  return summary;
}

// §W40 — har paisay wale badlaav ke baad PROFIT_SHARE case ka hissa dobara
// (idempotent: sirf farq ki ADJUSTMENT row). Dusre office types par kuch nahi.
// Kabhi throw nahi karta — payment / expense / upload flow kabhi fail na ho.
export async function syncProfitShare(caseId: string | null | undefined, actorId: string): Promise<void> {
  if (!caseId) return;
  try {
    const item = await prisma.case.findUnique({
      where: { id: caseId },
      select: { bookingOffice: { select: { type: true } } },
    });
    if (!item || item.bookingOffice.type !== "PROFIT_SHARE") return;
    const summary = await distributeProfitShare(caseId, actorId);
    if (summary) {
      console.log(
        `[office] profit share sync case=${caseId} profit=${summary.profit} admin=${summary.adminShare} shares=${summary.shares.length}`
      );
    }
  } catch (error) {
    console.error("[office] syncProfitShare fail", caseId, error);
  }
}
