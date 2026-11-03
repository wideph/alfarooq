"use client";

import { useState } from "react";
import { Loader2, Plus, Truck, X } from "lucide-react";
import SectionCard from "@/components/ui/SectionCard";
import type { ToastKind } from "@/components/Toast";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import type { DeptOwnExpense } from "@/lib/office/types";

// §W51 / §W52 — courier user ka is case par apna kharcha. Naya kharcha pehle
// admin ke review mein jata hai; manzoor hone par case ka expense banta hai aur
// "Admin se wasooli baqi" (Finance → Mera account) mein judta hai. Review mein
// pada kharcha user khud cancel kar sakta hai.
export const DEPT_EXPENSE_STATUS_CHIP: Record<DeptOwnExpense["status"], { label: string; cls: string }> = {
  ACCEPTED: { label: "Manzoor ✓", cls: "bg-emerald-100 text-emerald-700" },
  PENDING: { label: "Admin ke review mein", cls: "bg-amber-100 text-amber-800" },
  REJECTED: { label: "Wapas (manzoor nahi)", cls: "bg-slate-200 text-slate-600" },
};

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
  // §W55: Courier ya Bykea (Bykea ki wapsi Mera account mein Other expenses mein).
  const [kind, setKind] = useState<"COURIER" | "BYKEA">("COURIER");
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const accepted = items.filter((item) => item.status === "ACCEPTED").reduce((acc, item) => acc + item.amount, 0);
  const pending = items.filter((item) => item.status === "PENDING").reduce((acc, item) => acc + item.amount, 0);

  async function add() {
    if (!amount.trim() || Number(amount) <= 0) {
      onMessage(`${kind === "BYKEA" ? "Bykea" : "Courier"} amount likhein (maslan 350)`, "error");
      return;
    }
    setSaving(true);
    const res = await officeFetch<{ pending?: boolean }>(`/api/office/cases/${caseId}/dept-expenses`, {
      method: "POST",
      json: { kind, amount: amount.trim(), description: note.trim() || undefined },
    });
    setSaving(false);
    if (!res.ok) {
      onMessage(res.error, "error");
      return;
    }
    onMessage(res.data.pending ? "Admin ke review ke liye bhej diya — manzoori ke baad hisaab mein judega" : "Kharcha add ho gaya");
    setAmount("");
    setNote("");
    await onChanged();
  }

  async function cancel(id: string) {
    if (!confirm("Ye kharcha wapas le lein (admin ko review ke liye nahi jayega)?")) return;
    setCancelling(id);
    const res = await officeFetch(`/api/office/dept-expense-requests/${encodeURIComponent(id)}`, {
      method: "POST",
      json: { action: "cancel" },
    });
    setCancelling(null);
    if (!res.ok) {
      onMessage(res.error, "error");
      return;
    }
    onMessage("Kharcha wapas le liya");
    await onChanged();
  }

  return (
    <SectionCard
      icon={Truck}
      title="Courier / Bykea kharcha (aap ka)"
      count={items.length || null}
      actions={
        items.length > 0 ? (
          <span className="text-xs font-semibold text-slate-600">
            Manzoor {formatMoney(accepted)}
            {pending > 0 ? ` · review mein ${formatMoney(pending)}` : ""}
          </span>
        ) : null
      }
    >
      {items.length > 0 && (
        <ul className="mb-3 divide-y divide-slate-100 rounded-xl border border-slate-100">
          {items.map((item) => {
            const chip = DEPT_EXPENSE_STATUS_CHIP[item.status];
            return (
              <li key={`${item.status}-${item.id}`} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="block truncate font-medium text-slate-800">{item.description}</span>
                  <span className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
                    {formatDate(item.expenseDate)}
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                        item.kind === "BYKEA" ? "bg-violet-100 text-violet-700" : "bg-teal-100 text-teal-700"
                      }`}
                    >
                      {item.kind === "BYKEA" ? "Bykea" : "Courier"}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${chip.cls}`}>{chip.label}</span>
                  </span>
                  {item.status === "REJECTED" && item.decisionNote && (
                    <span className="mt-0.5 block text-xs text-slate-500">Wajah: {item.decisionNote}</span>
                  )}
                </span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className={`font-semibold ${item.status === "REJECTED" ? "text-slate-400 line-through" : "text-slate-800"}`}>
                    {formatMoney(item.amount)}
                  </span>
                  {item.canCancel && (
                    <button
                      type="button"
                      onClick={() => void cancel(item.id)}
                      disabled={cancelling === item.id}
                      aria-label="Kharcha wapas lein"
                      title="Wapas lein"
                      className="grid h-9 w-9 place-items-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"
                    >
                      {cancelling === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mb-2 flex gap-1 rounded-xl bg-slate-100 p-1" role="radiogroup" aria-label="Kharche ki qism">
        {(["COURIER", "BYKEA"] as const).map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            onClick={() => setKind(option)}
            className={`min-h-[36px] flex-1 rounded-lg px-3 text-sm font-semibold ${
              kind === option ? "bg-white text-slate-900 shadow" : "text-slate-500"
            }`}
          >
            {option === "COURIER" ? "Courier" : "Bykea"}
          </button>
        ))}
      </div>
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
          placeholder={kind === "BYKEA" ? "Note (optional) — maslan board office tak" : "Note (optional) — maslan TCS"}
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
        Jo courier / Bykea kharcha aap ne apni jeb se diya — pehle admin ke review mein jata hai; manzoor hone par case ke
        expense mein judta hai aur admin aap ko wapas dega (Finance → Mera account: courier &quot;Courier kharcha&quot;
        mein, Bykea &quot;Other expenses&quot; mein).
      </p>
    </SectionCard>
  );
}
