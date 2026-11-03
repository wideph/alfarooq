"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2, Truck } from "lucide-react";
import SectionCard from "@/components/ui/SectionCard";
import type { ToastKind } from "@/components/Toast";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import type { DeptOwnExpense } from "@/lib/office/types";

// §W51 — courier user ka is case par apna kharcha (slip ke saath na daala ho
// ya ghalat ho to yahan). Case ka expense banta hai; total aur "Admin se
// wasooli baqi" Finance → Mera account mein. Apna kharcha 24 ghante tak khud
// hata sakta hai.
export default function CourierExpensesCard({
  caseId,
  items,
  onChanged,
  onMessage,
}: {
  caseId: string;
  items: DeptOwnExpense[];
  onChanged: () => Promise<void> | void;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const total = items.reduce((acc, item) => acc + item.amount, 0);

  async function add() {
    if (!amount.trim() || Number(amount) <= 0) {
      onMessage("Courier amount likhein (maslan 350)", "error");
      return;
    }
    setSaving(true);
    const res = await officeFetch(`/api/office/cases/${caseId}/dept-expenses`, {
      method: "POST",
      json: { amount: amount.trim(), description: note.trim() || undefined },
    });
    setSaving(false);
    if (!res.ok) {
      onMessage(res.error, "error");
      return;
    }
    onMessage("Courier kharcha add ho gaya — admin se wasooli mein shamil");
    setAmount("");
    setNote("");
    await onChanged();
  }

  async function remove(id: string) {
    if (!confirm("Ye courier kharcha hata dein?")) return;
    setRemoving(id);
    const res = await officeFetch(`/api/office/dept-expenses?kind=COURIER&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setRemoving(null);
    if (!res.ok) {
      onMessage(res.error, "error");
      return;
    }
    onMessage("Courier kharcha hat gaya");
    await onChanged();
  }

  return (
    <SectionCard
      icon={Truck}
      title="Courier kharcha (aap ka)"
      count={items.length || null}
      actions={items.length > 0 ? <span className="text-sm font-semibold text-slate-600">Total {formatMoney(total)}</span> : null}
    >
      {items.length > 0 && (
        <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {items.map((item) => (
            <li key={item.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
              <span className="min-w-0">
                <span className="block truncate font-medium text-slate-800">{item.description}</span>
                <span className="text-xs text-slate-400">{formatDate(item.expenseDate)}</span>
              </span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="font-semibold text-slate-800">{formatMoney(item.amount)}</span>
                {item.canDelete && (
                  <button
                    type="button"
                    onClick={() => void remove(item.id)}
                    disabled={removing === item.id}
                    aria-label="Kharcha hatayein"
                    className="grid h-9 w-9 place-items-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"
                  >
                    {removing === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[9rem_1fr_auto]">
        <input
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          inputMode="decimal"
          placeholder="Amount (Rs)"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <input
          className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          placeholder="Note (optional) — maslan TCS"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <button
          type="button"
          onClick={() => void add()}
          disabled={saving}
          className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Add karein
        </button>
      </div>
      <p className="mt-2 text-[11px] text-slate-400">
        Jo courier kharcha aap ne apni jeb se diya — case ke expense mein judta hai aur admin aap ko wapas dega (Finance
        → Mera account).
      </p>
    </SectionCard>
  );
}
