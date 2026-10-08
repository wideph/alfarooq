import { prisma } from "@/lib/prisma";
import { hasPermission, type AdminSession } from "@/lib/auth";
import { caseScope } from "@/lib/office/case-access";
import { computeTotals } from "@/lib/office/commission";
import { getOfficeFileSignedUrl } from "@/lib/office/r2";
import { toJson } from "@/lib/office/serializers";
import {
  isFilingLimited,
  roleToRemarkTarget,
  serializeFilingCase,
  setMissingWarning,
} from "@/lib/office/workflow";

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
  return toJson({
    ...item,
    totals,
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
  if (!item) return null;

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
  const [names, hasUnseenWarning, clientPictureUrl] = await Promise.all([
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
