"use client";

import { useCallback, useEffect, useState } from "react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import { adminCanAny } from "@/components/admin/AdminNav";
import { officeFetch, todayInputDate } from "@/lib/office/client";
import type { BookingOfficeType } from "@/lib/office/permissions";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import KpiStrip from "@/components/office/finance/KpiStrip";
import OfficesGrid, { type OfficeCardData } from "@/components/office/finance/OfficesGrid";
import UsersAccounts from "@/components/office/finance/UsersAccounts";
import UserDrawer from "@/components/office/finance/UserDrawer";
import PayModal from "@/components/office/finance/PayModal";
import PendingPayouts from "@/components/office/finance/PendingPayouts";
import PaymentsReceived from "@/components/office/finance/PaymentsReceived";
import OfficeExpenses, { type ExpenseOfficeOption } from "@/components/office/finance/OfficeExpenses";
import MemberFinanceView from "@/components/office/finance/MemberFinanceView";
import {
  normalizeOfficeExpenses,
  normalizeUsersPayload,
  type FinanceReport,
  type FinanceUserRow,
  type FinanceUsersPayload,
  type OfficeExpenseItem,
  type PayoutRequestRow,
} from "@/components/office/finance/types";

// Wave 16 — clean Finance hub. Admin/privileged: KPI strip → offices grid →
// users' accounts (grouped by office) → pending payouts (status only) →
// payments received → office general expenses. Booking-office role: apna
// scoped "Mera account" view (MemberFinanceView) — kisi aur ka data nahi.

export default function OfficeFinancePage() {
  return (
    <OfficePageFrame requiredAny={["office:finance:read", "office:ledger:read", "office:cases:read"]}>
      {(admin) =>
        admin.role === "booking_office" ? (
          <MemberFinanceView admin={admin} />
        ) : adminCanAny(admin, ["office:finance:read"]) ? (
          <FinanceDashboard isSuperAdmin={admin.role === "admin"} canWriteExpenses={adminCanAny(admin, ["office:expenses:write"])} />
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
            Is page ke liye permission zaroori hai
          </div>
        )
      }
    </OfficePageFrame>
  );
}

/* ------------------------- Admin / privileged dashboard ------------------------- */

// All-time range for the KPI strip + per-office received figures.
const ALL_TIME_FROM = "2020-01-01";

function FinanceDashboard({
  isSuperAdmin,
  canWriteExpenses,
}: {
  isSuperAdmin: boolean;
  canWriteExpenses: boolean;
}) {
  const [users, setUsers] = useState<FinanceUsersPayload | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [report, setReport] = useState<FinanceReport | null>(null);
  const [expenses, setExpenses] = useState<OfficeExpenseItem[] | null>(null);
  const [payoutRequests, setPayoutRequests] = useState<PayoutRequestRow[]>([]);
  const [offices, setOffices] = useState<ExpenseOfficeOption[]>([]);

  const [selectedMember, setSelectedMember] = useState<FinanceUserRow | null>(null);
  const [payTarget, setPayTarget] = useState<FinanceUserRow | null>(null);

  const [toast, setToast] = useState<ToastData | null>(null);
  const setMessage = (m: string, kind: ToastKind = "success") => setToast(m ? { message: m, kind } : null);

  const loadUsers = useCallback(async (silent = false) => {
    if (!silent) setUsersLoading(true);
    const res = await officeFetch("/api/office/finance/users");
    if (res.ok) setUsers(normalizeUsersPayload(res.data));
    if (!silent) setUsersLoading(false);
  }, []);

  const loadReport = useCallback(async () => {
    const res = await officeFetch<FinanceReport>(
      `/api/office/finance?from=${ALL_TIME_FROM}&to=${todayInputDate()}`
    );
    if (res.ok) setReport(res.data);
  }, []);

  const loadExpenses = useCallback(async () => {
    const res = await officeFetch("/api/office/office-expenses");
    if (res.ok) setExpenses(normalizeOfficeExpenses(res.data).slice(0, 50));
  }, []);

  const loadPayoutRequests = useCallback(async () => {
    const res = await officeFetch<PayoutRequestRow[]>("/api/office/payouts?status=PENDING");
    if (res.ok) setPayoutRequests(res.data);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    officeFetch<any[]>("/api/office/setup/booking-offices").then((res) => {
      if (res.ok) {
        setOffices(
          res.data.map((o) => ({
            id: String(o?.id ?? ""),
            name: String(o?.name ?? "—"),
            type: (o?.type ?? "FIXED_COMMISSION") as BookingOfficeType,
          }))
        );
      }
    });
  }, []);

  useEffect(() => {
    void loadUsers();
    void loadReport();
    void loadExpenses();
    void loadPayoutRequests();
  }, [loadUsers, loadReport, loadExpenses, loadPayoutRequests]);

  // Live refresh (silent — koi spinner flash nahi) after any office mutation.
  // §W20 (P2): combined promise return hota hai taake hook in-flight dedup
  // kar sake (overlapping triggers par 4 endpoints dobara fetch na hon).
  useLiveRefresh(
    useCallback(
      () => Promise.all([loadUsers(true), loadReport(), loadExpenses(), loadPayoutRequests()]),
      [loadUsers, loadReport, loadExpenses, loadPayoutRequests]
    )
  );

  // KPI numbers — received + expenses report se (all-time), wasool/due users
  // totals se. Expenses = case expenses + office expenses (red).
  const totalReceived = report?.summary.income ?? 0;
  const totalExpenses = report
    ? report.summary.caseExpenses + report.summary.officeExpensesTotal
    : (expenses ?? []).reduce((acc, e) => acc + e.amount, 0);

  // Offices grid — har office ka received (report), expenses (contract 3 sum),
  // dues (users rows sum). Offices with zero activity bhi dikhte hain.
  const officeCards: OfficeCardData[] = (() => {
    const map = new Map<string, OfficeCardData>();
    const ensure = (id: string, name: string, type: BookingOfficeType) => {
      let card = map.get(id);
      if (!card) {
        card = { officeId: id, officeName: name, officeType: type, received: 0, expenses: 0, dues: 0 };
        map.set(id, card);
      }
      if (card.officeName === "—" && name !== "—") card.officeName = name;
      return card;
    };
    for (const o of offices) ensure(o.id, o.name, o.type);
    for (const o of report?.offices ?? []) {
      const card = ensure(o.id, o.name, o.type);
      card.received = o.income;
    }
    for (const e of expenses ?? []) {
      if (!e.officeId) continue;
      ensure(e.officeId, e.officeName, e.officeType ?? "FIXED_COMMISSION").expenses += e.amount;
    }
    for (const row of users?.rows ?? []) {
      ensure(row.officeId, row.officeName, row.officeType).dues += row.due;
    }
    return Array.from(map.values()).sort((a, b) => a.officeName.localeCompare(b.officeName));
  })();

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold text-slate-900">Finance</h2>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* 1. KPI strip */}
      <KpiStrip
        received={totalReceived}
        expenses={totalExpenses}
        wasool={users?.totals.wasool ?? 0}
        due={users?.totals.due ?? 0}
      />

      {/* 2. Offices */}
      <OfficesGrid offices={officeCards} />

      {/* 3. Users' accounts (grouped by office) */}
      <UsersAccounts
        rows={users?.rows ?? null}
        loading={usersLoading}
        onSelect={setSelectedMember}
        onPay={setPayTarget}
      />

      {/* 4. Pending payout requests — status only */}
      <PendingPayouts requests={payoutRequests} />

      {/* 5. Payments received */}
      <PaymentsReceived />

      {/* 6. Office general expenses */}
      <OfficeExpenses
        expenses={expenses}
        offices={offices}
        canAdd={isSuperAdmin || canWriteExpenses}
        canDelete={isSuperAdmin}
        // §W20 (P2): add/delete ke baad office:changed event 300ms mein in
        // tamam sections (+ payout requests) ka silent reload khud karta hai —
        // yahan explicit triple reload duplicate fetches thi, hata di.
        onChanged={() => {
          // office:changed → useLiveRefresh reloads everything above.
        }}
        onToast={setMessage}
      />

      {selectedMember && <UserDrawer member={selectedMember} onClose={() => setSelectedMember(null)} />}
      {payTarget && <PayModal target={payTarget} onClose={() => setPayTarget(null)} onToast={setMessage} />}
    </div>
  );
}
