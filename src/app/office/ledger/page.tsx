"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Loader2, Save, Trash2 } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import { adminCanAny, type AdminNavUser } from "@/components/admin/AdminNav";
import { formatDate, formatMoney, officeFetch, todayInputDate } from "@/lib/office/client";
import { LEDGER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { BOOKING_OFFICE_TYPE_LABELS, PAYMENT_METHODS, type BookingOfficeType } from "@/lib/office/permissions";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";

type Office = {
  id: string;
  name: string;
  type: BookingOfficeType;
  members: Array<{ id: string; name: string; profitPercent: number; isActive: boolean }>;
};
type Entry = {
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
  items: Entry[];
  total: number;
  officeBalances: Record<string, number>;
  memberBalances: Record<string, number>;
};
type Salary = {
  id: string;
  amount: number;
  periodMonth: string;
  paidDate: string | null;
  remarks: string | null;
  bookingOffice: { id: string; name: string };
  member: { id: string; name: string } | null;
};
type CompanyExpense = { id: string; amount: number; description: string; category: string | null; expenseDate: string };

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";
const primaryBtn = "inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";

export default function OfficeLedgerPage() {
  return (
    <OfficePageFrame requiredAny={["office:ledger:read", "office:ledger:write", "office:expenses:write", "office:cases:read"]}>
      {(admin) => <LedgerBody admin={admin} />}
    </OfficePageFrame>
  );
}

function LedgerBody({ admin }: { admin: AdminNavUser }) {
  const isBookingOffice = admin.role === "booking_office";
  const canLedger = isBookingOffice || adminCanAny(admin, ["office:ledger:read", "office:ledger:write"]);
  const canPayout = adminCanAny(admin, ["office:ledger:write"]);
  const canExpenses = adminCanAny(admin, ["office:expenses:write"]);

  const [tab, setTab] = useState<"LEDGER" | "SALARIES" | "EXPENSES">(canLedger ? "LEDGER" : "SALARIES");
  const [offices, setOffices] = useState<Office[]>([]);
  const [officeId, setOfficeId] = useState("");
  const [data, setData] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<ToastData | null>(null);
  const setMessage = (m: string, kind: ToastKind = "success") =>
    setToast(m ? { message: m, kind } : null);
  const [payout, setPayout] = useState({ memberId: "", amount: "", entryDate: todayInputDate(), method: "CASH", remarks: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    officeFetch<Office[]>("/api/office/setup/booking-offices").then((res) => {
      if (res.ok) {
        setOffices(res.data);
        if (isBookingOffice && res.data[0]) setOfficeId(res.data[0].id);
      }
    });
  }, [isBookingOffice]);

  const load = useCallback(async () => {
    if (!canLedger) return;
    setLoading(true);
    const res = await officeFetch<LedgerResponse>(`/api/office/ledger${officeId ? `?officeId=${officeId}` : ""}`);
    if (res.ok) setData(res.data);
    else setMessage(res.error, "error");
    setLoading(false);
  }, [officeId, canLedger]);

  useEffect(() => {
    void load();
  }, [load]);

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

  async function deleteEntry(entry: Entry) {
    if (!confirm("Payout entry delete karein?")) return;
    const res = await officeFetch(`/api/office/ledger?id=${entry.id}`, { method: "DELETE" });
    setMessage(res.ok ? "Entry delete ho gayi" : res.error, res.ok ? "success" : "error");
    if (res.ok) await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold text-slate-900">Ledger & Accounts</h2>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {canLedger && <TabBtn active={tab === "LEDGER"} onClick={() => setTab("LEDGER")} label="Office accounts" />}
          {canExpenses && <TabBtn active={tab === "SALARIES"} onClick={() => setTab("SALARIES")} label="Salaries" />}
          {canExpenses && <TabBtn active={tab === "EXPENSES"} onClick={() => setTab("EXPENSES")} label="Company expenses" />}
        </div>
      </div>

      <Toast toast={toast} onClose={() => setToast(null)} />

      {tab === "LEDGER" && canLedger && (
        <>
          {!isBookingOffice && (
            <select className={input} value={officeId} onChange={(e) => setOfficeId(e.target.value)}>
              <option value="">All offices (entries)</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name} — {BOOKING_OFFICE_TYPE_LABELS[o.type]}
                </option>
              ))}
            </select>
          )}

          {data && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(officeId ? [officeId] : Object.keys(data.officeBalances)).map((id) => {
                const o = offices.find((x) => x.id === id);
                const balance = data.officeBalances[id] || 0;
                return (
                  <div key={id} className={`rounded-2xl border p-4 shadow-sm ${balance < 0 ? "border-red-200 bg-red-50" : "border-slate-200 bg-white"}`}>
                    <p className="text-xs font-semibold uppercase text-slate-500">{o?.name || "Office"}</p>
                    <p className={`mt-1 text-2xl font-bold ${balance < 0 ? "text-red-700" : "text-slate-900"}`}>{formatMoney(balance)}</p>
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
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
              <p className="font-semibold text-slate-800">Record payout — {office.name}</p>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-2">
                <select className={input} value={payout.memberId} onChange={(e) => setPayout({ ...payout, memberId: e.target.value })}>
                  <option value="">Office (general)</option>
                  {office.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
                <input className={input} inputMode="decimal" placeholder="Amount" value={payout.amount} onChange={(e) => setPayout({ ...payout, amount: e.target.value })} />
                <input type="date" className={input} value={payout.entryDate} onChange={(e) => setPayout({ ...payout, entryDate: e.target.value })} />
                <select className={input} value={payout.method} onChange={(e) => setPayout({ ...payout, method: e.target.value })}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
                <input className={input} placeholder="Remarks" value={payout.remarks} onChange={(e) => setPayout({ ...payout, remarks: e.target.value })} />
              </div>
              <button className={primaryBtn} disabled={saving || !payout.amount} onClick={submitPayout}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save payout
              </button>
            </div>
          )}

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="animate-pulse divide-y divide-slate-100" aria-label="Ledger load ho raha hai">
                <div className="bg-slate-50 px-3 py-2">
                  <div className="h-3 w-1/2 rounded bg-slate-200" />
                </div>
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 px-3 py-3">
                    <div className="h-3.5 w-20 rounded bg-slate-200" />
                    <div className="h-3.5 flex-1 rounded bg-slate-100" />
                    <div className="h-3.5 w-16 rounded bg-slate-100" />
                    <div className="h-3.5 w-14 rounded bg-slate-200" />
                  </div>
                ))}
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Office / Member</th>
                    <th className="px-3 py-2">Type</th>
                    <th className="px-3 py-2">Case</th>
                    <th className="px-3 py-2 text-right">Credit</th>
                    <th className="px-3 py-2 text-right">Debit</th>
                    <th className="px-3 py-2">Remarks</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data?.items || []).length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                        Koi entry nahi
                      </td>
                    </tr>
                  )}
                  {(data?.items || []).map((e) => (
                    <tr key={e.id}>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDate(e.entryDate)}</td>
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
                      <td className="px-3 py-2 text-right text-emerald-700">{e.direction === "CREDIT" ? formatMoney(e.amount) : ""}</td>
                      <td className="px-3 py-2 text-right text-red-700">{e.direction === "DEBIT" ? formatMoney(e.amount) : ""}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{e.remarks || ""}</td>
                      <td className="px-3 py-2">
                        {admin.role === "admin" && e.type === "PAYOUT" && (
                          <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => deleteEntry(e)}>
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === "SALARIES" && canExpenses && <SalariesPanel offices={offices.filter((o) => o.type === "SALARY")} onMessage={setMessage} />}
      {tab === "EXPENSES" && canExpenses && <CompanyExpensesPanel onMessage={setMessage} />}
    </div>
  );
}

function TabBtn({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} className={`rounded-lg px-3 py-2 min-h-[40px] text-sm font-semibold ${active ? "bg-white shadow text-slate-900" : "text-slate-500"}`}>
      {label}
    </button>
  );
}

function SalariesPanel({ offices, onMessage }: { offices: Office[]; onMessage: (m: string, kind?: ToastKind) => void }) {
  const [items, setItems] = useState<Salary[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    bookingOfficeId: "",
    memberId: "",
    amount: "",
    periodMonth: todayInputDate().slice(0, 7),
    paidDate: "",
    remarks: "",
  });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await officeFetch<Salary[]>("/api/office/salaries");
    if (res.ok) setItems(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const office = offices.find((o) => o.id === form.bookingOfficeId);

  async function save() {
    setSaving(true);
    const res = await officeFetch("/api/office/salaries", { method: "POST", json: form });
    onMessage(res.ok ? "Salary entry save ho gayi" : res.error, res.ok ? "success" : "error");
    if (res.ok) {
      setForm({ ...form, amount: "", remarks: "" });
      await load();
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Salary entry delete karein?")) return;
    const res = await officeFetch(`/api/office/salaries?id=${id}`, { method: "DELETE" });
    onMessage(res.ok ? "Delete ho gayi" : res.error, res.ok ? "success" : "error");
    if (res.ok) await load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <p className="font-semibold text-slate-800">Add salary (salary-based offices)</p>
        {offices.length === 0 && <p className="text-sm text-amber-600">Koi salary-based office nahi hai (Setup mein banayein).</p>}
        <div className="grid grid-cols-1 md:grid-cols-6 gap-2">
          <select className={input} value={form.bookingOfficeId} onChange={(e) => setForm({ ...form, bookingOfficeId: e.target.value, memberId: "" })}>
            <option value="">Office…</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
          <select className={input} value={form.memberId} onChange={(e) => setForm({ ...form, memberId: e.target.value })}>
            <option value="">Staff…</option>
            {(office?.members || []).map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <input className={input} inputMode="decimal" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input type="month" className={input} value={form.periodMonth} onChange={(e) => setForm({ ...form, periodMonth: e.target.value })} />
          <input type="date" className={input} value={form.paidDate} onChange={(e) => setForm({ ...form, paidDate: e.target.value })} />
          <input className={input} placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
        </div>
        <button className={primaryBtn} disabled={saving || !form.bookingOfficeId || !form.amount} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save salary
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <TableSkeleton rows={4} />
        ) : (
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Month</th>
              <th className="px-3 py-2">Office / Staff</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th className="px-3 py-2">Paid</th>
              <th className="px-3 py-2">Remarks</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                  Koi salary entry nahi
                </td>
              </tr>
            )}
            {items.map((s) => (
              <tr key={s.id}>
                <td className="px-3 py-2">{s.periodMonth}</td>
                <td className="px-3 py-2">
                  {s.bookingOffice.name}
                  {s.member && <span className="text-slate-500"> · {s.member.name}</span>}
                </td>
                <td className="px-3 py-2 text-right">{formatMoney(s.amount)}</td>
                <td className="px-3 py-2">{formatDate(s.paidDate)}</td>
                <td className="px-3 py-2 text-xs text-slate-500">{s.remarks || ""}</td>
                <td className="px-3 py-2">
                  <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => remove(s.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
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

function CompanyExpensesPanel({ onMessage }: { onMessage: (m: string, kind?: ToastKind) => void }) {
  const [items, setItems] = useState<CompanyExpense[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ amount: "", description: "", category: "", expenseDate: todayInputDate() });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await officeFetch<CompanyExpense[]>("/api/office/expenses");
    if (res.ok) setItems(res.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    const res = await officeFetch("/api/office/expenses", { method: "POST", json: form });
    onMessage(res.ok ? "Expense save ho gaya" : res.error, res.ok ? "success" : "error");
    if (res.ok) {
      setForm({ ...form, amount: "", description: "" });
      await load();
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Expense delete karein?")) return;
    const res = await officeFetch(`/api/office/expenses?id=${id}`, { method: "DELETE" });
    onMessage(res.ok ? "Delete ho gaya" : res.error, res.ok ? "success" : "error");
    if (res.ok) await load();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <p className="font-semibold text-slate-800">Add company expense (rent, bills, misc)</p>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input className={input} inputMode="decimal" placeholder="Amount" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
          <input className={input} placeholder="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <input className={input} placeholder="Category (optional)" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} />
          <input type="date" className={input} value={form.expenseDate} onChange={(e) => setForm({ ...form, expenseDate: e.target.value })} />
        </div>
        <button className={primaryBtn} disabled={saving || !form.amount || !form.description.trim()} onClick={save}>
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save expense
        </button>
      </div>
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading ? (
          <TableSkeleton rows={4} />
        ) : (
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2">Description</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2 text-right">Amount</th>
              <th></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-slate-400">
                  Koi expense nahi
                </td>
              </tr>
            )}
            {items.map((e) => (
              <tr key={e.id}>
                <td className="px-3 py-2">{formatDate(e.expenseDate)}</td>
                <td className="px-3 py-2">{e.description}</td>
                <td className="px-3 py-2 text-slate-500">{e.category || "—"}</td>
                <td className="px-3 py-2 text-right">{formatMoney(e.amount)}</td>
                <td className="px-3 py-2">
                  <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => remove(e.id)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        )}
      </div>
    </div>
  );
}
