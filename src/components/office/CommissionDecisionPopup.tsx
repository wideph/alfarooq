"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatMoney } from "@/lib/office/client";

export type CommissionAsk = {
  amount: number;
  officeName: string;
  categoryName: string;
  members: Array<{ id: string; name: string }>;
};

export type CommissionDecision = { mode: "FULL" | "NONE" | "PARTIAL"; amount?: string; memberId?: string };

// §W45 (BR3.1a) — admin / cashier commission office ka case banaye to grid ka
// commission khud nahi lagta: admin batata hai poora / nahi / partial, aur
// office mein ek se zyada member hon to kis member ke account mein.
export default function CommissionDecisionPopup({
  ask,
  onSubmit,
  onClose,
}: {
  ask: CommissionAsk;
  onSubmit: (decision: CommissionDecision) => Promise<void>;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<CommissionDecision["mode"] | "">("");
  const [partial, setPartial] = useState("");
  const [memberId, setMemberId] = useState(ask.members.length === 1 ? ask.members[0].id : "");
  const [saving, setSaving] = useState(false);

  const partialNumber = Number(partial);
  const partialValid = partial.trim() !== "" && partialNumber > 0 && partialNumber < ask.amount;
  const needsMember = mode !== "NONE" && ask.members.length > 1;
  const ready = mode !== "" && (mode !== "PARTIAL" || partialValid) && (!needsMember || Boolean(memberId));

  async function confirm() {
    if (!ready || !mode) return;
    setSaving(true);
    await onSubmit({
      mode,
      ...(mode === "PARTIAL" ? { amount: partial.trim() } : {}),
      ...(memberId ? { memberId } : {}),
    });
    setSaving(false);
  }

  const options: Array<{ value: CommissionDecision["mode"]; title: string; hint: string }> = [
    { value: "FULL", title: "Haan, poora", hint: formatMoney(ask.amount) },
    { value: "NONE", title: "Nahi", hint: "Commission nahi" },
    { value: "PARTIAL", title: "Partial", hint: "Kuch hissa" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md animate-fade-in">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h3 className="font-bold text-lg">Booking office commission</h3>
          <button onClick={onClose} disabled={saving} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Band karein">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-700">
            Is case ka commission <span className="font-bold">{formatMoney(ask.amount)}</span> banta hai (
            {ask.officeName} — {ask.categoryName}). Booking office ko ye commission dena hai ya nahi?
          </p>
          <div className="grid grid-cols-3 gap-2">
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                disabled={saving}
                onClick={() => setMode(option.value)}
                className={`rounded-xl border px-3 py-3 text-sm font-semibold disabled:opacity-50 ${
                  mode === option.value
                    ? "border-primary-600 bg-primary-600 text-white"
                    : "border-primary-200 bg-primary-50 text-primary-700 hover:bg-primary-100"
                }`}
              >
                {option.title}
                <span className={`block text-xs font-normal ${mode === option.value ? "text-primary-100" : "text-primary-500"}`}>
                  {option.hint}
                </span>
              </button>
            ))}
          </div>
          {mode === "PARTIAL" && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Kitna commission dena hai? (Rs {ask.amount} se kam)</label>
              <input
                autoFocus
                inputMode="decimal"
                placeholder="Maslan 500"
                value={partial}
                onChange={(e) => setPartial(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400"
              />
              {partial.trim() !== "" && !partialValid && (
                <p className="mt-1 text-xs text-red-600">Amount 0 se zyada aur {formatMoney(ask.amount)} se kam ho.</p>
              )}
            </div>
          )}
          {needsMember && (
            <div>
              <label className="block text-xs text-slate-500 mb-1">Commission kis member ke account mein jaye?</label>
              <select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400"
              >
                <option value="">Select karein…</option>
                {ask.members.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          {mode !== "NONE" && ask.members.length === 1 && (
            <p className="text-xs text-slate-500">Commission {ask.members[0].name} ke account mein jayegi.</p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-600"
            >
              Wapas
            </button>
            <button
              type="button"
              disabled={saving || !ready}
              onClick={() => void confirm()}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Case banayein
            </button>
          </div>
          <p className="text-xs text-slate-400">Baad mein case page (Payments → Commission) se commission badli ja sakti hai.</p>
        </div>
      </div>
    </div>
  );
}
