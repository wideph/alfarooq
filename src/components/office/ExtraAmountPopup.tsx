"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatMoney } from "@/lib/office/client";

// BR3.6 — shown when a fixed-commission case received more than agreed and the
// booking office's share of the extra has not been decided yet.
export default function ExtraAmountPopup({
  caseNumber,
  extra,
  onSubmit,
  onClose,
}: {
  caseNumber: string;
  extra: number;
  onSubmit: (percent: number) => Promise<void>;
  onClose: () => void;
}) {
  const [custom, setCustom] = useState("");
  const [saving, setSaving] = useState(false);

  async function choose(percent: number) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) return;
    setSaving(true);
    await onSubmit(percent);
    setSaving(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-lg">Extra amount — {caseNumber}</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-700">
            Is case mein agreed amount se <span className="font-bold">{formatMoney(extra)}</span> zyada receive
            hui hai. Is extra amount ka kitna % booking office ko jana chahiye?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[100, 50, 0].map((percent) => (
              <button
                key={percent}
                disabled={saving}
                onClick={() => choose(percent)}
                className="rounded-xl border border-primary-200 bg-primary-50 px-3 py-3 text-sm font-semibold text-primary-700 hover:bg-primary-100 disabled:opacity-50"
              >
                {percent}%
                <span className="block text-xs font-normal text-primary-500">{formatMoney((extra * percent) / 100)}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              placeholder="Custom %"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400"
            />
            <button
              disabled={saving || custom.trim() === ""}
              onClick={() => choose(Number(custom))}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Apply
            </button>
          </div>
          <p className="text-xs text-slate-400">Baad mein case page se % badla ja sakta hai; ledger khud adjust hoga.</p>
        </div>
      </div>
    </div>
  );
}
