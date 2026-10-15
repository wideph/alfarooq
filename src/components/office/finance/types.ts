import type { BookingOfficeType } from "@/lib/office/permissions";

// Finance contracts (wave 16). The API responses are normalized here so the
// UI code only deals with ONE canonical shape — the normalizers below accept
// both the new contract payloads and the previous field names (name →
// memberName, totalEarning → earning, {users} → {rows}, raw array → {expenses}).

/* ------------------------------ Users (contract 1) ------------------------------ */

export type FinanceUserRow = {
  memberId: string;
  memberName: string;
  userName: string | null;
  officeId: string;
  officeName: string;
  officeType: BookingOfficeType;
  percent: number;
  earning: number;
  expenseShare: number;
  wasool: number;
  due: number;
};

export type FinanceUsersPayload = {
  rows: FinanceUserRow[];
  totals: { earning: number; expenseShare: number; wasool: number; due: number };
};

function num(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalizeUserRow(raw: any): FinanceUserRow {
  const earning = num(raw?.earning ?? raw?.totalEarning);
  const expenseShare = num(raw?.expenseShare);
  const wasool = num(raw?.wasool);
  return {
    memberId: String(raw?.memberId ?? raw?.id ?? ""),
    memberName: String(raw?.memberName ?? raw?.name ?? "—"),
    userName: raw?.userName ? String(raw.userName) : null,
    officeId: String(raw?.officeId ?? raw?.bookingOffice?.id ?? ""),
    officeName: String(raw?.officeName ?? raw?.bookingOffice?.name ?? "—"),
    officeType: (raw?.officeType ?? raw?.bookingOffice?.type ?? "FIXED_COMMISSION") as BookingOfficeType,
    percent: num(raw?.percent ?? raw?.profitPercent),
    earning,
    expenseShare,
    wasool,
    due: num(raw?.due ?? earning - expenseShare - wasool),
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeUsersPayload(data: any): FinanceUsersPayload {
  const list: unknown[] = Array.isArray(data) ? data : data?.rows ?? data?.users ?? [];
  const rows = list.map(normalizeUserRow).filter((row) => row.memberId);
  const totals = data?.totals
    ? {
        earning: num(data.totals.earning ?? data.totals.totalEarning),
        expenseShare: num(data.totals.expenseShare),
        wasool: num(data.totals.wasool),
        due: num(data.totals.due),
      }
    : rows.reduce(
        (acc, row) => ({
          earning: acc.earning + row.earning,
          expenseShare: acc.expenseShare + row.expenseShare,
          wasool: acc.wasool + row.wasool,
          due: acc.due + row.due,
        }),
        { earning: 0, expenseShare: 0, wasool: 0, due: 0 }
      );
  return { rows, totals };
}

/* --------------------------- Member detail (contract 2) --------------------------- */

export type MemberEarningEntry = {
  id: string;
  date: string;
  type: string;
  direction: "CREDIT" | "DEBIT";
  amount: number;
  caseId: string | null;
  caseNumber: string | null;
  remarks: string | null;
};

export type MemberExpenseEntry = {
  id: string;
  entryDate: string;
  description: string;
  amount: number;
};

export type MemberPayoutEntry = {
  id: string;
  date: string;
  method: string | null;
  amount: number;
  remarks: string | null;
};

export type MemberSummary = { earning: number; expenseShare: number; wasool: number; due: number };

export type MemberFinanceDetail = {
  member: {
    memberId: string;
    name: string;
    officeId: string;
    officeName: string;
    officeType: BookingOfficeType;
    percent: number;
  };
  earnings: MemberEarningEntry[];
  expenses: MemberExpenseEntry[];
  payouts: MemberPayoutEntry[];
  summary: MemberSummary;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeMemberDetail(data: any): MemberFinanceDetail {
  const member = data?.member ?? {};
  const earning = num(data?.summary?.earning ?? data?.totals?.totalEarning);
  const expenseShare = num(data?.summary?.expenseShare);
  const wasool = num(data?.summary?.wasool ?? data?.totals?.wasool);
  return {
    member: {
      memberId: String(member?.memberId ?? member?.id ?? ""),
      name: String(member?.name ?? member?.memberName ?? "—"),
      officeId: String(member?.officeId ?? ""),
      officeName: String(member?.officeName ?? "—"),
      officeType: (member?.officeType ?? "FIXED_COMMISSION") as BookingOfficeType,
      percent: num(member?.percent ?? member?.profitPercent),
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    earnings: (Array.isArray(data?.earnings) ? data.earnings : []).map((e: any) => ({
      id: String(e?.id ?? ""),
      date: String(e?.date ?? e?.entryDate ?? ""),
      type: String(e?.type ?? ""),
      direction: (e?.direction === "DEBIT" ? "DEBIT" : "CREDIT") as "CREDIT" | "DEBIT",
      amount: num(e?.amount),
      caseId: e?.caseId ? String(e.caseId) : null,
      caseNumber: e?.caseNumber ? String(e.caseNumber) : null,
      remarks: e?.remarks ? String(e.remarks) : null,
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expenses: (Array.isArray(data?.expenses) ? data.expenses : []).map((e: any) => ({
      id: String(e?.id ?? ""),
      entryDate: String(e?.entryDate ?? e?.date ?? e?.expenseDate ?? ""),
      description: String(e?.description ?? e?.remarks ?? "Office expense"),
      amount: num(e?.amount),
    })),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payouts: (Array.isArray(data?.payouts) ? data.payouts : []).map((p: any) => ({
      id: String(p?.id ?? ""),
      date: String(p?.date ?? p?.entryDate ?? ""),
      method: p?.method ? String(p.method) : null,
      amount: num(p?.amount),
      remarks: p?.remarks ? String(p.remarks) : null,
    })),
    summary: {
      earning,
      expenseShare,
      wasool,
      due: num(data?.summary?.due ?? data?.totals?.due ?? earning - expenseShare - wasool),
    },
  };
}

/* ------------------------- Office expenses (contract 3) ------------------------- */

export type OfficeExpenseAllocation = { memberId: string; memberName: string; amount: number };

export type OfficeExpenseItem = {
  id: string;
  officeId: string;
  officeName: string;
  officeType: BookingOfficeType | null;
  entryDate: string;
  description: string;
  amount: number;
  allocations: OfficeExpenseAllocation[];
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function normalizeOfficeExpenses(data: any): OfficeExpenseItem[] {
  const list: unknown[] = Array.isArray(data) ? data : data?.expenses ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return list.map((raw: any) => ({
    id: String(raw?.id ?? ""),
    officeId: String(raw?.officeId ?? raw?.bookingOfficeId ?? raw?.bookingOffice?.id ?? ""),
    officeName: String(raw?.officeName ?? raw?.bookingOffice?.name ?? "—"),
    officeType: (raw?.officeType ?? raw?.bookingOffice?.type ?? null) as BookingOfficeType | null,
    entryDate: String(raw?.entryDate ?? raw?.expenseDate ?? ""),
    description: String(raw?.description ?? ""),
    amount: num(raw?.amount),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    allocations: (Array.isArray(raw?.allocations) ? raw.allocations : []).map((a: any) => ({
      memberId: String(a?.memberId ?? ""),
      memberName: String(a?.memberName ?? a?.name ?? "—"),
      amount: num(a?.amount),
    })),
  }));
}

/* ------------------------- Payments / payouts (unchanged) ------------------------- */

export type PaymentRow = {
  id: string;
  amount: number;
  paymentDate: string;
  method: string;
  reference: string | null;
  remarks: string | null;
  submittedByName: string | null;
  case: {
    id: string;
    caseNumber: string;
    clientName: string;
    bookingOffice: { id: string; name: string } | null;
  };
};

export type PaymentsResponse = { items: PaymentRow[]; total: number; page: number; pageSize: number };

export type PayoutRequestRow = {
  id: string;
  amount: number;
  method: string | null;
  entryDate: string;
  remarks: string | null;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  createdAt: string;
  createdByName?: string | null;
  member: { id: string; name: string; adminId: string | null } | null;
  bookingOffice: { id: string; name: string } | null;
};

/* --------------------------- Finance report (existing) --------------------------- */

export type FinanceReportOffice = {
  id: string;
  name: string;
  type: BookingOfficeType;
  income: number;
  commissions: number;
  salaries: number;
  officeExpenses: number;
};

export type FinanceReport = {
  from: string;
  to: string;
  summary: {
    income: number;
    commissions: number;
    caseExpenses: number;
    salaries: number;
    otherExpenses: number;
    officeExpenses: number;
    officeExpensesTotal: number;
    profit: number;
    liabilities: number;
    paymentsCount: number;
  };
  offices: FinanceReportOffice[];
};

/* --------------------------------- Ledger --------------------------------- */

export type LedgerEntry = {
  id: string;
  type: string;
  direction: "CREDIT" | "DEBIT";
  amount: number;
  entryDate: string;
  method: string | null;
  remarks: string | null;
  bookingOffice: { id: string; name: string };
  member: { id: string; name: string } | null;
  case: { id: string; caseNumber: string; clientName: string } | null;
};

export type LedgerResponse = {
  items: LedgerEntry[];
  total: number;
  page: number;
  pageSize: number;
  officeBalances: Record<string, number>;
  memberBalances: Record<string, number>;
  memberBalance?: number | null;
};

/* ------------------------------ Labels / grouping ------------------------------ */

export const OFFICE_TYPE_SHORT: Record<BookingOfficeType, string> = {
  FIXED_COMMISSION: "Fixed Commission",
  PROFIT_SHARE: "Profit Share",
  SALARY: "Salary",
};

export const EARNING_TYPE_LABELS: Record<string, string> = {
  COMMISSION_HALF: "Commission 50%",
  COMMISSION_FINAL: "Commission full",
  COMMISSION_ADJUST: "Commission adjust",
  PROFIT_SHARE: "Profit share",
  EXTRA_SHARE: "Extra share",
  BONUS: "Bonus",
  ADJUSTMENT: "Adjustment",
};

export type OfficeGroup = {
  officeId: string;
  officeName: string;
  officeType: BookingOfficeType;
  rows: FinanceUserRow[];
};

export function groupUsersByOffice(rows: FinanceUserRow[]): OfficeGroup[] {
  const map = new Map<string, OfficeGroup>();
  for (const row of rows) {
    let group = map.get(row.officeId);
    if (!group) {
      group = { officeId: row.officeId, officeName: row.officeName, officeType: row.officeType, rows: [] };
      map.set(row.officeId, group);
    }
    group.rows.push(row);
  }
  return Array.from(map.values()).sort((a, b) => a.officeName.localeCompare(b.officeName));
}
