import { prisma } from "@/lib/prisma";
import { hasPermission, type AdminSession } from "@/lib/auth";
import { caseScope, deptPermissionsOf } from "@/lib/office/case-access";
import { computeTotals } from "@/lib/office/commission";
import { sum, toNumber } from "@/lib/office/money";
import { getOfficeFileSignedUrl } from "@/lib/office/r2";
import { toJson } from "@/lib/office/serializers";
import {
  isFilingLimited,
  roleToRemarkTarget,
  serializeFilingCase,
  setMissingWarning,
} from "@/lib/office/workflow";
import { DEPT_COMMISSION_TYPE, type DeptCommissionKind } from "@/lib/office/dept-commission";

export const caseListInclude = {
  bookingOffice: { select: { id: true, name: true, type: true } },
  category: { select: { id: true, name: true } },
  set: { select: { id: true, name: true } },
  attestations: {
    orderBy: { order: "asc" as const },
    include: { attestationType: { select: { id: true, name: true } } },
  },
  payments: { select: { id: true, amount: true, status: true, paymentDate: true } },
};

// §W14.2 — compact expense summary for list rows (and detail payload).
// `expenses` newest-first hon (list include expenseDate desc se aata hai);
// reasons = up to 3 latest non-empty descriptions.
export function expenseSummaryOf(expenses: Array<{ amount: unknown; description: string | null }>) {
  return {
    count: expenses.length,
    total: toNumber(sum(expenses.map((e) => e.amount as number))),
    reasons: expenses
      .map((e) => e.description)
      .filter((d): d is string => Boolean(d))
      .slice(0, 3),
  };
}

export function serializeCaseRow<
  T extends {
    payments: Array<{ amount: unknown; status: string }>;
    agreedAmount: unknown;
    status: string;
    setId: string | null;
  },
>(item: T, extras: { hasUnseenWarning?: boolean } = {}) {
  const totals = computeTotals(
    item.payments as Array<{ amount: number; status: string }>,
    item.agreedAmount as number
  );
  const expenseRows =
    (item as { expenses?: Array<{ amount: unknown; description: string | null }> }).expenses ?? [];
  return toJson({
    ...item,
    totals,
    expenseSummary: expenseSummaryOf(expenseRows),
    setName: (item as { set?: { name: string } | null }).set?.name ?? null,
    setMissingWarning: setMissingWarning(item),
    hasUnseenWarning: Boolean(extras.hasUnseenWarning),
  });
}

// Names for createdBy / submittedBy / verifiedBy ids without joins on Admin.
async function adminNameMap(ids: Array<string | null | undefined>) {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return {} as Record<string, string>;
  const admins = await prisma.admin.findMany({
    where: { id: { in: unique } },
    select: { id: true, name: true },
  });
  return Object.fromEntries(admins.map((admin) => [admin.id, admin.name]));
}

// §F22.6 — case ke sath attached dept commission rows (read-only display).
// Ledger ke DEPT_COMMISSION entries se aati hain; kind remarks prefix
// ("<KIND> commission [<caseId>]") se parse hota hai (dept-commission.ts).
// Ye REAL CaseExpense rows NAHI hain — expenses array ke BAHAR alag field,
// taake pool/member formulas double-count na karein (DEPT_COMMISSION bucket
// profit mein already deduct hota hai).
function parseDeptCommissionKind(remarks: string | null): DeptCommissionKind | null {
  if (remarks?.startsWith("PRINTING commission [")) return "PRINTING";
  if (remarks?.startsWith("ATTESTATION commission [")) return "ATTESTATION";
  return null;
}

async function loadDeptCommissions(caseId: string) {
  const rows = await prisma.ledgerEntry.findMany({
    where: { caseId, type: DEPT_COMMISSION_TYPE },
    orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
    include: { admin: { select: { id: true, name: true } } },
  });
  return rows.map((row) => ({
    id: row.id,
    kind: parseDeptCommissionKind(row.remarks),
    amount: toNumber(row.amount),
    adminName: row.admin?.name ?? null,
    entryDate: row.entryDate,
  }));
}

// §W18: cross-office limited detail for department workers. Jab caseScope
// case ko block kare (maslan booking office ka user doosre office ka case)
// magar session ke paas kisi department ki write permission ho, to slim
// detail milta hai — koi payments/totals/expenses/commission/contacts nahi.
// Top-level envelope wahi convention rakhta hai jis par UI branch karti hai:
// { ok: true, limited: true, depts, detail }.
export async function loadDeptLimitedCaseDetail(session: AdminSession, caseId: string) {
  const depts = deptPermissionsOf(session);
  if (depts.length === 0) return null;
  const item = await prisma.case.findFirst({
    where: { id: caseId },
    include: {
      bookingOffice: { select: { id: true, name: true } },
      category: { select: { id: true, name: true } },
      set: { select: { id: true, name: true } },
      attestations: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          status: true,
          scheduledDate: true,
          completedDate: true,
          notes: true,
          attestationType: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!item) return null;

  return toJson({
    ok: true,
    limited: true,
    depts,
    detail: {
      id: item.id,
      caseNumber: item.caseNumber,
      status: item.status,
      currentAttestationId: item.currentAttestationId,
      category: item.category ? { id: item.category.id, name: item.category.name } : null,
      rollNumber: item.rollNumber,
      registrationNumber: item.registrationNumber,
      setName: item.set?.name ?? null,
      bookingOffice: { id: item.bookingOffice.id, name: item.bookingOffice.name },
      expectedPrintingDate: item.expectedPrintingDate,
      isPrinted: item.isPrinted,
      courierNumber: item.courierNumber,
      // §W21: attestation tab ka Board-# chip limited payload par bhi chale.
      boardAttestationNumber: item.boardAttestationNumber,
      onlineVerificationNumber: item.onlineVerificationNumber,
      createdAt: item.createdAt,
      attestations: item.attestations.map((a) => ({
        id: a.id,
        status: a.status,
        scheduledDate: a.scheduledDate,
        completedDate: a.completedDate,
        notes: a.notes,
        attestationType: { id: a.attestationType.id, name: a.attestationType.name },
      })),
    },
  });
}

export async function loadCaseDetail(session: AdminSession, caseId: string) {
  const item = await prisma.case.findFirst({
    where: { id: caseId, ...caseScope(session) },
    include: {
      bookingOffice: { select: { id: true, name: true, type: true } },
      category: { select: { id: true, name: true } },
      set: { select: { id: true, name: true } },
      contacts: { orderBy: { createdAt: "asc" } },
      addresses: { orderBy: { createdAt: "asc" } },
      attestations: {
        orderBy: { order: "asc" },
        include: { attestationType: { select: { id: true, name: true } } },
      },
      payments: { orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }] },
      expenses: { orderBy: { expenseDate: "asc" } },
      ledger: {
        orderBy: { createdAt: "asc" },
        include: { member: { select: { id: true, name: true } } },
      },
    },
  });
  // §W18: caseScope ne block kiya — department workers ko limited detail.
  if (!item) return loadDeptLimitedCaseDetail(session, caseId);

  // §N7: the filing department gets a stripped payload — no payments, amounts,
  // commission or ledger fields at all.
  if (isFilingLimited(session)) {
    return serializeFilingCase(item);
  }

  const canSeeLedger =
    hasPermission(session, "office:ledger:read") || session.role === "booking_office";

  // §W11.5 SPEED: audit history ab lazy endpoint par hai
  // (GET /api/office/cases/[id]/audit) — is loader mein nahi. Baqi lookups
  // parallel Promise.all se chalti hain.
  const remarkTarget = roleToRemarkTarget(session.role);
  const [names, hasUnseenWarning, clientPictureUrl, deptCommissions] = await Promise.all([
    adminNameMap([
      item.createdByAdminId,
      ...item.payments.flatMap((p) => [p.submittedById, p.verifiedById]),
      ...item.expenses.map((e) => e.createdById),
      ...item.ledger.map((l) => l.createdById),
    ]),
    remarkTarget
      ? prisma.caseRemarkRecipient.findFirst({
          where: { seenAt: null, target: remarkTarget, remark: { caseId } },
          select: { id: true },
        })
      : Promise.resolve(null),
    item.clientPictureKey
      ? getOfficeFileSignedUrl(item.clientPictureKey)
      : Promise.resolve(null),
    // §F22.6: case ki DEPT_COMMISSION ledger rows (read-only display) —
    // sirf full detail payload par; dept-limited payload mein money data
    // restricted hai (loadDeptLimitedCaseDetail mein ye field NAHI jata).
    loadDeptCommissions(caseId),
  ]);

  const totals = computeTotals(item.payments, item.agreedAmount);

  // BR4.4: profit share needs re-finalize when money moved after finalize.
  const lastMoneyChange = Math.max(
    0,
    ...item.payments.map((p) => p.updatedAt.getTime()),
    ...item.expenses.map((e) => e.createdAt.getTime())
  );
  const profitStale = Boolean(
    item.profitFinalizedAt && lastMoneyChange > item.profitFinalizedAt.getTime()
  );

  // §W11.1: dynamic ATTESTATION status ke liye current attestation step.
  const currentAttestation = item.currentAttestationId
    ? item.attestations.find((a) => a.id === item.currentAttestationId)
    : null;

  // §W11.6: is loader mein CaseFile rows kabhi include nahi hoti (files apne
  // lazy route se aati hain jo booking role ka FILING filter khud lagata hai),
  // is liye booking-office payload mein filing file entries kahin expose nahi
  // hoti.

  return toJson({
    profitStale,
    ...item,
    // §W14.2 — detail mein bhi wahi summary (expenses asc loaded hain → reverse).
    expenseSummary: expenseSummaryOf([...item.expenses].reverse()),
    setName: item.set?.name ?? null,
    setMissingWarning: setMissingWarning(item),
    hasUnseenWarning: Boolean(hasUnseenWarning),
    clientPictureUrl,
    currentAttestation: currentAttestation
      ? {
          id: currentAttestation.id,
          status: currentAttestation.status,
          attestationTypeName: currentAttestation.attestationType.name,
        }
      : null,
    createdByName: names[item.createdByAdminId] || null,
    payments: item.payments.map((p) => ({
      ...p,
      submittedByName: names[p.submittedById] || null,
      verifiedByName: p.verifiedById ? names[p.verifiedById] || null : null,
      hasSlip: Boolean(p.slipKey),
      slipKey: undefined,
    })),
    expenses: item.expenses.map((e) => ({ ...e, createdByName: names[e.createdById] || null })),
    // §F22.6: dept commission rows — `expenses` array ke BAHAR (alag field).
    deptCommissions,
    ledger: canSeeLedger
      ? item.ledger.map((l) => ({ ...l, createdByName: names[l.createdById] || null }))
      : [],
    totals,
    needsExtraDecision:
      item.bookingOffice.type === "FIXED_COMMISSION" &&
      totals.extra > 0 &&
      item.extraSharePercent === null
        ? totals.extra
        : null,
  });
}
