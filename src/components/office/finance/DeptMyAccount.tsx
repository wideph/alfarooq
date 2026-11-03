"use client";

import { useCallback, useState } from "react";
import { BellRing, HandCoins, Loader2, Plus, Printer, Receipt, Stamp, Truck } from "lucide-react";
import { adminCanAny, type AdminNavUser } from "@/components/admin/AdminNav";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";
import { formatDate, formatMoney, officeFetch, todayInputDate } from "@/lib/office/client";
import { DEPT_COMMISSION_KIND_LABELS, DEPT_COMMISSION_KIND_STYLES, PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { EmptyState, SectionHeader, StatCard, TableSkeleton, inputCls, primaryBtnCls } from "./ui";
import { DeptExpenseList, DeptRequestList } from "./DeptExpenseLists";
import {
  normalizeDeptEntries,
  normalizeDeptExpenses,
  normalizeDeptSummary,
  type DeptCommissionEntry,
  type DeptCommissionPayout,
  type DeptCommissionSummaryUser,
  type DeptExpensesPayload,
  type DeptMoney,
} from "./types";

// §W22 (F22.3) — Dept user (office:printing:write / office:attestation-dept:write,
// bina finance:read / ledger:read) ka scoped "Mera account" view: sirf APNI dept
// commission summary (Earned / Wasool / Remaining) + case-by-case entries +
// payout history. Backend relaxed guard summary mein sirf own row aur
// entries?adminId=<self> allow karta hai, is liye kisi aur user ka data yahan aa
// hi nahi sakta.
// §W51: admin ki payment ab REQUEST hai — upar "Mil gaya" / "Nahi mila". Courier
// kharcha (slip ke saath / case page se) aur Other kharcha (yahin se, comment
// lazmi) — har ek ka total aur "Admin se wasooli baqi".

// §W30: COURIER kind bhi.
function DeptKindChip({ kind }: { kind: DeptCommissionEntry["kind"] }) {
  const Icon = kind === "PRINTING" ? Printer : kind === "COURIER" ? Truck : Stamp;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${DEPT_COMMISSION_KIND_STYLES[kind]}`}
    >
      <Icon className="h-3 w-3" />
      {DEPT_COMMISSION_KIND_LABELS[kind]}
    </span>
  );
}

function MoneyCards({ money, totalLabel }: { money: DeptMoney; totalLabel: string }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard label={totalLabel} value={money.total} tone="slate" />
      <StatCard label="Wapas mil gaya" value={money.paid} tone="sky" />
      <StatCard
        label="Remaining"
        value={money.remaining}
        tone={money.remaining > 0 ? "amber" : "emerald"}
        hint={
          money.remaining > 0
            ? `Admin se wasooli baqi${money.pending > 0 ? ` · ${formatMoney(money.pending)} request aayi hai` : ""}`
            : "Sab clear"
        }
      />
    </div>
  );
}

export default function DeptMyAccount({ admin }: { admin: AdminNavUser }) {
  const selfId =
    (admin as AdminNavUser & { adminId?: string; id?: string }).adminId ||
    (admin as AdminNavUser & { id?: string }).id ||
    "";
  const isCourier = adminCanAny(admin, ["office:courier:write"]);

  const [row, setRow] = useState<DeptCommissionSummaryUser | null>(null);
  const [entries, setEntries] = useState<DeptCommissionEntry[] | null>(null);
  const [payouts, setPayouts] = useState<DeptCommissionPayout[] | null>(null);
  const [expenses, setExpenses] = useState<DeptExpensesPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastData | null>(null);
  const showToast = (message: string, kind: ToastKind = "success") => setToast({ message, kind });

  const [otherForm, setOtherForm] = useState({ amount: "", description: "", expenseDate: todayInputDate() });
  const [savingOther, setSavingOther] = useState(false);

  const load = useCallback(async () => {
    // 1) Summary + apne kharche — relaxed guard par sirf apni row / apna data.
    const [summaryRes, expensesRes] = await Promise.all([
      officeFetch("/api/office/dept-commissions/summary"),
      officeFetch("/api/office/dept-expenses"),
    ]);
    if (expensesRes.ok) setExpenses(normalizeDeptExpenses(expensesRes.data));
    if (!summaryRes.ok) {
      setError(summaryRes.error);
      setLoading(false);
      return;
    }
    const users = normalizeDeptSummary(summaryRes.data);
    const own = users.find((user) => user.adminId === selfId) ?? users[0] ?? null;
    setRow(own);
    if (!own) {
      setEntries([]);
      setPayouts([]);
      setError(expensesRes.ok ? "" : expensesRes.error);
      setLoading(false);
      return;
    }
    // 2) Apni case-by-case entries + payout history (adminId === self allowed).
    const entriesRes = await officeFetch(
      `/api/office/dept-commissions/entries?adminId=${encodeURIComponent(own.adminId)}`
    );
    if (entriesRes.ok) {
      const normalized = normalizeDeptEntries(entriesRes.data);
      setEntries(normalized.entries);
      setPayouts(normalized.payouts);
      setError(expensesRes.ok ? "" : expensesRes.error);
    } else {
      setError(entriesRes.error);
    }
    setLoading(false);
  }, [selfId]);

  // Mount fetch (immediate) + office:changed/polling live refresh.
  useLiveRefresh(load, { immediate: true });

  async function addOther() {
    if (!otherForm.amount.trim() || Number(otherForm.amount) <= 0) {
      showToast("Amount likhein (0 se zyada)", "error");
      return;
    }
    if (!otherForm.description.trim()) {
      showToast("Comment lazmi hai — kis cheez ka kharcha hai?", "error");
      return;
    }
    setSavingOther(true);
    const res = await officeFetch("/api/office/dept-expenses", {
      method: "POST",
      json: {
        amount: otherForm.amount.trim(),
        description: otherForm.description.trim(),
        expenseDate: otherForm.expenseDate || undefined,
      },
    });
    setSavingOther(false);
    if (!res.ok) {
      showToast(res.error, "error");
      return;
    }
    showToast("Other kharcha add ho gaya — admin se wasooli mein shamil");
    setOtherForm({ amount: "", description: "", expenseDate: todayInputDate() });
    await load();
  }

  const pendingRequests = (expenses?.requests ?? []).filter((request) => request.status === "PENDING");
  // Accept hui commission payment upar "Commission wasool" mein hai (ledger) —
  // yahan dobara nahi.
  const decidedRequests = (expenses?.requests ?? []).filter(
    (request) => request.status !== "PENDING" && !(request.kind === "COMMISSION" && request.status === "ACCEPTED")
  );
  const commissionMoney: DeptMoney = {
    total: row?.earned ?? 0,
    paid: row?.paid ?? 0,
    pending: row?.pending ?? 0,
    remaining: row?.remaining ?? 0,
  };
  const showCourier = isCourier || (expenses?.totals.courier.total ?? 0) > 0;

  return (
    <div className="space-y-6">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div>
        <h2 className="text-xl font-bold text-slate-900">Mera account</h2>
        <p className="text-sm text-slate-500">
          Commission, courier kharcha aur other kharcha — har ek ka alag hisaab. Admin payment bhejta hai to upar
          &quot;Mil gaya&quot; dabayein, tab wo wasool shumar hoti hai.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="animate-pulse space-y-3" aria-label="Load ho raha hai">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="h-24 rounded-2xl bg-slate-100" />
            <div className="h-24 rounded-2xl bg-slate-100" />
            <div className="h-24 rounded-2xl bg-slate-100" />
          </div>
          <div className="h-40 rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <>
          {/* §W51: admin ki payment requests — tasdeeq */}
          {pendingRequests.length > 0 && (
            <section className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-3 sm:p-4">
              <SectionHeader
                icon={<BellRing className="h-4 w-4 text-amber-600" />}
                title="Admin ki payment — kya aap ko mil gayi?"
                count={pendingRequests.length}
              />
              <DeptRequestList
                rows={pendingRequests}
                mode="receiver"
                empty=""
                onChanged={load}
                onToast={showToast}
              />
            </section>
          )}

          {/* 1. Commission */}
          <section className="space-y-3">
            <SectionHeader icon={<Printer className="h-4 w-4 text-primary-600" />} title="Department commission" />
            <MoneyCards money={commissionMoney} totalLabel="Earned (commission)" />
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {entries === null ? (
                <TableSkeleton rows={3} />
              ) : entries.length === 0 ? (
                <EmptyState>
                  Abhi koi commission credit nahi hui — printing / attestation / courier ka kaam mukammal karne par yahan
                  show hogi
                </EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Department</th>
                        <th className="px-3 py-2">Case</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-3 py-2.5 text-slate-600">{formatDate(entry.entryDate)}</td>
                          <td className="px-3 py-2.5">
                            <DeptKindChip kind={entry.kind} />
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-slate-800">{entry.caseNumber}</td>
                          <td className="px-3 py-2.5 text-slate-600">{entry.caseCategory || "—"}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                            {formatMoney(entry.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            {payouts && payouts.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Commission wasool (history)</p>
                <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
                  {payouts.map((payout) => (
                    <li key={payout.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">
                          {payout.method ? PAYMENT_METHOD_LABELS[payout.method] || payout.method : "Payout"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDate(payout.entryDate)}
                          {payout.remarks ? ` · ${payout.remarks}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold text-sky-700">{formatMoney(payout.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* 2. §W51 Courier kharcha */}
          {showCourier && expenses && (
            <section className="space-y-3">
              <SectionHeader
                icon={<Truck className="h-4 w-4 text-teal-600" />}
                title="Courier kharcha"
                count={expenses.courier.length}
              />
              <MoneyCards money={expenses.totals.courier} totalLabel="Kul courier kharcha" />
              <p className="text-xs text-slate-500">
                Courier slip upload karte waqt amount likhein, ya case page par &quot;Courier kharcha&quot; se add karein.
              </p>
              <DeptExpenseList
                kind="COURIER"
                rows={expenses.courier}
                empty="Abhi koi courier kharcha nahi"
                onChanged={load}
                onToast={showToast}
              />
            </section>
          )}

          {/* 3. §W51 Other kharcha (comment lazmi) */}
          {expenses && (
            <section className="space-y-3">
              <SectionHeader
                icon={<Receipt className="h-4 w-4 text-violet-600" />}
                title="Other kharcha"
                count={expenses.other.length}
              />
              <MoneyCards money={expenses.totals.other} totalLabel="Kul other kharcha" />
              <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
                <p className="text-sm font-semibold text-slate-800">Naya other kharcha</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_10rem_1fr_auto]">
                  <input
                    className={inputCls}
                    inputMode="decimal"
                    placeholder="Amount (Rs)"
                    value={otherForm.amount}
                    onChange={(e) => setOtherForm({ ...otherForm, amount: e.target.value })}
                  />
                  <input
                    type="date"
                    className={inputCls}
                    value={otherForm.expenseDate}
                    onChange={(e) => setOtherForm({ ...otherForm, expenseDate: e.target.value })}
                  />
                  <input
                    className={inputCls}
                    placeholder="Comment (lazmi) — kis cheez ka kharcha?"
                    value={otherForm.description}
                    onChange={(e) => setOtherForm({ ...otherForm, description: e.target.value })}
                  />
                  <button type="button" disabled={savingOther} onClick={() => void addOther()} className={primaryBtnCls}>
                    {savingOther ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    Add karein
                  </button>
                </div>
                <p className="text-[11px] text-slate-400">
                  Jo kharcha aap ne kaam ke liye apni jeb se kiya (kisi case ka nahi). Admin wapas dega.
                </p>
              </div>
              <DeptExpenseList
                kind="OTHER"
                rows={expenses.other}
                empty="Abhi koi other kharcha nahi"
                onChanged={load}
                onToast={showToast}
              />
            </section>
          )}

          {/* 4. Payment history (commission / courier / other) */}
          {decidedRequests.length > 0 && (
            <section className="space-y-2">
              <SectionHeader
                icon={<HandCoins className="h-4 w-4 text-sky-600" />}
                title="Payment requests (history)"
                count={decidedRequests.length}
              />
              <DeptRequestList rows={decidedRequests} mode="view" empty="" onChanged={load} onToast={showToast} />
            </section>
          )}
        </>
      )}
    </div>
  );
}
