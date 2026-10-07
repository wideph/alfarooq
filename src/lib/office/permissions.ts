import type { AdminPermission } from "@/lib/auth";

// Keep this file free of server-only imports: it is used by client components too.

export const OFFICE_ROLES = ["cashier", "attestation", "booking_office"] as const;
export type OfficeRole = (typeof OFFICE_ROLES)[number];

export const ROLE_LABELS: Record<string, string> = {
  admin: "Super admin",
  sub_admin: "Sub-admin (website)",
  cashier: "Cashier",
  attestation: "Attestation office",
  booking_office: "Booking office",
};

export function isOfficeRole(role?: string | null): role is OfficeRole {
  return OFFICE_ROLES.includes(role as OfficeRole);
}

// Default permission set per role (docs/office-module/02_ARCHITECTURE.md §2).
// Super admin may still tick extra permissions per user.
export const ROLE_PRESETS: Record<OfficeRole, AdminPermission[]> = {
  cashier: [
    "office:cases:read",
    "office:payments:verify",
    "office:ledger:read",
    "office:ledger:write",
    "office:expenses:write",
  ],
  attestation: ["office:cases:read", "office:attestation:write"],
  booking_office: ["office:cases:read", "office:cases:write", "office:payments:submit"],
};

export const OFFICE_PERMISSION_GROUPS: Array<{
  key: string;
  label: string;
  permissions: Array<{ value: AdminPermission; label: string }>;
}> = [
  {
    key: "cases",
    label: "Cases",
    permissions: [
      { value: "office:cases:read", label: "Cases dekhein" },
      { value: "office:cases:write", label: "Cases add / edit" },
    ],
  },
  {
    key: "payments",
    label: "Payments",
    permissions: [
      { value: "office:payments:submit", label: "Payment slip submit" },
      { value: "office:payments:verify", label: "Payment accept / reject" },
    ],
  },
  {
    key: "attestation",
    label: "Attestation",
    permissions: [
      { value: "office:attestation:write", label: "Print / attestation status" },
    ],
  },
  {
    key: "ledger",
    label: "Ledger",
    permissions: [
      { value: "office:ledger:read", label: "Office accounts dekhein" },
      { value: "office:ledger:write", label: "Payout / commission / profit share" },
    ],
  },
  {
    key: "expenses",
    label: "Expenses",
    permissions: [{ value: "office:expenses:write", label: "Expenses & salaries" }],
  },
  {
    key: "finance",
    label: "Finance",
    permissions: [{ value: "office:finance:read", label: "Company income report" }],
  },
  {
    key: "setup",
    label: "Setup",
    permissions: [{ value: "office:setup:write", label: "Offices / categories / attestation types" }],
  },
];

export const ALL_OFFICE_PERMISSIONS: AdminPermission[] = OFFICE_PERMISSION_GROUPS.flatMap(
  (group) => group.permissions.map((permission) => permission.value)
);

export const BOOKING_OFFICE_TYPES = ["FIXED_COMMISSION", "PROFIT_SHARE", "SALARY"] as const;
export type BookingOfficeType = (typeof BOOKING_OFFICE_TYPES)[number];
export const BOOKING_OFFICE_TYPE_LABELS: Record<BookingOfficeType, string> = {
  FIXED_COMMISSION: "Fixed commission (per category)",
  PROFIT_SHARE: "Profit share (%)",
  SALARY: "Salary based",
};

export const CASE_STATUSES = [
  "NEW",
  "PAYMENT_PENDING",
  "IN_PROCESS",
  "PRINTED",
  "ATTESTATION",
  "COMPLETED",
  "DELIVERED",
  "CANCELLED",
] as const;
export type CaseStatus = (typeof CASE_STATUSES)[number];

export const PAYMENT_STATUSES = ["PENDING", "RECEIVED", "NOT_RECEIVED", "BOGUS"] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_METHODS = ["CASH", "BANK", "EASYPAISA", "JAZZCASH", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const ATTESTATION_STATUSES = ["PENDING", "IN_PROGRESS", "DONE"] as const;
export type AttestationStatus = (typeof ATTESTATION_STATUSES)[number];
