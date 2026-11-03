"use client";

import { useCallback, useState, type ReactNode } from "react";
import { HandCoins, Loader2, Plus, Printer, Receipt, Stamp, Truck } from "lucide-react";
import { adminCanAny, type AdminNavUser } from "@/components/admin/AdminNav";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";
import { formatDate, formatMoney, officeFetch, todayInputDate } from "@/lib/office/client";
import { DEPT_COMMISSION_KIND_LABELS, DEPT_COMMISSION_KIND_STYLES, PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { EmptyState, SectionHeader, TableSkeleton, inputCls, primaryBtnCls } from "./ui";
import { DeptExpenseList, DeptRequestList, DeptReviewList } from "./DeptExpenseLists";
import {
  normalizeDeptEntries,
  normalizeDeptExpenses,
  normalizeDeptSummary,
  type DeptCommissionEntry,
  type DeptCommissionPayout,
  type DeptCommissionSummaryUser,
  type DeptExpensesPayload,
  type DeptMoney,
  type DeptPayoutKind,
} from "./types";

// §W22 (F22.3) — Dept user (office:printing:write / office:attestation-dept:write,
// bina finance:read / ledger:read) ka scoped "Mera account" view: sirf APNA
// hisaab. Backend relaxed guard summary mein sirf own row aur
// entries?adminId=<self> allow karta hai, is liye kisi aur user ka data yahan aa
// hi nahi sakta.
// §W53 (owner ki tarteeb):
//   1. Teen hisaab lines — Commission, phir Courier kharcha, phir Other expenses
//      (kul / wapas mila / admin se wasooli baqi). Admin jis raqam ki payment
//      bheje, us ki request ("Mil gaya" / "Nahi mila") USI line ke foran neeche.
//   2. Commission ki detail list, phir Courier kharcha ki, phir Other expenses ki.
//   3. Baqi: New other expenses form, payment history.

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

// Ek hisaab line: naam | kul | wapas mila | admin se wasooli baqi.
function SummaryLine({
  icon,
  title,
  totalLabel,
  money,
  note,
}: {
  icon: ReactNode;
  title: string;
  totalLabel: string;
  money: DeptMoney;
  note?: string | null;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex sm:items-center sm:gap-4 sm:p-4">
      <div className="mb-2 flex items-center gap-2 sm:mb-0 sm:w-44 sm:shrink-0">
        {icon}
        <div className="min-w-0">
          <p className="font-bold text-slate-900">{title}</p>
          {note && <p className="text-[11px] font-semibold text-amber-700">{note}</p>}
        </div>
      </div>
      <div className="grid flex-1 grid-cols-3 gap-2">
        <div className="rounded-xl bg-slate-50 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-slate-500">{totalLabel}</p>
          <p className="truncate text-sm font-bold text-slate-900 sm:text-base">{formatMoney(money.total)}</p>
        </div>
        <div className="rounded-xl bg-sky-50 px-2.5 py-2">
          <p className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-sky-700">Wapas mila</p>
          <p className="truncate text-sm font-bold text-sky-800 sm:text-base">{formatMoney(money.paid)}</p>
        </div>
        <div className={`rounded-xl px-2.5 py-2 ${money.remaining > 0 ? "bg-amber-50" : "bg-emerald-50"}`}>
          <p
            className={`text-[10px] font-semibold uppercase leading-tight tracking-wide ${
              money.remaining > 0 ? "text-amber-700" : "text-emerald-700"
            }`}
          >
            Admin se wasooli baqi
          </p>
          <p
            className={`truncate text-sm font-bold sm:text-base ${
              money.remaining > 0 ? "text-amber-800" : money.remaining < 0 ? "text-red-700" : "text-emerald-800"
            }`}
          >
            {formatMoney(money.remaining)}
          </p>
        </div>
      </div>
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
    showToast("Admin ke review ke liye bhej diya — manzoori ke baad wasooli mein judega");
    setOtherForm({ amount: "", description: "", expenseDate: todayInputDate() });
    await load();
  }

  // Admin ki bheji payment requests — har qism apni line ke neeche.
  const pendingOf = (kind: DeptPayoutKind) =>
    (expenses?.requests ?? []).filter((request) => request.status === "PENDING" && request.kind === kind);
  // Accept hui commission payment "Commission wasool" mein hai (ledger) —
  // history mein dobara nahi.
  const decidedRequests = (expenses?.requests ?? []).filter(
    (request) => request.status !== "PENDING" && !(request.kind === "COMMISSION" && request.status === "ACCEPTED")
  );
  const commissionMoney: DeptMoney = {
    total: row?.earned ?? 0,
    paid: row?.paid ?? 0,
    pending: row?.pending ?? 0,
    remaining: row?.remaining ?? 0,
  };
  // §W52: bheje hue kharche jo admin ke review mein hain / wapas hue (hisaab
  // mein nahi) — har qism ki apni detail list mein.
  const courierReviews = (expenses?.reviews ?? []).filter((review) => review.kind === "COURIER");
  const otherReviews = (expenses?.reviews ?? []).filter((review) => review.kind === "OTHER");
  const reviewTotal = (rows: typeof courierReviews) =>
    rows.filter((review) => review.status === "PENDING").reduce((acc, review) => acc + review.amount, 0);
  const reviewNote = (rows: typeof courierReviews) =>
    reviewTotal(rows) > 0 ? `${formatMoney(reviewTotal(rows))} admin ke review mein` : null;
  const showCourier = isCourier || (expenses?.totals.courier.total ?? 0) > 0 || courierReviews.length > 0;

  // Line ke neeche: us qism ki payment jo admin ne bheji (tasdeeq).
  function paymentsUnder(kind: DeptPayoutKind) {
    const rows = pendingOf(kind);
    if (rows.length === 0) return null;
    return (
      <div className="ml-3 space-y-1.5 border-l-2 border-amber-300 pl-3 sm:ml-6">
        <p className="text-xs font-bold text-amber-800">Admin ne payment bheji — kya aap ko mil gayi?</p>
        <DeptRequestList rows={rows} mode="receiver" empty="" onChanged={load} onToast={showToast} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Toast toast={toast} onClose={() => setToast(null)} />
      <div>
        <h2 className="text-xl font-bold text-slate-900">Mera account</h2>
        <p className="text-sm text-slate-500">
          Commission, courier kharcha aur other expenses — har ek ka alag hisaab. Admin payment bheje to us line ke neeche
          &quot;Mil gaya&quot; dabayein, tab wo &quot;Wapas mila&quot; mein judti hai.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="animate-pulse space-y-3" aria-label="Load ho raha hai">
          <div className="h-20 rounded-2xl bg-slate-100" />
          <div className="h-20 rounded-2xl bg-slate-100" />
          <div className="h-20 rounded-2xl bg-slate-100" />
          <div className="h-40 rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <>
          {/* 1. Teen hisaab lines (+ har line ke neeche us ki payment) */}
          <section className="space-y-2">
            <SummaryLine
              icon={<Printer className="h-5 w-5 shrink-0 text-primary-600" />}
              title="Commission"
              totalLabel="Kul commission"
              money={commissionMoney}
            />
            {paymentsUnder("COMMISSION")}
            {showCourier && expenses && (
              <>
                <SummaryLine
                  icon={<Truck className="h-5 w-5 shrink-0 text-teal-600" />}
                  title="Courier kharcha"
                  totalLabel="Kul (manzoor)"
                  money={expenses.totals.courier}
                  note={reviewNote(courierReviews)}
                />
                {paymentsUnder("COURIER_EXPENSE")}
              </>
            )}
            {expenses && (
              <>
                <SummaryLine
                  icon={<Receipt className="h-5 w-5 shrink-0 text-violet-600" />}
                  title="Other expenses"
                  totalLabel="Kul (manzoor)"
                  money={expenses.totals.other}
                  note={reviewNote(otherReviews)}
                />
                {paymentsUnder("OTHER_EXPENSE")}
              </>
            )}
          </section>

          {/* 2a. Commission ki detail */}
          <section className="space-y-2">
            <SectionHeader
              icon={<Printer className="h-4 w-4 text-primary-600" />}
              title="Commission — detail"
              count={entries?.length}
            />
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
          </section>

          {/* 2b. Courier kharcha ki detail */}
          {showCourier && expenses && (
            <section className="space-y-2">
              <SectionHeader
                icon={<Truck className="h-4 w-4 text-teal-600" />}
                title="Courier kharcha — detail"
                count={expenses.courier.length + courierReviews.length}
              />
              <p className="text-xs text-slate-500">
                Courier tab ki list mein slip button ke neeche amount likh kar &quot;Add&quot; karein (ya case page par
                &quot;Courier kharcha&quot;). Pehle admin ke review mein jata hai; manzoor ho to hisaab mein.
              </p>
              {courierReviews.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                    Admin ke review mein{reviewTotal(courierReviews) > 0 ? ` — ${formatMoney(reviewTotal(courierReviews))}` : ""}
                  </p>
                  <DeptReviewList rows={courierReviews} onChanged={load} onToast={showToast} />
                </div>
              )}
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Manzoor shuda</p>
              <DeptExpenseList
                kind="COURIER"
                rows={expenses.courier}
                empty="Abhi koi manzoor courier kharcha nahi"
                onChanged={load}
                onToast={showToast}
              />
            </section>
          )}

          {/* 2c. Other expenses ki detail */}
          {expenses && (
            <section className="space-y-2">
              <SectionHeader
                icon={<Receipt className="h-4 w-4 text-violet-600" />}
                title="Other expenses — detail"
                count={expenses.other.length + otherReviews.length}
              />
              {otherReviews.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-amber-700">
                    Admin ke review mein{reviewTotal(otherReviews) > 0 ? ` — ${formatMoney(reviewTotal(otherReviews))}` : ""}
                  </p>
                  <DeptReviewList rows={otherReviews} onChanged={load} onToast={showToast} />
                </div>
              )}
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Manzoor shuda</p>
              <DeptExpenseList
                kind="OTHER"
                rows={expenses.other}
                empty="Abhi koi manzoor other expenses nahi"
                onChanged={load}
                onToast={showToast}
              />
            </section>
          )}

          {/* 3. Baqi: New other expenses + payment history */}
          {expenses && (
            <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
              <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Plus className="h-4 w-4 text-violet-600" /> New other expenses
              </p>
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
                Jo kharcha aap ne kaam ke liye apni jeb se kiya (kisi case ka nahi). Pehle admin ke review mein jata hai;
                manzoor hone par admin wapas dega.
              </p>
            </section>
          )}

          {((payouts?.length ?? 0) > 0 || decidedRequests.length > 0) && (
            <section className="space-y-2">
              <SectionHeader
                icon={<HandCoins className="h-4 w-4 text-sky-600" />}
                title="Payment history"
                count={(payouts?.length ?? 0) + decidedRequests.length}
              />
              {payouts && payouts.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Commission wasool</p>
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
              {decidedRequests.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                    Kharchon ki wapsi / wapas ki gayi requests
                  </p>
                  <DeptRequestList rows={decidedRequests} mode="view" empty="" onChanged={load} onToast={showToast} />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
