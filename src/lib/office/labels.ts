// Shared UI labels/colours for office pages (client-safe, no server imports).

export const STATUS_LABELS: Record<string, string> = {
  NEW: "New",
  PAYMENT_PENDING: "Payment pending",
  WAITING_FOR_FILE: "Waiting for file",
  WAITING_FOR_PRINTING: "Waiting for printing",
  IN_PROCESS: "In process",
  PRINTED: "Printed",
  ATTESTATION: "Attestation",
  COMPLETED: "Completed",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

export const STATUS_STYLES: Record<string, string> = {
  NEW: "bg-slate-100 text-slate-700",
  PAYMENT_PENDING: "bg-amber-100 text-amber-700",
  WAITING_FOR_FILE: "bg-orange-100 text-orange-700",
  WAITING_FOR_PRINTING: "bg-cyan-100 text-cyan-700",
  IN_PROCESS: "bg-blue-100 text-blue-700",
  PRINTED: "bg-indigo-100 text-indigo-700",
  ATTESTATION: "bg-violet-100 text-violet-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  DELIVERED: "bg-emerald-200 text-emerald-800",
  CANCELLED: "bg-red-100 text-red-700",
};

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
