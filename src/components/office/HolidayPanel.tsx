"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarOff, Loader2, Save, Trash2 } from "lucide-react";
import { formatDate, officeFetch, toInputDate } from "@/lib/office/client";
import type { ToastKind } from "@/components/Toast";

// Admin panel for the HolidayClosure table (§N6). The set-date engine treats
// these dates as non-working for the given scope. Scopes are mirrored from
// src/lib/office/date-engine.ts (server-only file — do not import it here).
const HOLIDAY_SCOPES = [
  "PAKISTAN",
  "ISLAMABAD",
  "QUETTA",
  "GUJRAT",
  "LAHORE",
  "EMBASSIES_ISB",
  "SAUDI",
] as const;

type HolidayRow = { id: string; date: string; scope: string; reason: string | null };

const SCOPE_STYLES: Record<string, string> = {
  PAKISTAN: "bg-red-100 text-red-700",
  ISLAMABAD: "bg-sky-100 text-sky-700",
  QUETTA: "bg-amber-100 text-amber-700",
  GUJRAT: "bg-emerald-100 text-emerald-700",
  LAHORE: "bg-violet-100 text-violet-700",
  EMBASSIES_ISB: "bg-pink-100 text-pink-700",
  SAUDI: "bg-teal-100 text-teal-700",
};

const input =
  "rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const ghostBtn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";

const emptyForm = { id: "", date: "", scope: "PAKISTAN" as string, reason: "" };

export default function HolidayPanel({ onMessage }: { onMessage: (message: string, kind?: ToastKind) => void }) {
  const [rows, setRows] = useState<HolidayRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await officeFetch<HolidayRow[]>("/api/office/setup/holidays");
    if (res.ok) setRows(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    const res = await officeFetch("/api/office/setup/holidays", {
      method: form.id ? "PATCH" : "POST",
      json: form.id
        ? { id: form.id, date: form.date, scope: form.scope, reason: form.reason }
        : { date: form.date, scope: form.scope, reason: form.reason },
    });
    onMessage(res.ok ? (form.id ? "Chhuti update ho gayi" : "Chhuti add ho gayi") : res.error, res.ok ? "success" : "error");
    if (res.ok) {
      setForm(emptyForm);
      await load();
    }
    setSaving(false);
  }

  async function remove(row: HolidayRow) {
    if (!confirm(`Chhuti delete karein? (${formatDate(row.date)} — ${row.scope})`)) return;
    const res = await officeFetch(`/api/office/setup/holidays?id=${row.id}`, { method: "DELETE" });
    onMessage(res.ok ? "Delete ho gaya" : res.error, res.ok ? "success" : "error");
    if (res.ok) {
      if (form.id === row.id) setForm(emptyForm);
      await load();
    }
  }

  // Group by year (desc), rows inside each year already come date-asc from the API.
  const byYear = new Map<string, HolidayRow[]>();
  for (const row of rows) {
    const year = row.date.slice(0, 4);
    const list = byYear.get(year) || [];
    list.push(row);
    byYear.set(year, list);
  }
  const years = [...byYear.keys()].sort((a, b) => Number(b) - Number(a));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 p-4 border-b border-slate-100">
        <CalendarOff className="w-5 h-5 text-primary-600" />
        <h2 className="font-bold text-slate-900">Holidays / Band din</h2>
      </div>
      <div className="p-5 sm:p-6 space-y-4">
        <p className="text-xs text-slate-500">
          In dates ko system set dates calculate karte waqt non-working samjhe ga. Eid wali dates
          approximate hain — zaroorat ho to edit karein.
        </p>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-slate-800">
            {form.id ? "Chhuti edit karein" : "Nayi chhuti add karein"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              type="date"
              className={input}
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
            />
            <select
              className={input}
              value={form.scope}
              onChange={(e) => setForm({ ...form, scope: e.target.value })}
            >
              {HOLIDAY_SCOPES.map((scope) => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
            <input
              className={input}
              placeholder="Reason (e.g. Eid ul Fitr, 23 March)"
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
            />
            <div className="flex gap-2">
              <button className={primaryBtn} disabled={saving || !form.date} onClick={save}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {form.id ? "Update" : "Add"}
              </button>
              {form.id && (
                <button className={ghostBtn} onClick={() => setForm(emptyForm)}>
                  Cancel
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-400">
            Same date + scope dobara add karne par purani reason update ho jayegi.
          </p>
        </div>

        {rows.length === 0 && (
          <p className="rounded-xl border border-slate-200 p-4 text-center text-sm text-slate-400">
            Koi chhuti add nahi hui
          </p>
        )}

        {years.map((year) => (
          <div key={year} className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
              {year} ({byYear.get(year)?.length || 0})
            </p>
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Date</th>
                    <th className="px-3 py-2">Scope</th>
                    <th className="px-3 py-2">Reason</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(byYear.get(year) || []).map((row) => (
                    <tr key={row.id} className={form.id === row.id ? "bg-primary-50" : undefined}>
                      <td className="px-3 py-2 font-medium whitespace-nowrap">{formatDate(row.date)}</td>
                      <td className="px-3 py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                            SCOPE_STYLES[row.scope] || "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {row.scope}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-500">{row.reason || "—"}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <button
                          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"
                          onClick={() =>
                            setForm({
                              id: row.id,
                              date: toInputDate(row.date),
                              scope: row.scope,
                              reason: row.reason || "",
                            })
                          }
                        >
                          Edit
                        </button>
                        <button
                          className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                          onClick={() => remove(row)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
