// Client-side shape of /api/office/cases/[id] (see lib/office/case-detail.ts).

export type CaseDetail = {
  id: string;
  caseNumber: string;
  clientName: string;
  rollNumber: string | null;
  registrationNumber: string | null;
  agreedAmount: number;
  claimedRemaining: number | null;
  claimedRemainingStatus: "NONE" | "PENDING" | "ACCEPTED";
  commissionAmount: number;
  commissionHalfCreditedAt: string | null;
  commissionFullCreditedAt: string | null;
  extraSharePercent: number | null;
  extraShareCreditedAt: string | null;
  profitFinalizedAt: string | null;
  profitStale: boolean;
  status: string;
  isPrinted: boolean;
  printedAt: string | null;
  expectedPrintingDate: string | null;
  notes: string | null;
  createdAt: string;
  createdByName: string | null;
  bookingOffice: { id: string; name: string; type: "FIXED_COMMISSION" | "PROFIT_SHARE" | "SALARY" };
  category: { id: string; name: string } | null;
  // Wave 2026-10 (docs 06 §N5/N7/N8): department workflow fields.
  setId: string | null;
  set: { id: string; name: string } | null;
  setName: string | null;
  setMissingWarning: boolean;
  hasUnseenWarning: boolean;
  isUrgent: boolean;
  courierNumber: string | null;
  agreedAmountRemarks: string | null;
  boardAttasNumber: string | null;
  clientPictureUrl: string | null;
  clientPictureType: string | null;
  contacts: Array<{ id: string; phone: string; label: string | null }>;
  addresses: Array<{ id: string; address: string; label: string | null }>;
  attestations: Array<{
    id: string;
    status: "PENDING" | "IN_PROGRESS" | "DONE";
    scheduledDate: string | null;
    completedDate: string | null;
    notes: string | null;
    order: number;
    attestationType: { id: string; name: string };
  }>;
  payments: Array<{
    id: string;
    amount: number;
    paymentDate: string;
    method: string;
    reference: string | null;
    status: "PENDING" | "RECEIVED" | "NOT_RECEIVED" | "BOGUS";
    remarks: string | null;
    hasSlip: boolean;
    submittedByName: string | null;
    verifiedByName: string | null;
    verifiedAt: string | null;
    createdAt: string;
  }>;
  expenses: Array<{ id: string; amount: number; description: string; expenseDate: string; createdByName: string | null }>;
  ledger: Array<{
    id: string;
    type: string;
    direction: "CREDIT" | "DEBIT";
    amount: number;
    entryDate: string;
    remarks: string | null;
    member: { id: string; name: string } | null;
  }>;
  audit: Array<{
    id: string;
    action: string;
    actorName: string | null;
    actorRole: string;
    createdAt: string;
    before: unknown;
    after: unknown;
  }>;
  totals: { received: number; remaining: number; extra: number; pendingCount: number; agreedAmount: number };
  needsExtraDecision: number | null;
};

// Stripped payload returned to the filing department (serializeFilingCase,
// docs 06 §N7): no payments / amounts / commission / ledger at all.
export type FilingCaseDetail = {
  id: string;
  caseNumber: string;
  category: { name: string } | null;
  rollNumber: string | null;
  registrationNumber: string | null;
  notes: string | null;
  status: string;
  setName: string | null;
  clientPictureType: string | null;
  clientPictureUrl: string | null;
};

// GET /api/office/cases/[id]/files item.
export type CaseFileItem = {
  id: string;
  department: "FILING" | "PRINTING" | "ATTA" | "COURIER";
  stepKey: string | null;
  title: string | null;
  fileType: "pdf" | "image" | "video";
  createdAt: string;
  uploadedByName: string | null;
  url: string;
};

// GET /api/office/setup/sets item (with r-number dim info).
export type CategorySetWithSteps = {
  id: string;
  categoryId: string;
  name: string;
  order: number;
  dimmed: boolean;
  reason: string | null;
  steps: Array<{ id: string; stepKey: string; label: string; order: number }>;
};

// GET /api/office/cases/[id]/remarks item.
export type CaseRemarkItem = {
  id: string;
  text: string;
  createdById: string;
  createdByRole: string;
  createdByName: string | null;
  createdAt: string;
  mine: boolean;
  targets: Array<{ recipientId: string; target: string; seenAt: string | null; forMe: boolean }>;
};

// DiscountRequest row (GET /api/office/cases/[id]/discount-requests).
export type DiscountRequestItem = {
  id: string;
  caseId: string;
  amount: number;
  reason: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  deductFrom: "COMMISSION" | "PROFIT" | "PARTIAL" | null;
  decidedAt: string | null;
  createdAt: string;
};

// BonusRequest row (GET /api/office/bonus-requests).
export type BonusRequestItem = {
  id: string;
  bookingOfficeId: string;
  caseId: string | null;
  amount: number;
  reason: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  deductFrom: "COMMISSION" | "PROFIT" | null;
  decidedAt: string | null;
  createdAt: string;
  bookingOffice: { id: string; name: string };
  case: { id: string; caseNumber: string; clientName: string } | null;
};

export const inputClass =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";
export const primaryBtnClass =
  "inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
export const ghostBtnClass = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";
