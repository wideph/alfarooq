"use client";

import { useCallback, useEffect, useState } from "react";
import { Globe, KeyRound, Loader2, Save, Zap } from "lucide-react";
import { officeFetch } from "@/lib/office/client";
import type { ToastKind } from "@/components/Toast";

type Status = {
  tavilyKey: string | null;
  tavilyFromEnv: boolean;
  ai: { enabled: boolean; provider: string; model: string; hasKey: boolean } | null;
  lastCheck: { checkedAt: string; online: boolean; model: string | null } | null;
  weekChecks: { online: number; offline: number };
};
type TestResult = { ok: boolean; count: number; sample: Array<{ title: string; url: string; seen: string }> };

const input =
  "rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

// §W61 — dates ka ONLINE check: Tavily (internet search) se taaza khabrein,
// attached AI (Settings → Bot) un ko parh kar har din ka faisla karta hai.
export default function DateAiPanel({ onMessage }: { onMessage: (message: string, kind?: ToastKind) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [key, setKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<TestResult | null>(null);

  const load = useCallback(async () => {
    const res = await officeFetch<Status>("/api/office/setup/date-ai");
    if (res.ok) setStatus(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(value: string) {
    setSaving(true);
    const res = await officeFetch<{ tavilyKey: string | null }>("/api/office/setup/date-ai", { method: "PUT", json: { tavilyApiKey: value } });
    onMessage(res.ok ? (value ? "Tavily key save ho gayi — aane wali dates ka online check shuru" : "Tavily key hata di") : res.error, res.ok ? "success" : "error");
    if (res.ok) {
      setKey("");
      await load();
    }
    setSaving(false);
  }

  async function runTest() {
    setTesting(true);
    setTest(null);
    const res = await officeFetch<TestResult>("/api/office/setup/date-ai", { method: "POST" });
    if (res.ok) {
      setTest(res.data);
      onMessage(`Tavily chal raha hai — ${res.data.count} khabrein mili`);
    } else onMessage(res.error, "error");
    setTesting(false);
  }

  const aiOk = Boolean(status?.ai?.enabled && status.ai.hasKey && status.ai.model);
  const tavilyOk = Boolean(status?.tavilyKey || status?.tavilyFromEnv);

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 p-4 border-b border-slate-100">
        <Globe className="w-5 h-5 text-primary-600" />
        <h2 className="font-bold text-slate-900">Dates ka online check (AI + internet)</h2>
      </div>
      <div className="p-5 sm:p-6 space-y-4">
        <p className="text-xs text-slate-500">
          Har attestation / printing date jo pehle se tay nahi (weekend, built-in chhutti, Holidays table) — system
          Tavily se internet ki taaza khabrein lata hai (achanak chhutti, Islamabad local holiday, section 144, embassy
          band…) aur attached AI un ko parh kar faisla karta hai. 20 din se aage ki date tentative rehti hai; 20 din ke
          andar aate hi check, phir roz dobara jab tak din guzar na jaye. Chhutti mili to date khud aage + department ko
          remark.
        </p>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className={`rounded-xl border p-3 text-xs ${aiOk ? "border-emerald-200 bg-emerald-50" : "border-red-200 bg-red-50"}`}>
            <p className="font-semibold text-slate-800">AI (faisla)</p>
            <p className="mt-0.5 text-slate-600">
              {status?.ai ? `${status.ai.provider} / ${status.ai.model || "—"}` : "—"} ·{" "}
              {aiOk ? "chal raha hai" : "band — Settings → Bot mein AI on karein"}
            </p>
          </div>
          <div className={`rounded-xl border p-3 text-xs ${tavilyOk ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
            <p className="font-semibold text-slate-800">Tavily (internet khabrein)</p>
            <p className="mt-0.5 text-slate-600">
              {status?.tavilyKey
                ? `Key lagi hai ${status.tavilyKey}`
                : status?.tavilyFromEnv
                  ? "Key server env (TAVILY_API_KEY) se"
                  : "Key nahi — abhi muft GDELT (aksar limit) ya sirf AI ka ilm"}
            </p>
          </div>
        </div>

        {status && (
          <p className="text-[11px] text-slate-500">
            Pichle 7 din: {status.weekChecks.online} online checks, {status.weekChecks.offline} bina online.{" "}
            {status.lastCheck
              ? `Aakhri check: ${new Date(status.lastCheck.checkedAt).toLocaleString("en-GB", { timeZone: "Asia/Karachi" })}`
              : "Abhi koi check nahi hua."}
          </p>
        )}

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-slate-800">
            <KeyRound className="w-4 h-4" /> Tavily API key
          </p>
          <p className="text-[11px] text-slate-500">
            tavily.com par account → API key (tvly-…). Mahana 1000 credits muft; ek check ~2 credits.
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="password"
              autoComplete="off"
              className={`${input} flex-1`}
              placeholder="tvly-..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
            <button
              onClick={() => save(key.trim())}
              disabled={saving || !key.trim()}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
            <button
              onClick={runTest}
              disabled={testing || !tavilyOk}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2.5 text-sm font-semibold text-primary-700 disabled:opacity-50"
            >
              {testing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />} Test
            </button>
            {status?.tavilyKey && (
              <button
                onClick={() => confirm("Tavily key hata dein?") && save("")}
                disabled={saving}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-600"
              >
                Hatayein
              </button>
            )}
          </div>
          {test && (
            <ul className="space-y-1 text-xs text-slate-600">
              {test.sample.map((item) => (
                <li key={item.url} className="truncate">
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-primary-700 hover:underline">
                    {item.title}
                  </a>{" "}
                  {item.seen && <span className="text-slate-400">({item.seen})</span>}
                </li>
              ))}
              {test.sample.length === 0 && <li>Key chal rahi hai, magar is search par koi khabar nahi mili.</li>}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
