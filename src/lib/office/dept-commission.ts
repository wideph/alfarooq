import { Prisma } from "@prisma/client";
import { hasPermission, type AdminPermission, type AdminSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { round2 } from "@/lib/office/money";
import { todayPakistan } from "@/lib/office/serializers";

// ---------------------------------------------------------------------------
// F4 — Department commission engine.
//
// Admin defines per dept-user rules per category + per Set of Attestations
// (DepartmentCommissionRule grid, adminId × categoryId × setId unique, setId
// "" = category-level fallback row). Three earning events:
//   PRINTING    — a printing-dept user uploads the FIRST printing file and
//                 the case moves WAITING_FOR_PRINTING → PRINTED (files route).
//   ATTESTATION — the case reaches ATTESTATION_COMPLETE via the attestation
//                 dept's own actions (step PATCH, complete-all, FINAL file
//                 upload — evaluateCaseCompletion flip).
//   COURIER     — §W30: a courier-dept user's courier slip upload moves the
//                 case to DELIVERED (files route).
// Rule na ho (ya amount 0) → commission 0, koi entry nahi. Amount EVENT ke
// waqt ke rule se likha jata hai — baad mein rate badle to pehle se credit
// ho chuke cases par koi asar nahi; sirf naye events naye rate se.
// Each event writes ONE case-by-case LedgerEntry (type DEPT_COMMISSION,
// direction CREDIT, adminId = acting dept user). Payouts are PAYOUT DEBIT
// ledger rows carrying the same adminId; remaining = earned − paid.
//
// Admin manually changing status via the status dropdown (status route /
// applyStatusSideEffects) does NOT credit anyone — no dept worker acted.
// ---------------------------------------------------------------------------

type Db = Prisma.TransactionClient | typeof prisma;

export type DeptCommissionKind = "PRINTING" | "ATTESTATION" | "COURIER";

export const DEPT_COMMISSION_KINDS: readonly DeptCommissionKind[] = ["PRINTING", "ATTESTATION", "COURIER"];

export const DEPT_COMMISSION_TYPE = "DEPT_COMMISSION";

// §W30: har kind ki department write permission — dept commission user woh
// hai jis ke paas in mein se koi bhi ho (ya role printing/attestation_dept/courier).
export const DEPT_COMMISSION_PERMISSIONS: Record<DeptCommissionKind, AdminPermission> = {
  PRINTING: "office:printing:write",
  ATTESTATION: "office:attestation-dept:write",
  COURIER: "office:courier:write",
};

const DEPT_COMMISSION_ROLE_KIND: Record<string, DeptCommissionKind> = {
  printing: "PRINTING",
  attestation_dept: "ATTESTATION",
  courier: "COURIER",
};

// User kin kinds ka kaam karta hai (role + explicit permissions; super admin
// ki implicit "sab permissions" yahan shamil NAHI — wo dept worker nahi).
export function deptCommissionKindsOf(role: string | null | undefined, permissions: readonly string[]) {
  return DEPT_COMMISSION_KINDS.filter(
    (kind) => DEPT_COMMISSION_ROLE_KIND[role || ""] === kind || permissions.includes(DEPT_COMMISSION_PERMISSIONS[kind])
  );
}

export function hasAnyDeptCommissionPermission(session: AdminSession) {
  return DEPT_COMMISSION_KINDS.some((kind) => hasPermission(session, DEPT_COMMISSION_PERMISSIONS[kind]));
}

// Ledger remarks "<KIND> commission [<caseId>] …" se kind wapas (entries
// route, case detail — ek hi jagah).
export function parseDeptCommissionKind(remarks: string | null | undefined): DeptCommissionKind | null {
  for (const kind of DEPT_COMMISSION_KINDS) {
    if (remarks?.startsWith(`${kind} commission [`)) return kind;
  }
  return null;
}

function ruleAmountFor(
  kind: DeptCommissionKind,
  rule: { printAmount: Prisma.Decimal; attestationAmount: Prisma.Decimal; courierAmount: Prisma.Decimal }
) {
  if (kind === "PRINTING") return rule.printAmount;
  if (kind === "ATTESTATION") return rule.attestationAmount;
  return rule.courierAmount;
}

// §W31 — har kind ki raqam ALAG jagah se (owner: "printing har category,
// attestation har Set of Attestations, courier alag"):
//   PRINTING    → category-level row (setId "") ka printAmount.
//   ATTESTATION → case ke set ka row (attestationAmount); case ka set na ho
//                 (ya us set ka row na ho) → category-level row ka
//                 attestationAmount (bina set wali categories ke liye).
//   COURIER     → user ki DepartmentCommissionSetting.courierAmount (ek hi
//                 raqam har delivered case par); purane W30 category row ka
//                 courierAmount sirf fallback.
// Kuch set na ho → 0 (null).
export async function deptCommissionAmount(
  kind: DeptCommissionKind,
  adminId: string,
  categoryId: string,
  setId: string | null | undefined,
  db: Db = prisma
): Promise<Prisma.Decimal | null> {
  const categoryRow = await db.departmentCommissionRule.findUnique({
    where: { adminId_categoryId_setId: { adminId, categoryId, setId: "" } },
  });
  if (kind === "PRINTING") return categoryRow ? ruleAmountFor("PRINTING", categoryRow) : null;

  if (kind === "ATTESTATION") {
    if (setId) {
      const setRow = await db.departmentCommissionRule.findUnique({
        where: { adminId_categoryId_setId: { adminId, categoryId, setId } },
      });
      if (setRow) return setRow.attestationAmount;
    }
    return categoryRow ? categoryRow.attestationAmount : null;
  }

  const setting = await db.departmentCommissionSetting.findUnique({ where: { adminId } });
  if (setting && setting.courierAmount.greaterThan(0)) return setting.courierAmount;
  return categoryRow ? categoryRow.courierAmount : null;
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

    const raw = await deptCommissionAmount(input.kind, input.adminId, item.categoryId, item.setId, db);
    const amount = raw ? round2(raw) : null;
    if (!amount || amount.lessThanOrEqualTo(0)) return null;

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
