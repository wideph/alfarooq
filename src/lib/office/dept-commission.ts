import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/office/money";
import { todayPakistan } from "@/lib/office/serializers";

// ---------------------------------------------------------------------------
// F4 — Department commission engine.
//
// Admin defines per dept-user rules per category + per Set of Attestations
// (DepartmentCommissionRule grid, adminId × categoryId × setId unique, setId
// "" = category-level fallback row). Two earning events:
//   PRINTING    — a printing-dept user uploads the FIRST printing file and
//                 the case moves WAITING_FOR_PRINTING → PRINTED (files route).
//   ATTESTATION — the case reaches ATTESTATION_COMPLETE via the attestation
//                 dept's own actions (step PATCH, complete-all, FINAL file
//                 upload — evaluateCaseCompletion flip).
// Each event writes ONE case-by-case LedgerEntry (type DEPT_COMMISSION,
// direction CREDIT, adminId = acting dept user). Payouts are PAYOUT DEBIT
// ledger rows carrying the same adminId; remaining = earned − paid.
//
// Admin manually changing status via the status dropdown (status route /
// applyStatusSideEffects) does NOT credit anyone — no dept worker acted.
// ---------------------------------------------------------------------------

type Db = Prisma.TransactionClient | typeof prisma;

export type DeptCommissionKind = "PRINTING" | "ATTESTATION";

export const DEPT_COMMISSION_TYPE = "DEPT_COMMISSION";

// Exact (adminId, categoryId, setId||"") rule first; fallback to the
// category-level row (adminId, categoryId, ""). Null when nothing matches.
export async function findRule(
  adminId: string,
  categoryId: string,
  setId: string | null | undefined,
  db: Db = prisma
) {
  const key = setId || "";
  const exact = await db.departmentCommissionRule.findUnique({
    where: { adminId_categoryId_setId: { adminId, categoryId, setId: key } },
  });
  if (exact || key === "") return exact;
  return db.departmentCommissionRule.findUnique({
    where: { adminId_categoryId_setId: { adminId, categoryId, setId: "" } },
  });
}

// Remarks marker — also the idempotency key prefix. `parseDeptCommissionKind`
// (entries route) reads the leading "<KIND> commission" back out.
export function deptCommissionRemarksPrefix(kind: DeptCommissionKind, caseId: string) {
  return `${kind} commission [${caseId}]`;
}

// Credits the acting dept user for one case event. Idempotent: a matching
// LedgerEntry (type DEPT_COMMISSION, same caseId + adminId, remarks starting
// with "<KIND> commission [<caseId>]") means the credit already happened and
// the call is a no-op. Returns the created entry, or null when there is no
// rule / a zero amount / nothing to do. NEVER throws — a commission failure
// must not fail the underlying upload/status action.
export async function creditDeptCommission(
  input: { adminId: string; caseId: string; kind: DeptCommissionKind },
  db: Db = prisma
) {
  try {
    const item = await db.case.findUnique({
      where: { id: input.caseId },
      select: {
        id: true,
        caseNumber: true,
        bookingOfficeId: true,
        categoryId: true,
        setId: true,
        category: { select: { name: true } },
      },
    });
    if (!item || !item.categoryId) return null;

    const rule = await findRule(input.adminId, item.categoryId, item.setId, db);
    const amount = rule
      ? round2(input.kind === "PRINTING" ? rule.printAmount : rule.attestationAmount)
      : null;
    if (!rule || !amount || amount.lessThanOrEqualTo(0)) return null;

    const prefix = deptCommissionRemarksPrefix(input.kind, item.id);
    const existing = await db.ledgerEntry.findFirst({
      where: {
        type: DEPT_COMMISSION_TYPE,
        caseId: item.id,
        adminId: input.adminId,
        remarks: { startsWith: prefix },
      },
      select: { id: true },
    });
    if (existing) return null;

    return await db.ledgerEntry.create({
      data: {
        bookingOfficeId: item.bookingOfficeId,
        memberId: null,
        adminId: input.adminId,
        caseId: item.id,
        type: DEPT_COMMISSION_TYPE,
        direction: "CREDIT",
        amount,
        entryDate: todayPakistan(),
        method: null,
        remarks: `${prefix} ${item.caseNumber} — ${item.category?.name ?? ""}`.trim(),
        createdById: input.adminId,
      },
    });
  } catch (error) {
    console.warn("[office] dept commission credit fail", error);
    return null;
  }
}
