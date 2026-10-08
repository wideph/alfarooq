/**
 * §W12.6 — Retroactive finance recompute (run ONCE against live DB after deploy).
 *
 *  (a) Every FIXED_COMMISSION case: recomputeCaseFinancials (code formula
 *      corrections apply retroactively via idempotent COMMISSION_ADJUST rows).
 *  (b) Backfill: commission / extra-share ledger entries with memberId=NULL and
 *      caseId set get memberId = the member of that case's booking office whose
 *      adminId = case.createdByAdminId (null when the creator is not a member).
 *  (c) Every PROFIT_SHARE case: clear profitShareSnapshot, then
 *      finalizeProfitShare (rewrites the snapshot with current percents and
 *      applies the corrected formula via idempotent PROFIT_SHARE/ADJUSTMENT rows).
 *
 * Run: DATABASE_URL=... npx tsx scripts/recompute-finance.ts
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";
import { recomputeCaseFinancials } from "@/lib/office/commission";
import { finalizeProfitShare } from "@/lib/office/profit-share";

// System session — ledger rows created by this script carry createdById
// "system-recompute" so they are distinguishable from human actions.
const SYSTEM_SESSION = {
  adminId: "system-recompute",
  email: "system-recompute@local",
  name: "System Recompute",
  role: "admin",
  permissions: [],
} as AdminSession;

const BACKFILL_TYPES = ["COMMISSION_HALF", "COMMISSION_FINAL", "COMMISSION_ADJUST", "EXTRA_SHARE"];

async function main() {
  // (a) FIXED_COMMISSION cases — recompute financials.
  const fixedCases = await prisma.case.findMany({
    where: { bookingOffice: { type: "FIXED_COMMISSION" } },
    select: { id: true, caseNumber: true },
    orderBy: { caseNumber: "asc" },
  });
  console.log(`[recompute] FIXED_COMMISSION cases: ${fixedCases.length}`);
  for (const item of fixedCases) {
    try {
      const result = await recomputeCaseFinancials(item.id, SYSTEM_SESSION);
      console.log(
        `[recompute] case ${item.caseNumber}: received=${result.received} remaining=${result.remaining} status=${result.status}`
      );
    } catch (error) {
      console.error(`[recompute] case ${item.caseNumber} FAIL`, error);
    }
  }

  // (b) Backfill memberId on old commission / extra-share ledger entries.
  const orphans = await prisma.ledgerEntry.findMany({
    where: { type: { in: BACKFILL_TYPES }, memberId: null, caseId: { not: null } },
    select: {
      id: true,
      case: {
        select: {
          caseNumber: true,
          createdByAdminId: true,
          bookingOffice: { select: { members: { select: { id: true, adminId: true } } } },
        },
      },
    },
  });
  console.log(`[recompute] memberId backfill candidates: ${orphans.length}`);
  // Group entry ids by resolved memberId, then one updateMany per member.
  const byMember = new Map<string, string[]>();
  let skipped = 0;
  for (const entry of orphans) {
    if (!entry.case) continue;
    const memberId =
      entry.case.bookingOffice.members.find((member) => member.adminId === entry.case?.createdByAdminId)?.id ?? null;
    if (!memberId) {
      skipped += 1;
      continue;
    }
    const list = byMember.get(memberId) ?? [];
    list.push(entry.id);
    byMember.set(memberId, list);
  }
  for (const [memberId, ids] of byMember) {
    const result = await prisma.ledgerEntry.updateMany({
      where: { id: { in: ids }, memberId: null },
      data: { memberId },
    });
    console.log(`[recompute] backfill member=${memberId}: ${result.count} entries`);
  }
  if (skipped) console.log(`[recompute] backfill skipped (creator member nahi mila): ${skipped} entries`);

  // (c) PROFIT_SHARE cases — clear snapshot, then finalize (rewrites snapshot).
  const profitCases = await prisma.case.findMany({
    where: { bookingOffice: { type: "PROFIT_SHARE" } },
    select: { id: true, caseNumber: true },
    orderBy: { caseNumber: "asc" },
  });
  console.log(`[recompute] PROFIT_SHARE cases: ${profitCases.length}`);
  for (const item of profitCases) {
    try {
      await prisma.case.update({ where: { id: item.id }, data: { profitShareSnapshot: Prisma.JsonNull } });
      const summary = await finalizeProfitShare(item.id, SYSTEM_SESSION);
      console.log(
        `[recompute] case ${item.caseNumber}: profit=${summary.profit} adminShare=${summary.adminShare} shares=${summary.shares.length}`
      );
    } catch (error) {
      // e.g. koi payment receive nahi hui — skip, case untouched except snapshot clear.
      console.error(`[recompute] case ${item.caseNumber} FAIL`, error);
    }
  }

  console.log("[recompute] done");
}

main()
  .catch((error) => {
    console.error("[recompute] fatal", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
