"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Loader2, Users, Wallet, X } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import { adminCanAny, type AdminNavUser } from "@/components/admin/AdminNav";
import { formatDate, formatMoney, officeFetch, todayInputDate } from "@/lib/office/client";
import { LEDGER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { BOOKING_OFFICE_TYPE_LABELS, PAYMENT_METHODS, type BookingOfficeType } from "@/lib/office/permissions";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";

// §W12.3 — merged Finance page. Admin/cashier: (a) compact company summary
// strip, (b) payments received (case/office/submitter ke saath), (c) users
// earnings table + per-member drawer. Booking-office role: apne office ka
// scoped ledger view (purana /office/ledger experience).

type Report = {
  from: string;
  to: string;
  summary: {
    income: number;
    commissions: number;
    caseExpenses: number;
    salaries: number;
    otherExpenses: number;
    profit: number;
    liabilities: number;
    paymentsCount: number;
  };
};

type PaymentRow = {
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

type PaymentsResponse = { items: PaymentRow[]; total: number; page: number; pageSize: number };

type UserEarningRow = {
  memberId: string;
  name: string;
  officeId: string;
  officeName: string;
  officeType: BookingOfficeType;
  totalEarning: number;
  wasool: number;
  due: number;
  adminId: string | null;
};

type MemberDetail = {
  member: { memberId: string; name: string; officeName: string; officeType: BookingOfficeType; profitPercent: number };
  earnings: Array<{ id: string; date: string; type: string; amount: number; caseId: string | null; caseNumber: string | null; remarks: string | null }>;
  payouts: Array<{ id: string; date: string; method: string | null; amount: number; remarks: string | null }>;
  totals: { totalEarning: number; wasool: number; due: number };
};

// Earning type labels (Roman Urdu / short English).
const EARNING_TYPE_LABELS: Record<string, string> = {
  COMMISSION_HALF: "Commission 50%",
  COMMISSION_FINAL: "Commission full",
  COMMISSION_ADJUST: "Commission adjust",
  PROFIT_SHARE: "Profit share",
  EXTRA_SHARE: "Extra share",
  BONUS: "Bonus",
  ADJUSTMENT: "Adjustment",
};

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";
const primaryBtn =
  "inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";

export default function OfficeFinancePage() {
  return (
    <OfficePageFrame requiredAny={["office:finance:read", "office:ledger:read", "office:cases:read"]}>
      {(admin) =>
        admin.role === "booking_office" ? (
          <BookingOfficeLedgerView admin={admin} />
        ) : adminCanAny(admin, ["office:finance:read"]) ? (
          <FinanceDashboard />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
            Is page ke liye permission zaroori hai
          </div>
        )
      }
    </OfficePageFrame>
  );
}

/* ------------------------- Admin / cashier dashboard ------------------------- */

function FinanceDashboard() {
  const [preset, setPreset] = useState<"today" | "week" | "month" | "custom">("month");
  const [from, setFrom] = useState(todayInputDate().slice(0, 8) + "01");
  const [to, setTo] = useState(todayInputDate());
  const [report, setReport] = useState<Report | null>(null);
  const [reportLoading, setReportLoading] = useState(true);
  const [reportError, setReportError] = useState("");

  const [payments, setPayments] = useState<PaymentsResponse | null>(null);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [paymentsPage, setPaymentsPage] = useState(1);

  const [users, setUsers] = useState<UserEarningRow[] | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);

  const [selectedMember, setSelectedMember] = useState<UserEarningRow | null>(null);

  const loadReport = useCallback(
    async (silent = false) => {
      if (!silent) setReportLoading(true);
      setReportError("");
      const query = preset === "custom" ? `from=${from}&to=${to}` : `preset=${preset}`;
      const res = await officeFetch<Report>(`/api/office/finance?${query}`);
      if (res.ok) setReport(res.data);
      else if (!silent) setReportError(res.error);
      if (!silent) setReportLoading(false);
    },
    [preset, from, to]
  );

  const loadPayments = useCallback(
    async (page: number, silent = false) => {
      if (!silent) setPaymentsLoading(true);
      const res = await officeFetch<PaymentsResponse>(`/api/office/payments?status=RECEIVED&page=${page}`);
      if (res.ok) setPayments(res.data);
      if (!silent) setPaymentsLoading(false);
    },
    []
  );

  const loadUsers = useCallback(async (silent = false) => {
    if (!silent) setUsersLoading(true);
    const res = await officeFetch<{ users: UserEarningRow[] }>("/api/office/finance/users");
    if (res.ok) setUsers(res.data.users);
    if (!silent) setUsersLoading(false);
  }, []);

  useEffect(() => {
    if (preset !== "custom") void loadReport();
  }, [preset, loadReport]);

  useEffect(() => {
    void loadPayments(paymentsPage);
  }, [paymentsPage, loadPayments]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  // §W12.3: live refresh (silent — spinner flash nahi).
  useLiveRefresh(
    useCallback(() => {
      void loadReport(true);
      void loadPayments(paymentsPage, true);
      void loadUsers(true);
    }, [loadReport, loadPayments, loadUsers, paymentsPage])
  );

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-slate-900">Finance</h2>

      {/* (a) Company summary strip */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          {(["today", "week", "month", "custom"] as const).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPreset(p)}
              className={`min-h-[40px] rounded-xl px-4 py-2.5 text-sm font-semibold ${
                preset === p ? "bg-primary-600 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {p === "today" ? "Aaj" : p === "week" ? "Is hafte" : p === "month" ? "Is mahine" : "Custom"}
            </button>
          ))}
          {preset === "custom" && (
            <>
              <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
              <span className="text-slate-400">to</span>
              <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
              <button type="button" onClick={() => void loadReport()} className={primaryBtn}>
                Show
              </button>
            </>
          )}
        </div>

        {reportError && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{reportError}</p>}

        {reportLoading && !report ? (
          <SummarySkeleton />
        ) : report ? (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <SummaryTile label="Income (received)" value={report.summary.income} tone="emerald" />
              <SummaryTile label="Commissions / shares" value={report.summary.commissions} tone="amber" />
              <SummaryTile
                label="Expenses"
                value={report.summary.caseExpenses + report.summary.salaries + report.summary.otherExpenses}
                tone="amber"
              />
              <SummaryTile
                label="Net profit"
                value={report.summary.profit}
                tone={report.summary.profit >= 0 ? "primary" : "red"}
              />
              <div className="col-span-2 flex flex-col justify-center rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:col-span-3 lg:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {formatDate(report.from)} — {formatDate(report.to)} · {report.summary.paymentsCount} payments
                </p>
                <p className="mt-0.5 text-sm text-slate-600">
                  Offices ko dena hai (all time):{" "}
                  <span className={report.summary.liabilities > 0 ? "font-bold text-amber-700" : "font-semibold text-slate-800"}>
                    {formatMoney(report.summary.liabilities)}
                  </span>
                </p>
              </div>
            </div>
          </>
        ) : null}
      </section>

      {/* (b) Payments received */}
      <section className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
            <Wallet className="h-4 w-4 text-emerald-600" />
            Payments received
            {payments && (
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                {payments.total}
              </span>
            )}
          </h3>
          {payments && payments.total > payments.pageSize && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Pichla page"
                disabled={paymentsPage <= 1}
                onClick={() => setPaymentsPage((p) => Math.max(1, p - 1))}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-500">
                {payments.page} / {Math.max(1, Math.ceil(payments.total / payments.pageSize))}
              </span>
              <button
                type="button"
                aria-label="Agla page"
                disabled={paymentsPage * payments.pageSize >= payments.total}
                onClick={() => setPaymentsPage((p) => p + 1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          {paymentsLoading && !payments ? (
            <TableSkeleton rows={5} />
          ) : !payments || payments.items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-400">Koi received payment nahi</p>
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="divide-y divide-slate-100 md:hidden">
                {payments.items.map((p) => (
                  <li key={p.id} className="space-y-1 p-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-emerald-700">{formatMoney(p.amount)}</span>
                      <span className="text-xs text-slate-500">
                        {PAYMENT_METHOD_LABELS[p.method] || p.method} · {formatDate(p.paymentDate)}
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
                      <Link href={`/office/cases/${p.case.id}`} className="font-semibold text-primary-700 hover:underline">
                        {p.case.caseNumber}
                      </Link>
                      <span>· {p.case.clientName}</span>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {p.case.bookingOffice?.name || "—"}
                      {p.submittedByName ? ` · submit: ${p.submittedByName}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
              {/* Desktop table */}
              <table className="hidden min-w-full text-sm md:table">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                    <th className="px-3 py-2">Method</th>
                    <th className="px-3 py-2">Case</th>
                    <th className="px-3 py-2">Client</th>
                    <th className="px-3 py-2">Office</th>
                    <th className="px-3 py-2">Submitted by</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {payments.items.map((p) => (
                    <tr key={p.id}>
                      <td className="whitespace-nowrap px-3 py-2">{formatDate(p.paymentDate)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-emerald-700">
                        {formatMoney(p.amount)}
                      </td>
                      <td className="px-3 py-2">{PAYMENT_METHOD_LABELS[p.method] || p.method}</td>
                      <td className="px-3 py-2">
                        <Link href={`/office/cases/${p.case.id}`} className="font-semibold text-primary-700 hover:underline">
                          {p.case.caseNumber}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{p.case.clientName}</td>
                      <td className="px-3 py-2">{p.case.bookingOffice?.name || "—"}</td>
                      <td className="px-3 py-2 text-slate-500">{p.submittedByName || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      </section>

      {/* (c) Users earnings */}
      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          <Users className="h-4 w-4 text-primary-600" />
          Users earnings
          {users && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{users.length}</span>
          )}
        </h3>
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          {usersLoading && !users ? (
            <TableSkeleton rows={5} />
          ) : !users || users.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-slate-400">Koi active member nahi</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">User</th>
                  <th className="px-3 py-2">Office</th>
                  <th className="px-3 py-2 text-right">Total earning</th>
                  <th className="px-3 py-2 text-right">Wasool</th>
                  <th className="px-3 py-2 text-right">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr
                    key={u.memberId}
                    onClick={() => setSelectedMember(u)}
                    className="cursor-pointer transition-colors hover:bg-slate-50"
                  >
                    <td className="px-3 py-2.5 font-semibold text-slate-800">{u.name}</td>
                    <td className="px-3 py-2.5">
                      {u.officeName}
                      <span className="block text-xs text-slate-400">{BOOKING_OFFICE_TYPE_LABELS[u.officeType]}</span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-emerald-700">{formatMoney(u.totalEarning)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right text-slate-700">{formatMoney(u.wasool)}</td>
                    <td
                      className={`whitespace-nowrap px-3 py-2.5 text-right font-bold ${
                        u.due > 0 ? "text-amber-700" : u.due < 0 ? "text-red-700" : "text-slate-500"
                      }`}
                    >
                      {formatMoney(u.due)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {selectedMember && <UserDrawer member={selectedMember} onClose={() => setSelectedMember(null)} />}
    </div>
  );
}

/* ------------------------- User detail slide-over ------------------------- */

function UserDrawer({ member, onClose }: { member: UserEarningRow; onClose: () => void }) {
  const [detail, setDetail] = useState<MemberDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError("");
    officeFetch<MemberDetail>(`/api/office/finance/users/${member.memberId}`).then((res) => {
      if (cancelled) return;
      if (res.ok) setDetail(res.data);
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [member.memberId]);

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Band karein"
        className="absolute inset-0 cursor-default bg-slate-900/40"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{member.name}</p>
            <p className="text-xs text-slate-500">
              {member.officeName} · {BOOKING_OFFICE_TYPE_LABELS[member.officeType]}
            </p>
          </div>
          <button
            type="button"
            aria-label="Band karein"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          {!detail && !error ? (
            <div className="space-y-3 animate-pulse" aria-label="Detail load ho raha hai">
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="rounded-xl border border-slate-200 p-3">
                    <div className="h-3 w-2/3 rounded bg-slate-200" />
                    <div className="mt-2 h-4 w-1/2 rounded bg-slate-100" />
                  </div>
                ))}
              </div>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : detail ? (
            <>
              <div className="grid grid-cols-3 gap-2">
                <DrawerStat label="Total earning" value={detail.totals.totalEarning} tone="emerald" />
                <DrawerStat label="Wasool" value={detail.totals.wasool} tone="slate" />
                <DrawerStat
                  label="Due"
                  value={detail.totals.due}
                  tone={detail.totals.due > 0 ? "amber" : detail.totals.due < 0 ? "red" : "slate"}
                />
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Earning kaise hui</p>
                {detail.earnings.length === 0 ? (
                  <p className="rounded-xl border border-slate-100 px-3 py-3 text-sm text-slate-400">Koi earning entry nahi</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {detail.earnings.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800">{EARNING_TYPE_LABELS[e.type] || e.type}</p>
                          <p className="text-xs text-slate-500">
                            {formatDate(e.date)}
                            {e.caseNumber && e.caseId && (
                              <>
                                {" · "}
                                <Link href={`/office/cases/${e.caseId}`} className="text-primary-700 hover:underline">
                                  {e.caseNumber}
                                </Link>
                              </>
                            )}
                            {e.remarks ? ` · ${e.remarks}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold text-emerald-700">{formatMoney(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Wasooli / payouts</p>
                {detail.payouts.length === 0 ? (
                  <p className="rounded-xl border border-slate-100 px-3 py-3 text-sm text-slate-400">Koi payout nahi</p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {detail.payouts.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800">
                            {p.method ? PAYMENT_METHOD_LABELS[p.method] || p.method : "Payout"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDate(p.date)}
                            {p.remarks ? ` · ${p.remarks}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold text-amber-700">{formatMoney(p.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function DrawerStat({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "red" | "slate" }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-800",
    slate: "border-slate-200 bg-slate-50 text-slate-800",
  };
  return (
    <div className={`rounded-xl border p-3 ${tones[tone]}`}>
      <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold">{formatMoney(value)}</p>
    </div>
  );
}

/* ----------------- Booking office — scoped own-office ledger ----------------- */

type BookingOffice = {
  id: string;
  name: string;
  type: BookingOfficeType;
  members: Array<{ id: string; name: string; profitPercent: number; isActive: boolean }>;
};

type LedgerEntry = {
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

type LedgerResponse = {
  items: LedgerEntry[];
  total: number;
  officeBalances: Record<string, number>;
  memberBalances: Record<string, number>;
};

// §W12.3: booking-office role ka purana ledger experience — apne office ka
// balance, member balances, entries aur (permission ho to) payout form.
function BookingOfficeLedgerView({ admin }: { admin: AdminNavUser }) {
  const canPayout = adminCanAny(admin, ["office:ledger:write"]);

  const [offices, setOffices] = useState<BookingOffice[]>([]);
  const [officeId, setOfficeId] = useState("");
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastData | null>(null);
  const setMessage = (m: string, kind: ToastKind = "success") => setToast(m ? { message: m, kind } : null);
  const [payout, setPayout] = useState({ memberId: "", amount: "", entryDate: todayInputDate(), method: "CASH", remarks: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    officeFetch<BookingOffice[]>("/api/office/setup/booking-offices").then((res) => {
      if (res.ok) {
        setOffices(res.data);
        if (res.data[0]) setOfficeId(res.data[0].id);
      }
    });
  }, []);

  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      const res = await officeFetch<LedgerResponse>(`/api/office/ledger${officeId ? `?officeId=${officeId}` : ""}`);
      if (res.ok) setData(res.data);
      else if (!silent) setMessage(res.error, "error");
      if (!silent) setLoading(false);
    },
    [officeId]
  );

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(useCallback(() => void load(true), [load]));

  const office = offices.find((o) => o.id === officeId) || null;

  async function submitPayout() {
    if (!officeId) return;
    setSaving(true);
    const res = await officeFetch("/api/office/ledger", { method: "POST", json: { ...payout, bookingOfficeId: officeId } });
    setMessage(res.ok ? "Payout record ho gaya" : res.error, res.ok ? "success" : "error");
    if (res.ok) {
      setPayout({ memberId: "", amount: "", entryDate: todayInputDate(), method: "CASH", remarks: "" });
      await load();
    }
    setSaving(false);
  }

  return (
    <div className="space-y-4">
      <h2 className="text-xl font-bold text-slate-900">Finance — apne office ka hisaab</h2>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {data && (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {(officeId ? [officeId] : Object.keys(data.officeBalances)).map((id) => {
            const o = offices.find((x) => x.id === id);
            const balance = data.officeBalances[id] || 0;
            return (
              <div
                key={id}
                className={`rounded-2xl border p-4 shadow-sm ${
                  balance < 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"
                }`}
              >
                <p className="text-xs font-semibold uppercase text-slate-500">{o?.name || "Office"}</p>
                <p className={`mt-1 text-2xl font-bold ${balance < 0 ? "text-red-700" : "text-slate-900"}`}>
                  {formatMoney(balance)}
                </p>
                <p className="text-xs text-slate-400">{balance >= 0 ? "Company owes office" : "Office ne advance liya"}</p>
              </div>
            );
          })}
          {office &&
            office.members
              .filter((m) => data.memberBalances[m.id] !== undefined || office.type === "PROFIT_SHARE")
              .map((m) => (
                <div key={m.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-semibold uppercase text-slate-500">
                    {m.name} {office.type === "PROFIT_SHARE" ? `· ${m.profitPercent}%` : ""}
                  </p>
                  <p className="mt-1 text-xl font-bold text-slate-900">{formatMoney(data.memberBalances[m.id] || 0)}</p>
                </div>
              ))}
        </div>
      )}

      {canPayout && office && office.type !== "SALARY" && (
        <div className="space-y-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="font-semibold text-slate-800">Record payout — {office.name}</p>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
            <select className={input} value={payout.memberId} onChange={(e) => setPayout({ ...payout, memberId: e.target.value })}>
              <option value="">Office (general)</option>
              {office.members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <input
              className={input}
              inputMode="decimal"
              placeholder="Amount"
              value={payout.amount}
              onChange={(e) => setPayout({ ...payout, amount: e.target.value })}
            />
            <input
              type="date"
              className={input}
              value={payout.entryDate}
              onChange={(e) => setPayout({ ...payout, entryDate: e.target.value })}
            />
            <select className={input} value={payout.method} onChange={(e) => setPayout({ ...payout, method: e.target.value })}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
            <input
              className={input}
              placeholder="Remarks"
              value={payout.remarks}
              onChange={(e) => setPayout({ ...payout, remarks: e.target.value })}
            />
          </div>
          <button type="button" className={primaryBtn} disabled={saving || !payout.amount} onClick={submitPayout}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Save payout
          </button>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && !data ? (
          <TableSkeleton rows={6} />
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Case</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(data?.items || []).length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                    Koi entry nahi
                  </td>
                </tr>
              )}
              {(data?.items || []).map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(e.entryDate)}</td>
                  <td className="px-3 py-2">
                    {e.bookingOffice.name}
                    {e.member && <span className="text-slate-500"> · {e.member.name}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {LEDGER_TYPE_LABELS[e.type] || e.type}
                    {e.method && <span className="text-xs text-slate-400"> ({PAYMENT_METHOD_LABELS[e.method] || e.method})</span>}
                  </td>
                  <td className="px-3 py-2">
                    {e.case ? (
                      <Link href={`/office/cases/${e.case.id}`} className="text-primary-700 hover:underline">
                        {e.case.caseNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-700">
                    {e.direction === "CREDIT" ? formatMoney(e.amount) : ""}
                  </td>
                  <td className="px-3 py-2 text-right text-red-700">
                    {e.direction === "DEBIT" ? formatMoney(e.amount) : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{e.remarks || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

/* ------------------------------- Shared bits ------------------------------- */

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "emerald" | "amber" | "primary" | "red" }) {
  const tones = {
    emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    primary: "border-primary-200 bg-primary-50 text-primary-800",
    red: "border-red-200 bg-red-50 text-red-800",
  };
  return (
    <div className={`rounded-xl border p-3 shadow-sm ${tones[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 truncate text-base font-bold">{formatMoney(value)}</p>
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="grid grid-cols-2 gap-2 animate-pulse sm:grid-cols-3 lg:grid-cols-6" aria-label="Summary load ho rahi hai">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="h-3 w-3/4 rounded bg-slate-200" />
          <div className="mt-2 h-5 w-1/2 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="animate-pulse divide-y divide-slate-100" aria-label="Load ho raha hai">
      <div className="bg-slate-50 px-3 py-2">
        <div className="h-3 w-1/2 rounded bg-slate-200" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-3 py-3">
          <div className="h-3.5 w-20 rounded bg-slate-200" />
          <div className="h-3.5 flex-1 rounded bg-slate-100" />
          <div className="h-3.5 w-16 rounded bg-slate-100" />
          <div className="h-3.5 w-14 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}
