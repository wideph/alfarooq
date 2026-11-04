"use client";

import { useState } from "react";
import { ExternalLink, Loader2, X } from "lucide-react";
import { formatMoney } from "@/lib/office/client";
import { caseDetailHref } from "@/lib/office/case-nav";

// BR3.6 / §W56 — commission office ke case mein agreed se zyada aayi raqam
// (sirf jo abhi TAY NAHI hui) mein se booking office ko kitna — % ya seedhi
// raqam (Rs). Pehle tay shuda hissa dobara nahi khulta.
export type ExtraDecision = { mode: "PERCENT" | "AMOUNT"; value: string; trancheId?: string };

export function extraDecisionLabel(decision: ExtraDecision) {
  return decision.mode === "PERCENT" ? `${decision.value}%` : formatMoney(Number(decision.value));
}

export default function ExtraAmountPopup({
  caseNumber,
  extra,
  onSubmit,
  onClose,
  caseId,
  editing = false,
}: {
  caseNumber: string;
  // Is faisle wali extra raqam (Rs).
  extra: number;
  onSubmit: (decision: ExtraDecision) => Promise<void>;
  onClose: () => void;
  // §W44: diya ho to "Case detail" button — case page NAYE tab mein (popup
  // aur payments list waisi hi rehti hai, faisla wahin wapas aa kar).
  caseId?: string;
  // Pehle se tay tukre ko badalna (sirf jumla farq).
  editing?: boolean;
}) {
  const [mode, setMode] = useState<"PERCENT" | "AMOUNT">("PERCENT");
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  const typed = Number(custom.replace(/,/g, ""));
  const preview =
    custom.trim() === "" || !Number.isFinite(typed)
      ? null
      : mode === "PERCENT"
        ? typed >= 0 && typed <= 100
          ? Math.round(extra * typed) / 100
          : null
        : typed >= 0 && typed <= extra
          ? typed
          : null;

  async function choose(decision: ExtraDecision) {
    setSaving(true);
    await onSubmit(decision);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-lg">Extra amount — {caseNumber}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Band karein">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900">
            {editing ? "Is tay shuda" : "Is case mein agreed amount se"} <b>{formatMoney(extra)}</b>{" "}
            {editing ? "extra payment" : "zyada aaye hain (jo abhi tay nahi hue)"}. Is extra payment mein se commission
            wale booking office ko kitna hissa jayega — rupees mein batayein (ya %).
          </p>

          <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Faisla kis tarah">
            {(["PERCENT", "AMOUNT"] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="radio"
                aria-checked={mode === option}
                onClick={() => {
                  setMode(option);
                  setCustom("");
                }}
                className={`min-h-[38px] flex-1 rounded-lg text-sm font-semibold ${
                  mode === option ? "bg-white text-slate-900 shadow" : "text-slate-500"
                }`}
              >
                {option === "PERCENT" ? "Percentage (%)" : "Seedhi raqam (Rs)"}
              </button>
            ))}
          </div>

          {mode === "PERCENT" && (
            <div className="grid grid-cols-3 gap-2">
              {[100, 50, 0].map((percent) => (
                <button
                  key={percent}
                  disabled={saving}
                  onClick={() => choose({ mode: "PERCENT", value: String(percent) })}
                  className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-3 text-sm font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-50"
                >
                  {percent}%
                  <span className="block text-xs font-normal text-primary-500">{formatMoney((extra * percent) / 100)}</span>
                </button>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <div className="flex gap-2">
              <input
                inputMode="decimal"
                placeholder={mode === "PERCENT" ? "Apna % (0 se 100)" : `Office ko Rs (0 se ${formatMoney(extra)})`}
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400"
              />
              <button
                disabled={saving || preview === null}
                onClick={() => choose({ mode, value: custom.trim().replace(/,/g, "") })}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Apply
              </button>
            </div>
            {preview !== null ? (
              <p className="text-xs text-slate-600">
                Office ko <b className="text-emerald-700">{formatMoney(preview)}</b>, company ke paas{" "}
                <b>{formatMoney(Math.round((extra - preview) * 100) / 100)}</b>
              </p>
            ) : (
              custom.trim() !== "" && (
                <p className="text-xs font-semibold text-red-600">
                  {mode === "PERCENT" ? "0 se 100 ke darmiyan likhein" : `0 se ${formatMoney(extra)} tak likhein`}
                </p>
              )
            )}
          </div>
          <p className="text-xs text-slate-400">
            Ye faisla sirf isi extra raqam ka hai — pehle tay shuda hissa nahi badalta. Baad mein case page (Payments →
            Commission) se badla ja sakta hai; ledger khud adjust hoga.
          </p>
          {caseId && (
            <a
              href={caseDetailHref(caseId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-primary-300 hover:text-primary-700"
            >
              <ExternalLink className="h-4 w-4" /> Case detail (naya tab)
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
