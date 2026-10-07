"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, Loader2, Save, Search, Trash2 } from "lucide-react";
import { formatDate, officeFetch, todayInputDate } from "@/lib/office/client";

type Row = {
  id: string;
  candidateDate: string;
  workingDate: string;
  isCandidateWorking: boolean;
  reason: string | null;
  source: "AI" | "FALLBACK" | "MANUAL";
};

const input =
  "rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

const SOURCE_STYLES: Record<Row["source"], string> = {
  AI: "bg-violet-100 text-violet-700",
  FALLBACK: "bg-amber-100 text-amber-700",
  MANUAL: "bg-emerald-100 text-emerald-700",
};

// Super admin view of the Pakistan working-day cache used for expected
// printing dates (BR7). Lets them test a date and override AI/fallback results.
export default function WorkingDayPanel({ onMessage }: { onMessage: (message: string) => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [testDate, setTestDate] = useState(todayInputDate());
  const [testing, setTesting] = useState(false);
  const [override, setOverride] = useState({ candidateDate: "", workingDate: "", reason: "" });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await officeFetch<Row[]>("/api/office/working-day");
    if (res.ok) setRows(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function test() {
    setTesting(true);
    const res = await officeFetch<Row>("/api/office/working-day", { method: "POST", json: { date: testDate } });
    if (res.ok) {
      onMessage(
        `${formatDate(res.data.candidateDate)} → working day ${formatDate(res.data.workingDate)} (${res.data.source}${
          res.data.reason ? `: ${res.data.reason}` : ""
        })`
      );
      await load();
    } else {
      onMessage(res.error);
    }
    setTesting(false);
  }

  async function saveOverride() {
    setSaving(true);
    const res = await officeFetch<Row & { refreshedCases: number }>("/api/office/working-day", {
      method: "PUT",
      json: override,
    });
    onMessage(res.ok ? `Override save ho gaya (${res.data.refreshedCases} open cases refresh)` : res.error);
    if (res.ok) {
      setOverride({ candidateDate: "", workingDate: "", reason: "" });
      await load();
    }
    setSaving(false);
  }

  async function remove(row: Row) {
    if (!confirm("Ye cache row delete karein? Agli baar AI dobara pooche ga.")) return;
    const res = await officeFetch(`/api/office/working-day?date=${row.candidateDate.slice(0, 10)}`, {
      method: "DELETE",
    });
    onMessage(res.ok ? "Row delete ho gayi" : res.error);
    if (res.ok) await load();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 p-4 border-b border-slate-100">
        <CalendarCheck className="w-5 h-5 text-primary-600" />
        <h2 className="font-bold text-slate-900">Pakistan Working Days (expected printing date)</h2>
      </div>
      <div className="p-5 sm:p-6 space-y-4">
        <p className="text-xs text-slate-500">
          Expected printing date = payment date + 6 din ke baad pehla working day. AI (Settings → Bot) se
          holidays check hoti hain aur result yahan cache hota hai. Ghalat result ko yahan override karein.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input type="date" className={input} value={testDate} onChange={(e) => setTestDate(e.target.value)} />
          <button
            onClick={test}
            disabled={testing || !testDate}
            className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-700 disabled:opacity-50"
          >
            {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Check working day
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-slate-800">Manual override</p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <input
              type="date"
              className={input}
              value={override.candidateDate}
              onChange={(e) => setOverride({ ...override, candidateDate: e.target.value })}
            />
            <input
              type="date"
              className={input}
              value={override.workingDate}
              onChange={(e) => setOverride({ ...override, workingDate: e.target.value })}
            />
            <input
              className={input}
              placeholder="Reason (e.g. Eid holiday)"
              value={override.reason}
              onChange={(e) => setOverride({ ...override, reason: e.target.value })}
            />
            <button
              onClick={saveOverride}
              disabled={saving || !override.candidateDate || !override.workingDate}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Save
            </button>
          </div>
          <p className="text-xs text-slate-400">Pehli date = candidate (payment + 6), doosri = actual working day.</p>
        </div>

        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Candidate</th>
                <th className="px-3 py-2">Working day</th>
                <th className="px-3 py-2">Reason</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-4 text-center text-slate-400">
                    Abhi koi date check nahi hui
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={row.id}>
                  <td className="px-3 py-2">{formatDate(row.candidateDate)}</td>
                  <td className="px-3 py-2 font-medium">{formatDate(row.workingDate)}</td>
                  <td className="px-3 py-2 text-slate-500">{row.reason || (row.isCandidateWorking ? "Working day" : "—")}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SOURCE_STYLES[row.source]}`}>
                      {row.source}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button className="rounded-lg p-1.5 text-red-500 hover:bg-red-50" onClick={() => remove(row)}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
