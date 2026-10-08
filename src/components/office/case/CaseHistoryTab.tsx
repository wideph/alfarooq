"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  BadgePercent,
  Gift,
  History,
  Loader2,
  Plus,
  Receipt,
  Trash2,
  Wallet,
  X,
} from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { formatDate, formatDateTime, formatMoney, officeFetch, todayInputDate } from "@/lib/office/client";
import { LEDGER_TYPE_LABELS } from "@/lib/office/labels";
import {
  type BonusRequestItem,
  type CaseAuditItem,
  type CaseDetail,
  type DiscountRequestItem,
  ghostBtnClass,
  inputClass,
  primaryBtnClass,
} from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

type TabProps = {
  detail: CaseDetail;
  admin: AdminNavUser;
  onUpdated: (next: CaseDetail) => void;
  onReload: () => Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
};

// History/Finance tab: profit-share finalize alert, case expenses editor
// (id="expenses" anchor preserved), is case ki ledger entries, audit log
// (admin), discount requests, bonus requests.
export default function CaseHistoryTab(props: TabProps) {
  return (
    <div className="space-y-4">
      <ProfitAlert {...props} />
      <ExpensesPanel {...props} />
      <LedgerPanel {...props} />
      <AuditPanel {...props} />
      <DiscountPanel caseId={props.detail.id} admin={props.admin} onReload={props.onReload} onMessage={props.onMessage} />
      <BonusPanel caseId={props.detail.id} admin={props.admin} onReload={props.onReload} onMessage={props.onMessage} />
    </div>
  );
}

/* ------------------- Profit share finalize (ledger:write) ------------------ */

function ProfitAlert({ detail, admin, onUpdated, onMessage }: TabProps) {
  const canLedgerWrite = adminCanAny(admin, ["office:ledger:write"]);
  const [busy, setBusy] = useState(false);

  async function finalizeProfit() {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/profit`, { method: "POST" });
    if (res.ok) {
      onUpdated(res.data);
      onMessage("Profit share calculate ho gaya");
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  if (
    detail.bookingOffice.type !== "PROFIT_SHARE" ||
    !canLedgerWrite ||
    !(detail.profitStale || (!detail.profitFinalizedAt && detail.totals.received > 0))
  ) {
    return null;
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        {detail.profitStale
          ? "Payments / expenses badle hain — profit share dobara calculate karein."
          : "Profit share abhi calculate nahi hua (received − expenses ka % shareholders ko)."}
      </span>
      <button disabled={busy} onClick={finalizeProfit} className={`${primaryBtnClass} min-h-[40px]`}>
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}{" "}
        {detail.profitFinalizedAt ? "Re-calculate" : "Calculate profit share"}
      </button>
    </div>
  );
}

/* ------------------------------ Case expenses ------------------------------ */

function ExpensesPanel({ detail, admin, onUpdated, onMessage }: TabProps) {
  const canExpenses = adminCanAny(admin, ["office:expenses:write"]);
  const canSeeExpenses = canExpenses || adminCanAny(admin, ["office:ledger:read", "office:finance:read"]);
  const [form, setForm] = useState({ amount: "", description: "", expenseDate: todayInputDate() });
  const [busy, setBusy] = useState(false);

  async function addExpense() {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/expenses`, { method: "POST", json: form });
    if (res.ok) {
      onUpdated(res.data);
      onMessage("Expense add ho gaya");
      setForm({ amount: "", description: "", expenseDate: todayInputDate() });
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function removeExpense(id: string) {
    if (!confirm("Expense delete karein?")) return;
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/expenses?expenseId=${id}`, { method: "DELETE" });
    if (res.ok) {
      onUpdated(res.data);
      onMessage("Expense delete ho gaya");
    } else onMessage(res.error, "error");
  }

  if (!canSeeExpenses) return null;

  const expenseTotal = detail.expenses.reduce((acc, e) => acc + e.amount, 0);

  return (
    <SectionCard
      id="expenses"
      icon={Receipt}
      title="Case expenses"
      count={detail.expenses.length}
      actions={<span className="text-sm font-semibold text-slate-500">Total {formatMoney(expenseTotal)}</span>}
    >
      {detail.expenses.length === 0 ? (
        <EmptyState icon={Receipt} hint="Koi expense nahi — board fee, courier waghera yahan add karein" />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {detail.expenses.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2 p-3">
              <span className="min-w-0">
                <span className="font-medium text-slate-800">{e.description}</span>
                <span className="ml-2 text-xs text-slate-500">
                  {formatDate(e.expenseDate)}
                  {e.createdByName ? ` · ${e.createdByName}` : ""}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-semibold">{formatMoney(e.amount)}</span>
                {canExpenses && (
                  <button
                    onClick={() => removeExpense(e.id)}
                    aria-label="Expense delete karein"
                    className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {canExpenses && (
        <div className="mt-3 flex flex-col gap-2 md:flex-row">
          <input
            className={inputClass}
            inputMode="decimal"
            placeholder="Amount"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />
          <input
            className={inputClass}
            placeholder="Description (e.g. board fee, courier)"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
          <input
            type="date"
            className={inputClass}
            value={form.expenseDate}
            onChange={(e) => setForm({ ...form, expenseDate: e.target.value })}
          />
          <button
            disabled={busy || !form.amount || !form.description.trim()}
            onClick={addExpense}
            className={`${primaryBtnClass} min-h-[40px] shrink-0`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>
      )}
    </SectionCard>
  );
}

/* --------------------------- Office ledger entries ------------------------- */

function LedgerPanel({ detail, admin }: TabProps) {
  const showLedger = detail.ledger.length > 0 || admin.role === "booking_office" || adminCanAny(admin, ["office:ledger:read"]);
  if (!showLedger) return null;

  return (
    <SectionCard icon={Wallet} title="Office account entries (this case)" count={detail.ledger.length}>
      {detail.ledger.length === 0 ? (
        <EmptyState icon={Wallet} hint="Abhi koi entry nahi" />
      ) : (
        <>
          {/* desktop table */}
          <div className="hidden overflow-x-auto md:block">
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="py-1 pr-3">Date</th>
                  <th className="py-1 pr-3">Type</th>
                  <th className="py-1 pr-3">Member</th>
                  <th className="py-1 pr-3 text-right">Credit</th>
                  <th className="py-1 pr-3 text-right">Debit</th>
                  <th className="py-1">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {detail.ledger.map((l) => (
                  <tr key={l.id}>
                    <td className="whitespace-nowrap py-1.5 pr-3">{formatDate(l.entryDate)}</td>
                    <td className="py-1.5 pr-3">{LEDGER_TYPE_LABELS[l.type] || l.type}</td>
                    <td className="py-1.5 pr-3 text-slate-500">{l.member?.name || "Office"}</td>
                    <td className="py-1.5 pr-3 text-right text-emerald-700">
                      {l.direction === "CREDIT" ? formatMoney(l.amount) : ""}
                    </td>
                    <td className="py-1.5 pr-3 text-right text-red-700">{l.direction === "DEBIT" ? formatMoney(l.amount) : ""}</td>
                    <td className="py-1.5 text-xs text-slate-500">{l.remarks || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* mobile card list */}
          <ul className="space-y-2 md:hidden">
            {detail.ledger.map((l) => (
              <li key={l.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-slate-800">{LEDGER_TYPE_LABELS[l.type] || l.type}</span>
                  <span className={`font-bold ${l.direction === "CREDIT" ? "text-emerald-700" : "text-red-700"}`}>
                    {l.direction === "CREDIT" ? "+" : "−"}
                    {formatMoney(l.amount)}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {formatDate(l.entryDate)} · {l.member?.name || "Office"}
                  {l.remarks ? ` · ${l.remarks}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
    </SectionCard>
  );
}

/* -------------------------------- Audit log -------------------------------- */

// §W11.3/W11.5: audit detail payload ka hissa nahi — History tab khulne par
// (tab lazily mount hota hai) GET /api/office/cases/[id]/audit se aata hai.
function AuditPanel({ detail, admin }: TabProps) {
  const [items, setItems] = useState<CaseAuditItem[] | null>(null);

  useEffect(() => {
    if (admin.role !== "admin") return;
    let cancelled = false;
    officeFetch<{ items: CaseAuditItem[] }>(`/api/office/cases/${detail.id}/audit`).then((res) => {
      if (!cancelled) setItems(res.ok ? res.data.items : []);
    });
    return () => {
      cancelled = true;
    };
  }, [admin.role, detail.id]);

  if (admin.role !== "admin") return null;

  return (
    <SectionCard icon={History} title="Audit log (last 50)" count={items?.length ?? null}>
      {items === null ? (
        <SkeletonRows rows={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={History} hint="Koi audit entry nahi" />
      ) : (
        <ul className="divide-y divide-slate-100 text-xs">
          {items.map((a) => (
            <li key={a.id} className="py-1.5">
              <span className="text-slate-400">{formatDateTime(a.createdAt)}</span> ·{" "}
              <span className="font-semibold text-slate-700">{a.actorName || a.actorRole}</span> ·{" "}
              <span className="font-mono">{a.action}</span>
              {a.after !== null && a.after !== undefined && (
                <span className="ml-1 break-all text-slate-500">{JSON.stringify(a.after).slice(0, 160)}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

/* ----------------------------- Discount requests --------------------------- */

// docs 06 §N8 — booking office sirf discount REQUEST kar sakta hai; admin /
// cashier decide karte hain (commission / admin profit / partial se minus).
function DiscountPanel({
  caseId,
  admin,
  onReload,
  onMessage,
}: {
  caseId: string;
  admin: AdminNavUser;
  onReload: () => Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const canRequest = adminCanAny(admin, ["office:cases:write"]);
  const canDecide = admin.role === "admin" || adminCanAny(admin, ["office:payments:verify"]);
  const [items, setItems] = useState<DiscountRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ amount: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<DiscountRequestItem | null>(null);
  const [deductFrom, setDeductFrom] = useState<"COMMISSION" | "PROFIT" | "PARTIAL">("COMMISSION");
  const [partialAmount, setPartialAmount] = useState("");

  const load = useCallback(async () => {
    const res = await officeFetch<{ items: DiscountRequestItem[] }>(`/api/office/cases/${caseId}/discount-requests`);
    if (res.ok) setItems(res.data.items);
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function request() {
    setBusy(true);
    const res = await officeFetch(`/api/office/cases/${caseId}/discount-requests`, {
      method: "POST",
      json: { amount: form.amount, reason: form.reason },
    });
    if (res.ok) {
      onMessage("Discount request bhej di gayi — admin / cashier decide karein ge");
      setForm({ amount: "", reason: "" });
      await load();
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function decide(action: "ACCEPT" | "REJECT") {
    if (!deciding) return;
    setBusy(true);
    const res = await officeFetch(`/api/office/discount-requests`, {
      method: "PATCH",
      json: {
        id: deciding.id,
        action,
        ...(action === "ACCEPT"
          ? { deductFrom, ...(deductFrom === "PARTIAL" ? { partialCommissionAmount: partialAmount } : {}) }
          : {}),
      },
    });
    if (res.ok) {
      onMessage(action === "ACCEPT" ? "Discount accept ho gaya — agreed amount update ho gayi" : "Discount request reject ho gayi");
      setDeciding(null);
      setPartialAmount("");
      await load();
      await onReload();
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  if (!canRequest && !canDecide) return null;

  return (
    <SectionCard icon={BadgePercent} title="Discount requests" count={items.length}>
      {canRequest && (
        <div className="mb-3 space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Naya discount request (booking office)</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={`${inputClass} sm:max-w-[10rem]`}
              inputMode="decimal"
              placeholder="Amount (Rs)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Wajah / reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <button disabled={busy || !form.amount} onClick={request} className={`${primaryBtnClass} min-h-[40px] shrink-0`}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Request karein
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={2} />
      ) : items.length === 0 ? (
        <EmptyState icon={BadgePercent} hint="Koi discount request nahi" />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="min-w-0">
                <span className="font-bold text-slate-900">{formatMoney(item.amount)}</span>
                {item.reason && <span className="ml-2 text-slate-500">{item.reason}</span>}
                <span className="block text-[11px] text-slate-400">
                  {formatDateTime(item.createdAt)}
                  {item.deductFrom ? ` · ${item.deductFrom} se minus` : ""}
                  {item.decidedAt ? ` · decided ${formatDateTime(item.decidedAt)}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    item.status === "PENDING"
                      ? "bg-amber-100 text-amber-700"
                      : item.status === "ACCEPTED"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {item.status}
                </span>
                {canDecide && item.status === "PENDING" && (
                  <button
                    onClick={() => {
                      setDeciding(item);
                      setDeductFrom("COMMISSION");
                      setPartialAmount("");
                    }}
                    className="min-h-[36px] rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    Decide
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {deciding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setDeciding(null)}>
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900">Discount decide karein — {formatMoney(deciding.amount)}</h4>
              <button onClick={() => setDeciding(null)} aria-label="Band karein" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            {deciding.reason && <p className="text-sm text-slate-500">Wajah: {deciding.reason}</p>}
            <div className="space-y-2 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accept karein to kahan se minus ho:</p>
              {(
                [
                  ["COMMISSION", "Booking office ki commission se"],
                  ["PROFIT", "Admin profit se"],
                  ["PARTIAL", "Partial (donon se split)"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <input type="radio" name="deductFrom" checked={deductFrom === value} onChange={() => setDeductFrom(value)} />
                  {label}
                </label>
              ))}
              {deductFrom === "PARTIAL" && (
                <input
                  className={inputClass}
                  inputMode="decimal"
                  placeholder="Commission se kitna minus (Rs) — baqi profit se"
                  value={partialAmount}
                  onChange={(e) => setPartialAmount(e.target.value)}
                />
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy || (deductFrom === "PARTIAL" && !partialAmount)} onClick={() => decide("ACCEPT")} className={`${primaryBtnClass} min-h-[40px]`}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Accept
              </button>
              <button
                disabled={busy}
                onClick={() => decide("REJECT")}
                className="min-h-[40px] rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50"
              >
                Reject
              </button>
              <button disabled={busy} onClick={() => setDeciding(null)} className={`${ghostBtnClass} min-h-[40px]`}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}

/* ------------------------------ Bonus requests ----------------------------- */

// docs 06 §N8 — booking office bonus REQUEST karta hai (case se linked);
// admin / cashier accept karte waqt decide karte hain ke bonus commission se
// ya admin profit se jaye.
function BonusPanel({
  caseId,
  admin,
  onReload,
  onMessage,
}: {
  caseId: string;
  admin: AdminNavUser;
  onReload: () => Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const isBookingOffice = admin.role === "booking_office";
  const canDecide = admin.role === "admin" || adminCanAny(admin, ["office:payments:verify"]);
  const [items, setItems] = useState<BonusRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ amount: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [deciding, setDeciding] = useState<BonusRequestItem | null>(null);
  const [deductFrom, setDeductFrom] = useState<"COMMISSION" | "PROFIT">("COMMISSION");

  const load = useCallback(async () => {
    const res = await officeFetch<{ items: BonusRequestItem[] }>(`/api/office/bonus-requests`);
    if (res.ok) setItems(res.data.items.filter((item) => item.caseId === caseId));
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    if (isBookingOffice || canDecide) void load();
    else setLoading(false);
  }, [load, isBookingOffice, canDecide]);

  async function request() {
    setBusy(true);
    const res = await officeFetch(`/api/office/bonus-requests`, {
      method: "POST",
      json: { caseId, amount: form.amount, reason: form.reason },
    });
    if (res.ok) {
      onMessage("Bonus request bhej di gayi — admin / cashier decide karein ge");
      setForm({ amount: "", reason: "" });
      await load();
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function decide(action: "ACCEPT" | "REJECT") {
    if (!deciding) return;
    setBusy(true);
    const res = await officeFetch(`/api/office/bonus-requests`, {
      method: "PATCH",
      json: { id: deciding.id, action, ...(action === "ACCEPT" ? { deductFrom } : {}) },
    });
    if (res.ok) {
      onMessage(action === "ACCEPT" ? "Bonus accept ho gaya — office ledger mein credit ho gaya" : "Bonus request reject ho gayi");
      setDeciding(null);
      await load();
      await onReload();
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  if (!isBookingOffice && !canDecide) return null;

  return (
    <SectionCard icon={Gift} title="Bonus requests" count={items.length}>
      {isBookingOffice && (
        <div className="mb-3 space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Naya bonus request (is case se linked)</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={`${inputClass} sm:max-w-[10rem]`}
              inputMode="decimal"
              placeholder="Amount (Rs)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Wajah / reason"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <button disabled={busy || !form.amount} onClick={request} className={`${primaryBtnClass} min-h-[40px] shrink-0`}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} Request karein
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={2} />
      ) : items.length === 0 ? (
        <EmptyState icon={Gift} hint="Is case ki koi bonus request nahi" />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 text-sm">
          {items.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <span className="min-w-0">
                <span className="font-bold text-slate-900">{formatMoney(item.amount)}</span>
                {item.reason && <span className="ml-2 text-slate-500">{item.reason}</span>}
                <span className="block text-[11px] text-slate-400">
                  {item.bookingOffice.name} · {formatDateTime(item.createdAt)}
                  {item.deductFrom ? ` · ${item.deductFrom === "COMMISSION" ? "commission se" : "admin profit se"}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                    item.status === "PENDING"
                      ? "bg-amber-100 text-amber-700"
                      : item.status === "ACCEPTED"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-red-100 text-red-700"
                  }`}
                >
                  {item.status}
                </span>
                {canDecide && item.status === "PENDING" && (
                  <button
                    onClick={() => {
                      setDeciding(item);
                      setDeductFrom("COMMISSION");
                    }}
                    className="min-h-[36px] rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white"
                  >
                    Decide
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {deciding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" onClick={() => setDeciding(null)}>
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-slate-900">Bonus decide karein — {formatMoney(deciding.amount)}</h4>
              <button onClick={() => setDeciding(null)} aria-label="Band karein" className="rounded-lg p-1 text-slate-500 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            {deciding.reason && <p className="text-sm text-slate-500">Wajah: {deciding.reason}</p>}
            <div className="space-y-2 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Accept karein to bonus kahan se jaye:</p>
              {(
                [
                  ["COMMISSION", "Office ki commission se"],
                  ["PROFIT", "Admin profit se"],
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                  <input type="radio" name="deductFrom" checked={deductFrom === value} onChange={() => setDeductFrom(value)} />
                  {label}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => decide("ACCEPT")} className={`${primaryBtnClass} min-h-[40px]`}>
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} Accept
              </button>
              <button
                disabled={busy}
                onClick={() => decide("REJECT")}
                className="min-h-[40px] rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600 disabled:opacity-50"
              >
                Reject
              </button>
              <button disabled={busy} onClick={() => setDeciding(null)} className={`${ghostBtnClass} min-h-[40px]`}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
