import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { dec, toNumber } from "@/lib/office/money";

// §W51 — department users (printing / attestation / courier) ke apni jeb se
// kiye gaye kharche aur admin ki taraf se un ki wapsi.
//   COURIER kharcha — courier slip ke saath amount: us case ka CaseExpense
//     (kind COURIER, paidByAdminId = user). Case expense ki tarah har formula
//     mein (partner office pool % ke mutabiq, commission office ka rule,
//     admin profit).
//   OTHER kharcha  — kisi case se nahi: CompanyExpense (category DEPT_OTHER,
//     paidByAdminId = user) — sirf admin ke profit se minus.
// Wapsi DeptPayoutRequest se (user accept kare tab "paid"); commission ki
// payment bhi isi request flow se (accept par purani PAYOUT ledger row).
// Baqi = kul kharcha − accept ho chuki wapsi ("Admin se wasooli baqi").
// §W54: admin kharchon ki wapsi ADVANCE mein bhi de sakta hai — baqi minus
// (user ne admin ka itna dena hai / agle kharchon se barabar).
// §W55: BYKEA kharcha — courier user har case par (courier jaisa) daalta hai:
//   us case ka CaseExpense (kind BYKEA) → booking office ke formula (case
//   expense) mein bilkul courier jaisa, MAGAR user ki wapsi "Other expenses"
//   hisaab mein (courier mein nahi).

export const DEPT_PAYOUT_KINDS = ["COMMISSION", "COURIER_EXPENSE", "OTHER_EXPENSE"] as const;
export type DeptPayoutKind = (typeof DEPT_PAYOUT_KINDS)[number];
export const DEPT_PAYOUT_STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;

export const COURIER_EXPENSE_KIND = "COURIER";
export const BYKEA_EXPENSE_KIND = "BYKEA";
// Case par lagne wale department kharche (dono case expense banate hain).
export const CASE_DEPT_EXPENSE_KINDS = [COURIER_EXPENSE_KIND, BYKEA_EXPENSE_KIND] as const;
export type CaseDeptExpenseKind = (typeof CASE_DEPT_EXPENSE_KINDS)[number];
export const CASE_DEPT_EXPENSE_LABELS: Record<CaseDeptExpenseKind, string> = {
  COURIER: "Courier charges",
  BYKEA: "Bykea charges",
};
export const DEPT_OTHER_EXPENSE_CATEGORY = "DEPT_OTHER";

export function isCaseDeptExpenseKind(value: unknown): value is CaseDeptExpenseKind {
  return typeof value === "string" && (CASE_DEPT_EXPENSE_KINDS as readonly string[]).includes(value);
}

// User ki wapsi kis hisaab mein: BYKEA → Other expenses; COURIER (ya purana
// null) → courier.
export function reimbursementBucket(kind: string | null | undefined): "courier" | "other" {
  return kind === BYKEA_EXPENSE_KIND ? "other" : "courier";
}

export function isDeptPayoutKind(value: unknown): value is DeptPayoutKind {
  return typeof value === "string" && (DEPT_PAYOUT_KINDS as readonly string[]).includes(value);
}

export type DeptMoney = { total: number; paid: number; pending: number; remaining: number };
export type DeptExpenseTotals = { courier: DeptMoney; other: DeptMoney; commissionPending: number };

function emptyTotals() {
  const zero = () => ({ total: dec(0), paid: dec(0), pending: dec(0) });
  return { courier: zero(), other: zero(), commissionPending: dec(0) };
}

// Har user ke kharche / wapsi / pending requests ka total (ek batch, koi N+1 nahi).
export async function deptExpenseTotals(adminIds?: string[]): Promise<Map<string, DeptExpenseTotals>> {
  const paidBy = adminIds ? { in: adminIds } : { not: null };
  const [caseRows, officeRows, otherRows, requestRows] = await Promise.all([
    prisma.caseExpense.groupBy({
      by: ["paidByAdminId", "kind"],
      where: { paidByAdminId: paidBy, kind: { in: [...CASE_DEPT_EXPENSE_KINDS] } },
      _sum: { amount: true },
    }),
    // §W54: case delete par "usi office par rahe" — kharcha office ka kharcha
    // ban gaya; user ki wapsi apni qism ke hisaab mein hi (§W55 kind).
    prisma.officeExpense.groupBy({
      by: ["paidByAdminId", "kind"],
      where: { paidByAdminId: paidBy },
      _sum: { amount: true },
    }),
    prisma.companyExpense.groupBy({
      by: ["paidByAdminId"],
      where: { paidByAdminId: paidBy },
      _sum: { amount: true },
    }),
    prisma.deptPayoutRequest.groupBy({
      by: ["adminId", "kind", "status"],
      where: { status: { in: ["PENDING", "ACCEPTED"] }, ...(adminIds ? { adminId: { in: adminIds } } : {}) },
      _sum: { amount: true },
    }),
  ]);

  const raw = new Map<string, ReturnType<typeof emptyTotals>>();
  const of = (adminId: string) => {
    let entry = raw.get(adminId);
    if (!entry) {
      entry = emptyTotals();
      raw.set(adminId, entry);
    }
    return entry;
  };
  for (const row of [...caseRows, ...officeRows]) {
    if (!row.paidByAdminId) continue;
    const bucket = of(row.paidByAdminId)[reimbursementBucket(row.kind)];
    bucket.total = bucket.total.plus(dec(row._sum.amount));
  }
  for (const row of otherRows) {
    if (!row.paidByAdminId) continue;
    const bucket = of(row.paidByAdminId).other;
    bucket.total = bucket.total.plus(dec(row._sum.amount));
  }
  for (const row of requestRows) {
    const entry = of(row.adminId);
    const amount = dec(row._sum.amount);
    if (row.kind === "COMMISSION") {
      if (row.status === "PENDING") entry.commissionPending = entry.commissionPending.plus(amount);
      continue;
    }
    const bucket = row.kind === "COURIER_EXPENSE" ? entry.courier : row.kind === "OTHER_EXPENSE" ? entry.other : null;
    if (!bucket) continue;
    if (row.status === "ACCEPTED") bucket.paid = bucket.paid.plus(amount);
    else bucket.pending = bucket.pending.plus(amount);
  }

  const money = (bucket: { total: Prisma.Decimal; paid: Prisma.Decimal; pending: Prisma.Decimal }): DeptMoney => ({
    total: toNumber(bucket.total),
    paid: toNumber(bucket.paid),
    pending: toNumber(bucket.pending),
    remaining: toNumber(bucket.total.minus(bucket.paid)),
  });
  return new Map(
    [...raw.entries()].map(([adminId, entry]) => [
      adminId,
      { courier: money(entry.courier), other: money(entry.other), commissionPending: toNumber(entry.commissionPending) },
    ])
  );
}

export function emptyDeptExpenseTotals(): DeptExpenseTotals {
  const zero = { total: 0, paid: 0, pending: 0, remaining: 0 };
  return { courier: { ...zero }, other: { ...zero }, commissionPending: 0 };
}
