import type { NextRequest } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission, type AdminPermission, type AdminSession } from "@/lib/auth";
import { getOfficeFileSignedUrl } from "@/lib/office/r2";
import { toJson } from "@/lib/office/serializers";
import { PRE_PRINTING_STATUSES } from "@/lib/office/permissions";

// ---------------------------------------------------------------------------
// Wave 4 (docs/office-module/06_NEW_REQUIREMENTS.md §N7): department workflow
// helpers shared by the cases / files / remarks routes.
// ---------------------------------------------------------------------------

export const CASE_DEPARTMENTS = ["FILING", "PRINTING", "ATTESTATION", "COURIER"] as const;
export type CaseDepartment = (typeof CASE_DEPARTMENTS)[number];

// W21: verification sticker uploads ride the FILING department with this
// stepKey. They NEVER trigger the WAITING_FOR_FILE → WAITING_FOR_PRINTING
// transition and never count as the "first filing file".
export const VERIFICATION_STICKER_STEP_KEY = "VERIFICATION_STICKER";

// Department → permission required to upload/delete its files.
export const DEPARTMENT_PERMISSIONS: Record<CaseDepartment, AdminPermission> = {
  FILING: "office:filing:write",
  PRINTING: "office:printing:write",
  ATTESTATION: "office:attestation-dept:write",
  COURIER: "office:courier:write",
};

// -- Targeted remarks (§N7) ---------------------------------------------------

export const REMARK_TARGETS = ["ADMIN", "BOOKING", "FILING", "PRINTING", "ATTESTATION", "COURIER"] as const;
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
    // §W25: "attestation" office role bhi ATTESTATION dept remarks ka target
    // hai (live dept user isi role par hai — pehle null aata tha, is liye unhe
    // remarks ka option hi nahi milta tha).
    case "attestation":
    case "attestation_dept":
      return "ATTESTATION";
    case "courier":
      return "COURIER";
    default:
      return null;
  }
}

// Who a role may address (§N7): booking office → admin/attestation/printing,
// filing → admin/booking/printing, printing/attestation/courier → anyone,
// admin → anyone.
export function allowedRemarkTargets(role?: string | null): RemarkTarget[] {
  switch (role) {
    case "admin":
      return [...REMARK_TARGETS];
    case "booking_office":
      return ["ADMIN", "ATTESTATION", "PRINTING"];
    case "filing":
      return ["ADMIN", "BOOKING", "PRINTING"];
    case "printing":
    case "attestation":
    case "attestation_dept":
    case "courier":
      return [...REMARK_TARGETS];
    default:
      return [];
  }
}

// -- Department queues (§N7 list filters) -------------------------------------

// ?dept=filing|printing|attestation|courier on GET /api/office/cases. These are plain
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
                "WAITING_FOR_COURIER_ADDRESS",
                "WAITING_FOR_COURIER",
                "DELIVERED",
                "MUSADIQA_APPLIED",
                "MUSADIQA_FEES_PAID",
                "MUSADIQA_SENT_BY_BOARD",
                "MUSADIQA_VERIFIED",
              ],
            },
          }
        : // W21: the filing tab KEEPS cases after their files are uploaded —
          // pending (no filing file yet) OR done (≥1 FILING file). Rows carry
          // filingFilesCount / filingDone so the UI can color them; the cases
          // route sorts pending first.
          {
            OR: [
              { status: "WAITING_FOR_FILE" },
              { files: { some: { department: "FILING" } } },
            ],
          };
    case "printing":
      // §W23: printing queue = sirf kaam ka intezar karne wale cases. PRINTED
      // case attestation phase mein hota hai — wo SIRF attestation queue ka
      // hissa hai (pehle yahan bhi show hota tha → confusing).
      return { status: "WAITING_FOR_PRINTING" };
    case "attestation":
      return { status: { in: ["PRINTED", "ATTESTATION"] } };
    case "courier":
      // §W11.1: courier stage starts when payment is complete
      // (WAITING_FOR_COURIER) and stays visible after DELIVERED.
      // §W30: WAITING_FOR_COURIER = payment poori + delivery address maujood
      // (slip ka intezar). Address ke baghair (WAITING_FOR_COURIER_ADDRESS)
      // courier kuch bhej nahi sakta — wo booking office / admin ka kaam hai.
      // §W47: do alag pages — default "Waiting for courier slip", history=1
      // par "Delivered".
      return history ? { status: "DELIVERED" } : { status: "WAITING_FOR_COURIER" };
    default:
      return null;
  }
}

// -- Warnings -----------------------------------------------------------------

// Set-warning: printing marked the case printed (or it moved beyond) without a
// selected set → booking office sees a red warning. §W11.1: PRINTED and later,
// except CANCELLED.
// §W14.8: set-missing warning SIRF PRINTED + ATTESTATION ke dauraan —
// ATTESTATION_COMPLETE (ya us se aage) push ho chuka case warn karna band
// kar deta hai; PRINTED se pehle ke stages bhi warn nahi karte.
export const SET_WARNING_STATUSES = ["PRINTED", "ATTESTATION"];

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
// name, Roll Number, Registration Number, notes, client picture, status, set name — never
// payments / agreed amount / commission / ledger.
export function isFilingLimited(session: AdminSession): boolean {
  return session.role === "filing";
}

type FilingCaseRow = {
  id: string;
  caseNumber: string;
  // §W25: dept queues (printing/attestation) ko list mein client ka naam bhi
  // chahiye — pehle slim payload mein nahi tha.
  clientName?: string | null;
  rollNumber: string | null;
  registrationNumber: string | null;
  notes: string | null;
  status: string;
  clientPictureKey: string | null;
  clientPictureType: string | null;
  // W21: S's new Case scalar — optional here so older include shapes still compile.
  onlineVerificationNumber?: string | null;
  customLabel?: string | null;
  customLabelColor?: string | null;
  category?: { name: string } | null;
  set?: { name: string } | null;
  // W21: cases list rows carry a filtered FILING files count; when present the
  // payload gets filingFilesCount / filingDone (pending vs done colors).
  _count?: { files: number };
};

export async function serializeFilingCase(item: FilingCaseRow) {
  return toJson({
    id: item.id,
    caseNumber: item.caseNumber,
    clientName: item.clientName ?? null,
    category: item.category ? { name: item.category.name } : null,
    rollNumber: item.rollNumber,
    registrationNumber: item.registrationNumber,
    notes: item.notes,
    status: item.status,
    setName: item.set?.name ?? null,
    onlineVerificationNumber: item.onlineVerificationNumber ?? null,
    customLabel: item.customLabel ?? null,
    customLabelColor: item.customLabelColor ?? null,
    ...(item._count
      ? { filingFilesCount: item._count.files, filingDone: item._count.files > 0 }
      : {}),
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
  // §W30: payment poori, delivery address ka intezar.
  WAITING_FOR_COURIER_ADDRESS: 7,
  WAITING_FOR_COURIER: 8,
  DELIVERED: 9,
  MUSADIQA_APPLIED: 10,
  MUSADIQA_FEES_PAID: 11,
  MUSADIQA_SENT_BY_BOARD: 12,
  MUSADIQA_VERIFIED: 13,
};

// §W39 — PRE_PRINTING_STATUSES (permissions.ts, client bhi use karta hai).
export { PRE_PRINTING_STATUSES };

// Forward-only guard: once a case reaches ATTESTATION_COMPLETE (or beyond, or
// CANCELLED) the completion evaluator must never move it again.
const COMPLETION_GUARD_STATUSES = [
  "ATTESTATION_COMPLETE",
  "WAITING_FOR_COURIER_ADDRESS",
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
// (b) the attestation department uploaded the mandatory final file (department=ATTESTATION,
// stepKey=FINAL). Forward-only: never touches ATTESTATION_COMPLETE-or-later /
// CANCELLED cases.
// §W32: `allowWithoutFinal` + `allowNoAttestations` sirf wajah ke saath
// manual completion (canCompleteAttestationWithReason) ke liye — FINAL file
// zaroori nahi, aur jis case par koi attestation step hi nahi wo bhi complete.
export async function evaluateCaseCompletion(
  caseId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma,
  options: { allowWithoutFinal?: boolean; allowNoAttestations?: boolean; allowBeforePrinting?: boolean } = {}
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
  // §W39: printing se pehle complete nahi (sirf admin — allowBeforePrinting).
  if (PRE_PRINTING_STATUSES.includes(item.status) && !options.allowBeforePrinting) return false;

  const relevant = item.set
    ? item.attestations.filter((a) =>
        item.set!.steps.some((step) => step.label === a.attestationType.name)
      )
    : item.attestations;
  if (relevant.length === 0 && !options.allowNoAttestations) return false;
  if (!relevant.every((a) => a.status === "DONE")) return false;

  if (!options.allowWithoutFinal) {
    const finalFile = await db.caseFile.findFirst({
      where: { caseId, department: "ATTESTATION", stepKey: "FINAL" },
      select: { id: true },
    });
    if (!finalFile) return false;
  }

  await db.case.update({
    where: { id: caseId },
    data: { status: "ATTESTATION_COMPLETE", currentAttestationId: null },
  });
  return true;
}

// §W32 — printing, attestation-department YA courier department ka user
// (koi bhi ek write permission) case ka printed proof upload ho jane ke baad
// (kam az kam ek PRINTING file) attestation stage "complete — final payment
// pending" kar sakta hai, FINAL attestation file ke baghair — magar WAJAH
// likhna lazmi hai (complete-all route check karta hai). Super admin is mein
// shamil NAHI (us ke paas status dropdown hai).
export async function canCompleteAttestationWithReason(
  session: AdminSession,
  caseId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<boolean> {
  if (session.role === "admin") return false;
  const deptUser =
    hasPermission(session, "office:printing:write") ||
    hasPermission(session, "office:attestation-dept:write") ||
    hasPermission(session, "office:courier:write");
  if (!deptUser) return false;
  const printedProof = await db.caseFile.findFirst({
    where: { caseId, department: "PRINTING" },
    select: { id: true },
  });
  return Boolean(printedProof);
}

// §W30 — attestation ke baad courier stage, khud-ba-khud (forward-only):
//   ATTESTATION_COMPLETE + baqi payment 0  → WAITING_FOR_COURIER_ADDRESS
//                                            (ya address ho to seedha ↓)
//   WAITING_FOR_COURIER_ADDRESS + address  → WAITING_FOR_COURIER (slip ka intezar)
// Baqi = max(agreed − RECEIVED, 0) (BR1.4); agreed 0 wale case nahi barhte
// (purana §W11.1 rule). Payment, agreed amount, address ya attestation
// completion ke har raaste ke baad call hota hai. Naya status return karta hai
// (kuch na badle to null). Kabhi peeche nahi le jata.
export async function advanceCourierStage(
  caseId: string,
  db: Prisma.TransactionClient | typeof prisma = prisma
): Promise<"WAITING_FOR_COURIER_ADDRESS" | "WAITING_FOR_COURIER" | null> {
  const item = await db.case.findUnique({
    where: { id: caseId },
    select: {
      status: true,
      agreedAmount: true,
      payments: { where: { status: "RECEIVED" }, select: { amount: true } },
      _count: { select: { addresses: true } },
    },
  });
  if (!item) return null;
  if (item.status !== "ATTESTATION_COMPLETE" && item.status !== "WAITING_FOR_COURIER_ADDRESS") return null;

  const agreed = Number(item.agreedAmount);
  const received = item.payments.reduce((total, payment) => total + Number(payment.amount), 0);
  // Paisa 2 decimal tak — floating noise se bachne ke liye paisa (×100) mein.
  const remainingPaisa = Math.max(Math.round(agreed * 100) - Math.round(received * 100), 0);
  if (agreed <= 0 || remainingPaisa > 0) return null;

  const next = item._count.addresses > 0 ? "WAITING_FOR_COURIER" : "WAITING_FOR_COURIER_ADDRESS";
  if (next === item.status) return null;
  await db.case.update({ where: { id: caseId }, data: { status: next } });
  return next;
}

// §W39: F22.5 ka "dual-permission auto-bridge" hata diya — printing +
// attestation dono permission wala user WAITING_FOR_PRINTING case par
// attestation kaam karta to case printed proof ke baghair khud PRINTED ho jata
// tha (owner: "auto printed"). Ab PRINTED sirf printing proof ya admin se.

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
    if (["contacts", "addresses", "attestationTypeIds", "commissionDecision"].includes(key)) {
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
