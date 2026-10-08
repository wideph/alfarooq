// Shared UI labels/colours for office pages (client-safe, no server imports).

// WAVE 11 §W11.1 — labels MUST match the spec table exactly.
export const STATUS_LABELS: Record<string, string> = {
  FIRST_PAYMENT_PENDING: "1st payment pending",
  WAITING_FOR_FILE: "Waiting for file",
  WAITING_FOR_PRINTING: "Waiting for printing",
  PRINTED: "Printed",
  ATTESTATION: "Attestation",
  ATTESTATION_COMPLETE: "Attestation complete — final payment pending",
  WAITING_FOR_COURIER: "Payment complete — waiting for courier",
  DELIVERED: "Delivered",
  MUSADIQA_APPLIED: "Musadiqa applied",
  MUSADIQA_FEES_PAID: "Fees paid for Musadiqa",
  MUSADIQA_SENT_BY_BOARD: "Musadiqa verification sent by board",
  MUSADIQA_VERIFIED: "Musadiqa verified",
  CANCELLED: "Cancelled",
  // Legacy fallbacks (migrated in DB, kept for old rows).
  NEW: "New",
  PAYMENT_PENDING: "Payment pending",
  IN_PROCESS: "In process",
  COMPLETED: "Completed",
};

// Distinct low-saturation chip colours per status.
export const STATUS_STYLES: Record<string, string> = {
  FIRST_PAYMENT_PENDING: "bg-amber-100 text-amber-700",
  WAITING_FOR_FILE: "bg-orange-100 text-orange-700",
  WAITING_FOR_PRINTING: "bg-cyan-100 text-cyan-700",
  PRINTED: "bg-indigo-100 text-indigo-700",
  ATTESTATION: "bg-violet-100 text-violet-700",
  ATTESTATION_COMPLETE: "bg-emerald-100 text-emerald-700",
  WAITING_FOR_COURIER: "bg-teal-100 text-teal-700",
  DELIVERED: "bg-emerald-200 text-emerald-800",
  MUSADIQA_APPLIED: "bg-sky-100 text-sky-700",
  MUSADIQA_FEES_PAID: "bg-lime-100 text-lime-800",
  MUSADIQA_SENT_BY_BOARD: "bg-fuchsia-100 text-fuchsia-700",
  MUSADIQA_VERIFIED: "bg-green-100 text-green-800",
  CANCELLED: "bg-red-100 text-red-700",
  // Legacy fallbacks.
  NEW: "bg-slate-100 text-slate-700",
  PAYMENT_PENDING: "bg-amber-100 text-amber-700",
  IN_PROCESS: "bg-blue-100 text-blue-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
};

// §W11.1/W11.3 — ek nazar mein sahi status label. ATTESTATION dynamic hai:
// current attestation ka naam mile to "Attestation: <name>", warna plain label.
export function caseStatusLabel(status: string, currentAttestationName?: string | null): string {
  if (status === "ATTESTATION" && currentAttestationName) {
    return `Attestation: ${currentAttestationName}`;
  }
  return STATUS_LABELS[status] || status;
}

// Chip colours — har jagah same style (fallback slate).
export function caseStatusStyle(status: string): string {
  return STATUS_STYLES[status] || "bg-slate-100 text-slate-700";
}

export const PAYMENT_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending verify",
  RECEIVED: "Received",
  NOT_RECEIVED: "Not received",
  BOGUS: "Bogus",
};

export const PAYMENT_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  RECEIVED: "bg-emerald-100 text-emerald-700",
  NOT_RECEIVED: "bg-slate-200 text-slate-700",
  BOGUS: "bg-red-100 text-red-700",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  CASH: "Cash",
  BANK: "Bank account",
  EASYPAISA: "Easypaisa",
  JAZZCASH: "JazzCash",
  OTHER: "Other",
};

export const ATTESTATION_STATUS_LABELS: Record<string, string> = {
  PENDING: "Pending",
  IN_PROGRESS: "In progress",
  DONE: "Done",
};

export const ATTESTATION_STATUS_STYLES: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  IN_PROGRESS: "bg-violet-100 text-violet-700",
  DONE: "bg-emerald-100 text-emerald-700",
};

export const LEDGER_TYPE_LABELS: Record<string, string> = {
  COMMISSION_HALF: "Commission (half)",
  COMMISSION_FINAL: "Commission (final)",
  COMMISSION_ADJUST: "Commission adjust",
  EXTRA_SHARE: "Extra amount share",
  PROFIT_SHARE: "Profit share",
  PAYOUT: "Payout",
  ADJUSTMENT: "Adjustment",
  EXPENSE: "Office expense",
};
