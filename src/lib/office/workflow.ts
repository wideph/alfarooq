import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminPermission, AdminSession } from "@/lib/auth";
import { getOfficeFileSignedUrl } from "@/lib/office/r2";
import { toJson } from "@/lib/office/serializers";

// ---------------------------------------------------------------------------
// Wave 4 (docs/office-module/06_NEW_REQUIREMENTS.md §N7): department workflow
// helpers shared by the cases / files / remarks routes.
// ---------------------------------------------------------------------------

export const CASE_DEPARTMENTS = ["FILING", "PRINTING", "ATTA", "COURIER"] as const;
export type CaseDepartment = (typeof CASE_DEPARTMENTS)[number];

// Department → permission required to upload/delete its files.
export const DEPARTMENT_PERMISSIONS: Record<CaseDepartment, AdminPermission> = {
  FILING: "office:filing:write",
  PRINTING: "office:printing:write",
  ATTA: "office:atta:write",
  COURIER: "office:courier:write",
};

// -- Targeted remarks (§N7) ---------------------------------------------------

export const REMARK_TARGETS = ["ADMIN", "BOOKING", "FILING", "PRINTING", "ATTA", "COURIER"] as const;
export type RemarkTarget = (typeof REMARK_TARGETS)[number];

export function roleToRemarkTarget(role?: string | null): RemarkTarget | null {
  switch (role) {
    case "admin":
      return "ADMIN";
    case "booking_office":
      return "BOOKING";
    case "filing":
      return "FILING";
    case "printing":
      return "PRINTING";
    case "atta":
      return "ATTA";
    case "courier":
      return "COURIER";
    default:
      return null;
  }
}

// Who a role may address (§N7): booking office → admin/atta/printing, filing →
// admin/booking/printing, printing/atta/courier → anyone, admin → anyone.
export function allowedRemarkTargets(role?: string | null): RemarkTarget[] {
  switch (role) {
    case "admin":
      return [...REMARK_TARGETS];
    case "booking_office":
      return ["ADMIN", "ATTA", "PRINTING"];
    case "filing":
      return ["ADMIN", "BOOKING", "PRINTING"];
    case "printing":
    case "atta":
    case "courier":
      return [...REMARK_TARGETS];
    default:
      return [];
  }
}

// -- Department queues (§N7 list filters) -------------------------------------

// ?dept=filing|printing|atta|courier on GET /api/office/cases. These are plain
// filters over the normal scope; `history` (filing only) shows cases that
// already passed the filing stage. Status keys per §W11.1.
export function deptQueueWhere(dept: string, history: boolean): Prisma.CaseWhereInput | null {
  switch (dept) {
    case "filing":
      return history
        ? {
            status: {
              in: [
                "WAITING_FOR_PRINTING",
                "PRINTED",
                "ATTESTATION",
                "ATTESTATION_COMPLETE",
                "WAITING_FOR_COURIER",
                "DELIVERED",
                "MUSADIQA_APPLIED",
                "MUSADIQA_FEES_PAID",
                "MUSADIQA_SENT_BY_BOARD",
                "MUSADIQA_VERIFIED",
              ],
            },
          }
        : { status: "WAITING_FOR_FILE" };
    case "printing":
      return { status: { in: ["WAITING_FOR_PRINTING", "PRINTED"] } };
    case "atta":
      return { status: { in: ["PRINTED", "ATTESTATION"] } };
    case "courier":
      // §W11.1: courier stage starts when payment is complete
      // (WAITING_FOR_COURIER) and stays visible after DELIVERED.
      return { status: { in: ["WAITING_FOR_COURIER", "DELIVERED"] } };
    default:
      return null;
  }
}

// -- Warnings -----------------------------------------------------------------

// Set-warning: printing marked the case printed (or it moved beyond) without a
// selected set → booking office sees a red warning. §W11.1: PRINTED and later,
// except CANCELLED.
export const SET_WARNING_STATUSES = [
  "PRINTED",
  "ATTESTATION",
  "ATTESTATION_COMPLETE",
  "WAITING_FOR_COURIER",
  "DELIVERED",
  "MUSADIQA_APPLIED",
  "MUSADIQA_FEES_PAID",
  "MUSADIQA_SENT_BY_BOARD",
  "MUSADIQA_VERIFIED",
];

export function setMissingWarning(item: { status: string; setId: string | null }): boolean {
  return !item.setId && SET_WARNING_STATUSES.includes(item.status);
}

// Case ids (out of `caseIds`) that have an unseen remark aimed at the caller's
// department → `hasUnseenWarning` flag on list rows.
export async function unseenWarningCaseIds(
  session: AdminSession,
  caseIds: string[]
): Promise<Set<string>> {
  const target = roleToRemarkTarget(session.role);
  if (!target || caseIds.length === 0) return new Set();
  const rows = await prisma.caseRemarkRecipient.findMany({
    where: { target, seenAt: null, remark: { caseId: { in: caseIds } } },
    select: { remark: { select: { caseId: true } } },
  });
  return new Set(rows.map((row) => row.remark.caseId));
}

// -- Filing-limited view (§N7) --------------------------------------------------

// Filing department (unless super admin) sees ONLY: id, caseNumber, category
// name, r-number, reg-number, notes, client picture, status, set name — never
// payments / agreed amount / commission / ledger.
export function isFilingLimited(session: AdminSession): boolean {
  return session.role === "filing";
}

type FilingCaseRow = {
  id: string;
  caseNumber: string;
  rollNumber: string | null;
  registrationNumber: string | null;
  notes: string | null;
  status: string;
  clientPictureKey: string | null;
  clientPictureType: string | null;
  category?: { name: string } | null;
  set?: { name: string } | null;
};

export async function serializeFilingCase(item: FilingCaseRow) {
  return toJson({
    id: item.id,
    caseNumber: item.caseNumber,
    category: item.category ? { name: item.category.name } : null,
    rollNumber: item.rollNumber,
    registrationNumber: item.registrationNumber,
    notes: item.notes,
    status: item.status,
    setName: item.set?.name ?? null,
    clientPictureType: item.clientPictureType,
    clientPictureUrl: item.clientPictureKey
      ? await getOfficeFileSignedUrl(item.clientPictureKey)
      : null,
  });
}

// -- Attestation-complete rule (§W11.1) -----------------------------------------

// Status order of the W11 flow (CANCELLED sits outside the order).
export const CASE_STATUS_ORDER: Record<string, number> = {
  FIRST_PAYMENT_PENDING: 1,
  WAITING_FOR_FILE: 2,
  WAITING_FOR_PRINTING: 3,
  PRINTED: 4,
  ATTESTATION: 5,
  ATTESTATION_COMPLETE: 6,
  WAITING_FOR_COURIER: 7,
  DELIVERED: 8,
  MUSADIQA_APPLIED: 9,
  MUSADIQA_FEES_PAID: 10,
  MUSADIQA_SENT_BY_BOARD: 11,
  MUSADIQA_VERIFIED: 12,
};

// Forward-only guard: once a case reaches ATTESTATION_COMPLETE (or beyond, or
// CANCELLED) the completion evaluator must never move it again.
const COMPLETION_GUARD_STATUSES = [
  "ATTESTATION_COMPLETE",
  "WAITING_FOR_COURIER",
  "DELIVERED",
  "MUSADIQA_APPLIED",
  "MUSADIQA_FEES_PAID",
  "MUSADIQA_SENT_BY_BOARD",
  "MUSADIQA_VERIFIED",
  "CANCELLED",
];

// A case becomes ATTESTATION_COMPLETE when (a) every attestation step of its
// set is DONE (fallback when no set: every CaseAttestation of the case) AND
// (b) the atta department uploaded the mandatory final file (department=ATTA,
// stepKey=FINAL). Forward-only: never touches ATTESTATION_COMPLETE-or-later /
// CANCELLED cases.
export async function evaluateCaseCompletion(
  caseId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<boolean> {
  const item = await db.case.findUnique({
    where: { id: caseId },
    include: {
      attestations: { include: { attestationType: { select: { name: true } } } },
      set: { include: { steps: { select: { label: true } } } },
    },
  });
  if (!item) return false;
  if (COMPLETION_GUARD_STATUSES.includes(item.status)) return false;

  const relevant = item.set
    ? item.attestations.filter((a) =>
        item.set!.steps.some((step) => step.label === a.attestationType.name)
      )
    : item.attestations;
  if (relevant.length === 0 || !relevant.every((a) => a.status === "DONE")) return false;

  const finalFile = await db.caseFile.findFirst({
    where: { caseId, department: "ATTA", stepKey: "FINAL" },
    select: { id: true },
  });
  if (!finalFile) return false;

  await db.case.update({
    where: { id: caseId },
    data: { status: "ATTESTATION_COMPLETE", currentAttestationId: null },
  });
  return true;
}

// -- §W11.1 admin jump helpers ---------------------------------------------------

function utcToday(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

// Admin selects "Attestation: <name>" in the status dropdown: status becomes
// ATTESTATION (set by the caller) and the steps realign around the selected
// one — steps BEFORE it → DONE (completedDate = today where null), the
// selected step → IN_PROGRESS, steps AFTER it → PENDING (completedDate
// cleared). Also points Case.currentAttestationId at the selected step.
// Returns the selected step name (for notifications) or null when the
// attestation does not belong to the case.
export async function applyAttestationJump(
  db: Prisma.TransactionClient | typeof prisma,
  caseId: string,
  attestationId: string
): Promise<{ name: string } | null> {
  const steps = await db.caseAttestation.findMany({
    where: { caseId },
    orderBy: { order: "asc" },
    include: { attestationType: { select: { name: true } } },
  });
  const target = steps.find((step) => step.id === attestationId);
  if (!target) return null;

  const today = utcToday();
  // Before → DONE, with completedDate filled where missing.
  await db.caseAttestation.updateMany({
    where: { caseId, order: { lt: target.order }, status: { not: "DONE" } },
    data: { status: "DONE" },
  });
  await db.caseAttestation.updateMany({
    where: { caseId, order: { lt: target.order }, completedDate: null },
    data: { completedDate: today },
  });
  // Selected → IN_PROGRESS.
  await db.caseAttestation.update({
    where: { id: target.id },
    data: { status: "IN_PROGRESS" },
  });
  // Later → PENDING (completedDate cleared, matching the PATCH convention).
  await db.caseAttestation.updateMany({
    where: { caseId, order: { gt: target.order }, status: { not: "PENDING" } },
    data: { status: "PENDING", completedDate: null },
  });

  await db.case.update({
    where: { id: caseId },
    data: { status: "ATTESTATION", currentAttestationId: target.id },
  });
  return { name: target.attestationType.name };
}

// Later-stage admin jumps (§W11.1) carry data side effects:
//   ATTESTATION_COMPLETE or later → ALL attestations DONE (completedDate
//     filled where null);
//   PRINTED or later → isPrinted=true + printedAt set;
// CANCELLED (order 0) gets no side effects.
export async function applyStatusSideEffects(
  db: Prisma.TransactionClient | typeof prisma,
  caseId: string,
  newStatus: string
): Promise<void> {
  const order = CASE_STATUS_ORDER[newStatus] ?? 0;
  if (order === 0) return;

  if (order >= CASE_STATUS_ORDER.ATTESTATION_COMPLETE) {
    const today = utcToday();
    await db.caseAttestation.updateMany({
      where: { caseId, status: { not: "DONE" } },
      data: { status: "DONE" },
    });
    await db.caseAttestation.updateMany({
      where: { caseId, completedDate: null },
      data: { completedDate: today },
    });
  }

  if (order >= CASE_STATUS_ORDER.PRINTED) {
    const item = await db.case.findUnique({
      where: { id: caseId },
      select: { isPrinted: true, printedAt: true },
    });
    if (item && !item.isPrinted) {
      await db.case.update({
        where: { id: caseId },
        data: { isPrinted: true, printedAt: item.printedAt ?? new Date() },
      });
    }
  }
}

// -- First-payment hook (§N7) ---------------------------------------------------

// After the FIRST payment turns RECEIVED the case enters the department
// workflow: status → WAITING_FOR_FILE (visible to filing). Returns
// `datesNeeded: true` when a set is already selected — the caller then
// schedules the AI-heavy generateSetDates via next/server after() so the
// request path stays fast. Call after recomputeCaseFinancials. Never throws.
export async function activateWorkflowOnFirstPayment(
  caseId: string
): Promise<{ datesNeeded: boolean }> {
  try {
    const receivedCount = await prisma.payment.count({ where: { caseId, status: "RECEIVED" } });
    if (receivedCount !== 1) return { datesNeeded: false };
    const item = await prisma.case.findUnique({
      where: { id: caseId },
      select: { status: true, setId: true },
    });
    if (!item) return { datesNeeded: false };
    // §W11.1: FIRST_PAYMENT_PENDING → WAITING_FOR_FILE (legacy keys included
    // for safety with un-migrated rows).
    if (["FIRST_PAYMENT_PENDING", "NEW", "PAYMENT_PENDING", "IN_PROCESS"].includes(item.status)) {
      await prisma.case.update({ where: { id: caseId }, data: { status: "WAITING_FOR_FILE" } });
    }
    return { datesNeeded: Boolean(item.setId) };
  } catch (error) {
    console.error("[office] first-payment hook fail", error);
    return { datesNeeded: false };
  }
}

// -- Multipart / JSON case input (client picture upload) ------------------------

// Case create/update accept either JSON or multipart (multipart when a client
// picture is attached, like payment slips). Array/object fields arrive as
// JSON-encoded strings in multipart mode.
export async function parseCaseInput(request: NextRequest): Promise<{
  fields: Record<string, unknown>;
  clientPicture: File | null;
}> {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    const fields = (await request.json()) as Record<string, unknown>;
    return { fields, clientPicture: null };
  }

  const formData = await request.formData();
  const fields: Record<string, unknown> = {};
  let clientPicture: File | null = null;
  for (const [key, value] of formData.entries()) {
    if (value instanceof File) {
      if (key === "clientPicture" && value.size > 0) clientPicture = value;
      continue;
    }
    if (["contacts", "addresses", "attestationTypeIds"].includes(key)) {
      try {
        fields[key] = JSON.parse(value);
      } catch {
        fields[key] = value;
      }
    } else if (key === "isUrgent") {
      fields[key] = value === "true" || value === "1";
    } else {
      fields[key] = value;
    }
  }
  return { fields, clientPicture };
}
