"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Flame, Loader2, Plus, Search, Wallet, X } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import { adminCanAny, type AdminNavUser } from "@/components/admin/AdminNav";
import { formatDate, formatMoney, officeFetch, toInputDate } from "@/lib/office/client";
import { ATTESTATION_STATUS_STYLES, STATUS_LABELS, STATUS_STYLES } from "@/lib/office/labels";
import { CASE_STATUSES } from "@/lib/office/permissions";
import { useToast } from "@/hooks/useToast";
import type { AdminPermission } from "@/components/admin/AdminNav";

// §N7 department queues (?dept=). Tab sirf tab dikhta hai jab user ke paas us
// department ki write permission ho; admin / cashier ko saare tabs milte hain.
const DEPT_TABS: Array<{ key: string; label: string; permission: AdminPermission }> = [
  { key: "filing", label: "Filing queue", permission: "office:filing:write" },
  { key: "printing", label: "Printing queue", permission: "office:printing:write" },
  { key: "atta", label: "Atta queue", permission: "office:atta:write" },
  { key: "courier", label: "Courier queue", permission: "office:courier:write" },
];

function canSeeDeptTab(admin: AdminNavUser, permission: AdminPermission) {
  return adminCanAny(admin, [permission]) || admin.role === "cashier";
}

// Filing department ko stripped payload milta hai (no money/office fields),
// is liye baqi fields optional hain.
type CaseRow = {
  id: string;
  caseNumber: string;
  clientName?: string;
  rollNumber: string | null;
  registrationNumber: string | null;
  status: string;
  isPrinted?: boolean;
  expectedPrintingDate?: string | null;
  createdAt?: string;
  bookingOffice?: { id: string; name: string; type: string };
  category: { id?: string; name: string } | null;
  attestations?: Array<{ id: string; status: string; completedDate: string | null; attestationType: { name: string } }>;
  totals?: { received: number; remaining: number; extra: number; pendingCount: number; agreedAmount: number };
  setName?: string | null;
  isUrgent?: boolean;
  setMissingWarning?: boolean;
  hasUnseenWarning?: boolean;
};

type Office = { id: string; name: string };

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

function CasesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<CaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const status = searchParams.get("status") || "";
  const officeId = searchParams.get("officeId") || "";
  const dept = searchParams.get("dept") || "";
  const history = searchParams.get("history") === "1";
  const page = Number(searchParams.get("page")) || 1;

  // F5: cases list se hi expense entry (admin / office:expenses:write) —
  // detail page kholne ki zaroorat nahi. Toast popup se success/error.
  const { showToast, ToastElement } = useToast();
  const [expenseCase, setExpenseCase] = useState<CaseRow | null>(null);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ amount: "", description: "", expenseDate: toInputDate(new Date()) });

  function openExpenseModal(item: CaseRow) {
    setExpenseForm({ amount: "", description: "", expenseDate: toInputDate(new Date()) });
    setExpenseCase(item);
  }

  async function submitExpense() {
    if (!expenseCase) return;
    const amount = expenseForm.amount.trim();
    if (!amount || Number(amount) <= 0) {
      showToast("Amount sahi nahi hai", "error");
      return;
    }
    if (!expenseForm.description.trim()) {
      showToast("Expense ki tafseel likhein", "error");
      return;
    }
    if (!expenseForm.expenseDate) {
      showToast("Expense date zaroori hai", "error");
      return;
    }
    setExpenseSaving(true);
    const res = await officeFetch(`/api/office/cases/${expenseCase.id}/expenses`, {
      method: "POST",
      json: {
        amount,
        description: expenseForm.description.trim(),
        expenseDate: expenseForm.expenseDate,
      },
    });
    setExpenseSaving(false);
    if (res.ok) {
      showToast("Expense add ho gaya", "success");
      setExpenseCase(null);
    } else {
      showToast(res.error, "error");
    }
  }

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (officeId) params.set("officeId", officeId);
    if (dept) params.set("dept", dept);
    if (history) params.set("history", "1");
    if (searchParams.get("q")) params.set("q", searchParams.get("q") || "");
    params.set("page", String(page));
    const res = await officeFetch<{ items: CaseRow[]; total: number }>(`/api/office/cases?${params}`);
    if (res.ok) {
      setItems(res.data.items);
      setTotal(res.data.total);
    }
    setLoading(false);
  }, [status, officeId, dept, history, page, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    officeFetch<Office[]>("/api/office/setup/booking-offices").then((res) => {
      if (res.ok) setOffices(res.data);
    });
  }, []);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/office/cases?${params}`);
  }

  function selectDept(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (key && dept !== key) params.set("dept", key);
    else params.delete("dept");
    params.delete("history");
    params.delete("page");
    router.push(`/office/cases?${params}`);
  }

  return (
    <OfficePageFrame>
      {(admin) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">
              Cases <span className="text-sm font-normal text-slate-400">({total})</span>
            </h2>
            {adminCanAny(admin, ["office:cases:write"]) && (
              <Link
                href="/office/cases/new"
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Plus className="w-4 h-4" /> New case
              </Link>
            )}
          </div>

          {DEPT_TABS.some((tab) => canSeeDeptTab(admin, tab.permission)) && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => selectDept("")}
                className={`rounded-full px-4 py-2 text-sm font-semibold ${
                  !dept ? "bg-primary-600 text-white" : "border border-slate-200 bg-white text-slate-600"
                }`}
              >
                All cases
              </button>
              {DEPT_TABS.filter((tab) => canSeeDeptTab(admin, tab.permission)).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => selectDept(tab.key)}
                  className={`rounded-full px-4 py-2 text-sm font-semibold ${
                    dept === tab.key ? "bg-primary-600 text-white" : "border border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
              {dept === "filing" && (
                <label className="ml-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={history}
                    onChange={(e) => setParam("history", e.target.checked ? "1" : "")}
                    className="rounded border-slate-300"
                  />
                  History (filing se aage ke cases)
                </label>
              )}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <form
              className="flex flex-1 min-w-[14rem] gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setParam("q", q.trim());
              }}
            >
              <input
                className={`${input} flex-1`}
                placeholder="Case #, name, roll / reg no, phone"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="rounded-xl border border-slate-200 bg-white px-3 text-slate-600">
                <Search className="w-4 h-4" />
              </button>
            </form>
            <select className={input} value={status} onChange={(e) => setParam("status", e.target.value)}>
              <option value="">All statuses</option>
              <option value="open">Open only</option>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {admin.role !== "booking_office" && (
              <select className={input} value={officeId} onChange={(e) => setParam("officeId", e.target.value)}>
                <option value="">All offices</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Case</th>
                    <th className="px-3 py-2">Office / Category</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Money</th>
                    <th className="px-3 py-2">Print</th>
                    <th className="px-3 py-2">Attestations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                        Koi case nahi mila
                      </td>
                    </tr>
                  )}
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <Link href={`/office/cases/${item.id}`} className="font-semibold text-primary-700 hover:underline">
                            {item.caseNumber}
                          </Link>
                          {item.isUrgent && (
                            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                              <Flame className="w-3 h-3" /> URGENT
                            </span>
                          )}
                          {item.setMissingWarning && (
                            <span
                              title="Is case ka set select nahi kiya gaya"
                              className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700"
                            >
                              <AlertTriangle className="w-3 h-3" /> Set missing
                            </span>
                          )}
                          {item.hasUnseenWarning && (
                            <span
                              title="Aap ke department ke liye new remarks"
                              className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400"
                            />
                          )}
                        </div>
                        <p className="text-slate-800">{item.clientName || "—"}</p>
                        <p className="text-xs text-slate-400">
                          {item.rollNumber ? `Roll ${item.rollNumber}` : ""}
                          {item.rollNumber && item.registrationNumber ? " · " : ""}
                          {item.registrationNumber ? `Reg ${item.registrationNumber}` : ""}
                        </p>
                        <p className="text-xs text-slate-400">
                          {item.createdAt ? formatDate(item.createdAt) : ""}
                          {item.setName ? ` · Set: ${item.setName}` : ""}
                        </p>
                        {(admin.role === "admin" || adminCanAny(admin, ["office:expenses:write"])) && (
                          <button
                            type="button"
                            onClick={() => openExpenseModal(item)}
                            className="mt-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-primary-300 hover:text-primary-700"
                          >
                            <Wallet className="w-3 h-3" /> Expense
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="text-slate-800">{item.bookingOffice?.name || "—"}</p>
                        <p className="text-xs text-slate-500">{item.category?.name || "—"}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[item.status] || "bg-slate-100 text-slate-700"}`}>
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                        {(item.totals?.pendingCount ?? 0) > 0 && (
                          <p className="mt-1 text-[11px] text-amber-600">{item.totals!.pendingCount} payment verify pending</p>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-xs">
                        {item.totals ? (
                          <>
                            <p>Agreed: {formatMoney(item.totals.agreedAmount)}</p>
                            <p className="text-emerald-700">Received: {formatMoney(item.totals.received)}</p>
                            {item.totals.remaining > 0 && <p className="text-amber-700">Remaining: {formatMoney(item.totals.remaining)}</p>}
                            {item.totals.extra > 0 && <p className="text-violet-700">Extra: {formatMoney(item.totals.extra)}</p>}
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-xs">
                        {item.isPrinted !== undefined ? (
                          <>
                            <p className={item.isPrinted ? "font-semibold text-emerald-700" : "text-slate-500"}>
                              {item.isPrinted ? "Printed" : "Not printed"}
                            </p>
                            <p className="text-slate-500">Expected: {formatDate(item.expectedPrintingDate)}</p>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          {(!item.attestations || item.attestations.length === 0) && <span className="text-xs text-slate-400">—</span>}
                          {(item.attestations || []).map((a) => (
                            <span
                              key={a.id}
                              title={a.completedDate ? `Done ${formatDate(a.completedDate)}` : a.status}
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ATTESTATION_STATUS_STYLES[a.status]}`}
                            >
                              {a.attestationType.name}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {total > 50 && (
            <div className="flex justify-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setParam("page", String(page - 1))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 py-2 text-sm text-slate-500">Page {page}</span>
              <button
                disabled={page * 50 >= total}
                onClick={() => setParam("page", String(page + 1))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}

          {expenseCase && (
            <div
              className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4"
              onClick={() => !expenseSaving && setExpenseCase(null)}
            >
              <div
                className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Expense add karein</h3>
                    <p className="text-xs text-slate-500">
                      Case {expenseCase.caseNumber}
                      {expenseCase.clientName ? ` · ${expenseCase.clientName}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpenseCase(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Band karein"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Amount (Rs) *</label>
                  <input
                    className={`${input} w-full`}
                    inputMode="decimal"
                    placeholder="Maslan: 500"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Tafseel *</label>
                  <input
                    className={`${input} w-full`}
                    placeholder="Expense ki tafseel likhein"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Expense date *</label>
                  <input
                    type="date"
                    className={`${input} w-full`}
                    value={expenseForm.expenseDate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={expenseSaving}
                    onClick={() => setExpenseCase(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={expenseSaving}
                    onClick={submitExpense}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {expenseSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save expense
                  </button>
                </div>
              </div>
            </div>
          )}

          {ToastElement}
        </div>
      )}
    </OfficePageFrame>
  );
}

export default function OfficeCasesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      }
    >
      <CasesList />
    </Suspense>
  );
}
