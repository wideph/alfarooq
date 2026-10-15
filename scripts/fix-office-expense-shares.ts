/**
 * §W15.2 — Retroactive office expense share fix (run ONCE against live DB).
 *
 * Old (wrong) behavior: (a) finalizeProfitShare subtracted ALL office expenses
 * from EVERY case pool (N cases → N-times deduction), and (b) the EXPENSE
 * ledger debit was office-level (memberId null) so per-member dues never moved.
 *
 * This script (idempotent — remarks tags prevent double work):
 *  1. Deletes old-format office-level EXPENSE DEBIT ledger rows of PROFIT_SHARE
 *     offices (type=EXPENSE, direction=DEBIT, remarks LIKE 'Office expense:%' —
 *     NOT 'Office expense share:%').
 *  2. For every existing OfficeExpense of a PROFIT_SHARE office: creates
 *     per-member allocations (percent split or full-to-memberId) with remarks
 *     `Office expense share [<expenseId>]: <desc>` — skips if already allocated.
 *  3. Re-finalizes every PROFIT_SHARE case (new pool = received − case expenses
 *     ONLY) → ADJUSTMENT rows restore correct member credits (snapshots keep
 *     frozen percents).
 *
 * Run: DATABASE_URL=... npx tsx scripts/fix-office-expense-shares.ts
 */
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";
import { round2 } from "@/lib/office/money";
import { finalizeProfitShare } from "@/lib/office/profit-share";

// System session — ledger rows created by this script carry createdById
// "system-expense-shares" so they are distinguishable from human actions.
const SYSTEM_SESSION = {
  adminId: "system-expense-shares",
  email: "system-expense-shares@local",
  name: "System Expense Shares",
  role: "admin",
  permissions: [],
} as AdminSession;

async function main() {
  const profitOffices = await prisma.bookingOffice.findMany({
    where: { type: "PROFIT_SHARE" },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const officeIds = profitOffices.map((office) => office.id);
  console.log(`[fix-shares] PROFIT_SHARE offices: ${profitOffices.length}`);

  // ── Step 1: delete old-format office-level EXPENSE DEBIT rows. ──────────
  console.log("[fix-shares] step 1: purane office-level EXPENSE debit rows delete");
  const deleted = await prisma.ledgerEntry.deleteMany({
    where: {
      bookingOfficeId: { in: officeIds },
      type: "EXPENSE",
      direction: "DEBIT",
      remarks: { startsWith: "Office expense:", not: { startsWith: "Office expense share:" } },
    },
  });
  console.log(`[fix-shares] step 1 done: ${deleted.count} rows delete hui`);

  // ── Step 2: per-member allocations for every existing OfficeExpense. ────
  console.log("[fix-shares] step 2: tamam OfficeExpense rows ki per-member allocation");
  let allocated = 0;
  let skipped = 0;
  let failed = 0;
  for (const office of profitOffices) {
    try {
      const expenses = await prisma.officeExpense.findMany({
        where: { bookingOfficeId: office.id },
        orderBy: [{ expenseDate: "asc" }, { createdAt: "asc" }],
      });
      const members = await prisma.bookingOfficeMember.findMany({
        where: { bookingOfficeId: office.id, isActive: true, profitPercent: { gt: 0 } },
        select: { id: true, profitPercent: true },
      });
      console.log(`[fix-shares] office ${office.name}: ${expenses.length} expenses, ${members.length} active members`);
      for (const expense of expenses) {
        try {
          const tag = `Office expense share [${expense.id}]:`;
          const existing = await prisma.ledgerEntry.findFirst({
            where: { bookingOfficeId: office.id, type: "EXPENSE", remarks: { startsWith: tag } },
            select: { id: true },
          });
          if (existing) {
            skipped += 1;
            continue;
          }
          const remarks = `${tag} ${expense.description}`;
          await prisma.$transaction(async (tx) => {
            if (expense.memberId) {
              // memberId set → poora amount sirf us member par.
              await tx.ledgerEntry.create({
                data: {
                  bookingOfficeId: office.id,
                  memberId: expense.memberId,
                  type: "EXPENSE",
                  direction: "DEBIT",
                  amount: expense.amount,
                  entryDate: expense.expenseDate,
                  remarks,
                  createdById: SYSTEM_SESSION.adminId,
                },
              });
            } else {
              for (const member of members) {
                const share = round2(expense.amount.mul(member.profitPercent).div(100));
                if (share.isZero()) continue;
                await tx.ledgerEntry.create({
                  data: {
                    bookingOfficeId: office.id,
                    memberId: member.id,
                    type: "EXPENSE",
                    direction: "DEBIT",
                    amount: share,
                    entryDate: expense.expenseDate,
                    remarks,
                    createdById: SYSTEM_SESSION.adminId,
                  },
                });
              }
            }
          }, { maxWait: 10000, timeout: 30000 });
          allocated += 1;
          console.log(`[fix-shares]   allocated expense ${expense.id} amount=${expense.amount} (${expense.description})`);
        } catch (error) {
          failed += 1;
          console.error(`[fix-shares]   expense ${expense.id} FAIL`, error);
        }
      }
    } catch (error) {
      console.error(`[fix-shares] office ${office.id} FAIL`, error);
    }
  }
  console.log(`[fix-shares] step 2 done: ${allocated} allocated, ${skipped} already-there skipped, ${failed} failed`);

  // ── Step 3: re-finalize every PROFIT_SHARE case (new pool formula). ─────
  console.log("[fix-shares] step 3: PROFIT_SHARE cases dobara finalize (pool = received − case expenses)");
  const cases = await prisma.case.findMany({
    where: { bookingOfficeId: { in: officeIds } },
    select: { id: true, caseNumber: true },
    orderBy: { caseNumber: "asc" },
  });
  console.log(`[fix-shares] PROFIT_SHARE cases: ${cases.length}`);
  let refinalized = 0;
  for (const item of cases) {
    try {
      const summary = await finalizeProfitShare(item.id, SYSTEM_SESSION);
      refinalized += 1;
      console.log(
        `[fix-shares] case ${item.caseNumber}: received=${summary.received} profit=${summary.profit} adminShare=${summary.adminShare} shares=${summary.shares.length}`
      );
    } catch (error) {
      // e.g. koi payment receive nahi hui — skip, case untouched.
      console.error(`[fix-shares] case ${item.caseNumber} FAIL`, error);
    }
  }
  console.log(`[fix-shares] step 3 done: ${refinalized}/${cases.length} cases re-finalize huay`);

  console.log("[fix-shares] done");
}

main()
  .catch((error) => {
    console.error("[fix-shares] fatal", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
