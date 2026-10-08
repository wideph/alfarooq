"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarDays, Loader2, Plus, Save, Sparkles, Trash2 } from "lucide-react";
import { formatDate, officeFetch } from "@/lib/office/client";

// Admin panel for the WorkingDatePool table (§N6) — e.g. the 2019 pool used
// for random Bord-date picks. The API enforces: max `limit` entries per year,
// every entry a real Pakistan working day (no weekend / PAKISTAN holiday).

type PoolRow = { id: string; date: string; year: number; note: string | null };
type PoolData = { year: number; count: number; limit: number; rows: PoolRow[] };
type SuggestData = { year: number; count: number; limit: number; suggestions: string[] };

const YEARS = Array.from({ length: 12 }, (_, i) => 2019 + i); // 2019–2030

const input =
  "rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";

export default function DatePoolPanel({ onMessage }: { onMessage: (message: string) => void }) {
  const [year, setYear] = useState(2019);
  const [data, setData] = useState<PoolData | null>(null);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const [addingAll, setAddingAll] = useState(false);
  const [manualDate, setManualDate] = useState("");
  const [manualSaving, setManualSaving] = useState(false);

  const load = useCallback(async (y: number) => {
    const res = await officeFetch<PoolData>(`/api/office/setup/date-pool?year=${y}`);
    if (res.ok) setData(res.data);
  }, []);

  useEffect(() => {
    setSuggestions([]);
    void load(year);
  }, [year, load]);

  async function suggest() {
    setSuggesting(true);
    const res = await officeFetch<SuggestData>(`/api/office/setup/date-pool?year=${year}&suggest=1`);
    if (res.ok) {
      setSuggestions(res.data.suggestions);
      onMessage(
        res.data.suggestions.length > 0
          ? `${res.data.suggestions.length} candidate dates mil gayi hain`
          : "Pool full hai ya koi working date nahi mili"
      );
    } else {
      onMessage(res.error);
    }
    setSuggesting(false);
  }

  async function addDate(date: string) {
    setAdding(date);
    const res = await officeFetch("/api/office/setup/date-pool", {
      method: "POST",
      json: { year, date },
    });
    onMessage(res.ok ? "Date add ho gayi" : res.error);
    if (res.ok) {
      setSuggestions((prev) => prev.filter((item) => item !== date));
      await load(year);
    }
    setAdding(null);
  }

  // One-click "add all": POST per date, ruk jaye pehle error par (error as-is).
  async function addAll() {
    setAddingAll(true);
    let added = 0;
    for (const date of suggestions) {
      const res = await officeFetch("/api/office/setup/date-pool", {
        method: "POST",
        json: { year, date },
      });
      if (!res.ok) {
        onMessage(`${added} dates add ho gayi, phir error: ${res.error}`);
        break;
      }
      added += 1;
      setSuggestions((prev) => prev.filter((item) => item !== date));
    }
    if (added > 0) {
      onMessage(`${added} dates pool mein add ho gayi`);
      await load(year);
    }
    setAddingAll(false);
  }

  async function addManual() {
    setManualSaving(true);
    const res = await officeFetch("/api/office/setup/date-pool", {
      method: "POST",
      json: { year, date: manualDate },
    });
    onMessage(res.ok ? "Date add ho gayi" : res.error);
    if (res.ok) {
      setManualDate("");
      await load(year);
    }
    setManualSaving(false);
  }

  async function remove(row: PoolRow) {
    if (!confirm(`Pool se ye date delete karein? (${formatDate(row.date)})`)) return;
    const res = await officeFetch(`/api/office/setup/date-pool?id=${row.id}`, { method: "DELETE" });
    onMessage(res.ok ? "Delete ho gaya" : res.error);
    if (res.ok) await load(year);
  }

  const count = data?.count ?? 0;
  const limit = data?.limit ?? 30;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 p-4 border-b border-slate-100">
        <CalendarDays className="w-5 h-5 text-primary-600" />
        <h2 className="font-bold text-slate-900">2019 Working Dates Pool</h2>
      </div>
      <div className="p-5 sm:p-6 space-y-4">
        <p className="text-xs text-slate-500">
          System in men se random date Bord ke liye use karta hai jab r-number ke last digits 19-29
          na hon.
        </p>

        <div className="flex flex-col sm:flex-row sm:items-center gap-2">
          <select className={input} value={year} onChange={(e) => setYear(Number(e.target.value))}>
            {YEARS.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <span
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${
              count >= limit ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}
          >
            {count}/{limit} dates
          </span>
          <button
            onClick={suggest}
            disabled={suggesting || count >= limit}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-700 disabled:opacity-50"
          >
            {suggesting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            Suggest dates
          </button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="date"
            className={input}
            min={`${year}-01-01`}
            max={`${year}-12-31`}
            value={manualDate}
            onChange={(e) => setManualDate(e.target.value)}
          />
          <button className={primaryBtn} disabled={manualSaving || !manualDate} onClick={addManual}>
            {manualSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Manual add
          </button>
        </div>

        {suggestions.length > 0 && (
          <div className="rounded-xl border border-primary-200 bg-primary-50 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-primary-800">
                Suggested working dates ({suggestions.length}) — click kar ke add karein
              </p>
              <button
                onClick={addAll}
                disabled={addingAll}
                className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
              >
                {addingAll ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                Sab add karein
              </button>
            </div>
            <div className="flex flex-wrap gap-2">
              {suggestions.map((date) => (
                <button
                  key={date}
                  onClick={() => addDate(date)}
                  disabled={adding !== null || addingAll}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-white px-3 py-1.5 text-xs font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                >
                  {adding === date ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Plus className="w-3.5 h-3.5" />
                  )}
                  {formatDate(date)}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {(!data || data.rows.length === 0) && (
            <p className="p-4 text-sm text-slate-400">
              {year} ke pool mein koi date nahi — &quot;Suggest dates&quot; se add karein
            </p>
          )}
          {data?.rows.map((row, index) => (
            <div key={row.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                  #{index + 1}
                </span>
                <span className="font-medium text-slate-800">{formatDate(row.date)}</span>
                {row.note && <span className="text-xs text-slate-400">{row.note}</span>}
              </div>
              <button className="rounded-xl bg-red-50 p-2 text-red-600" onClick={() => remove(row)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
