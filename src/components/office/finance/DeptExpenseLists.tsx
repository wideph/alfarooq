"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Check, Loader2, Trash2, X } from "lucide-react";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import { caseDetailHref } from "@/lib/office/case-nav";
import { DEPT_PAYOUT_KIND_LABELS, DEPT_PAYOUT_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import type { ToastKind } from "@/components/Toast";
import { dueToneClass } from "./ui";
import type { DeptExpenseReviewRow, DeptExpenseRow, DeptMoney, DeptPayoutRequestRow } from "./types";

// §W51 — department kharchon / payment requests ki lists (admin drawer + dept
// user ka "Mera account" — ek hi shakal).

const KIND_CHIP: Record<string, string> = {
  COMMISSION: "bg-emerald-100 text-emerald-700",
  COURIER_EXPENSE: "bg-teal-100 text-teal-700",
  OTHER_EXPENSE: "bg-violet-100 text-violet-700",
};

const STATUS_CHIP: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-800",
  ACCEPTED: "bg-emerald-100 text-emerald-700",
  REJECTED: "bg-slate-100 text-slate-500",
};

export function DeptKindChip({ kind }: { kind: string }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_CHIP[kind] || "bg-slate-100 text-slate-600"}`}>
      {DEPT_PAYOUT_KIND_LABELS[kind] || kind}
    </span>
  );
}

// Kul kharcha − wapas mila = admin se wasooli baqi (+ pending request).
export function DeptMoneyEquation({ money, title }: { money: DeptMoney; title: string }) {
  return (
    <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">{title}</span>
        <span className="font-semibold text-slate-800">{formatMoney(money.total)}</span>
      </div>
      <div className="flex items-center justify-between text-sm">
        <span className="text-slate-600">Wapas mil gaya</span>
        <span className="font-semibold text-sky-700">− {formatMoney(money.paid)}</span>
      </div>
      <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2.5">
        <span className="text-sm font-bold text-slate-900">= Admin se wasooli baqi</span>
        <span className={`text-lg font-bold ${dueToneClass(money.remaining)}`}>{formatMoney(money.remaining)}</span>
      </div>
      {money.pending > 0 && (
        <p className="text-xs font-semibold text-sky-700">
          Is mein se {formatMoney(money.pending)} ki payment request tasdeeq ke intezar mein
        </p>
      )}
    </div>
  );
}

export function DeptExpenseList({
  kind,
  rows,
  empty,
  onChanged,
  onToast,
}: {
  kind: "COURIER" | "OTHER";
  rows: DeptExpenseRow[];
  empty: string;
  onChanged: () => Promise<void> | void;
  onToast: (message: string, kind: ToastKind) => void;
}) {
  // §W34: case link par yehi page "from" — detail se wapsi yahin.
  const pathname = usePathname();
  const [removing, setRemoving] = useState<string | null>(null);

  async function remove(row: DeptExpenseRow) {
    if (!confirm("Ye kharcha hata dein?")) return;
    const id = row.id;
    // §W55: Other expenses list mein Bykea (case expense) bhi — row apni qism batati hai.
    const deleteKind = row.deleteKind || kind;
    setRemoving(id);
    const res = await officeFetch(`/api/office/dept-expenses?kind=${deleteKind}&id=${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    setRemoving(null);
    if (!res.ok) {
      onToast(res.error, "error");
      return;
    }
    onToast("Kharcha hat gaya", "success");
    await onChanged();
  }

  if (rows.length === 0) {
    return <p className="rounded-xl border border-slate-100 px-3 py-3 text-sm text-slate-400">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="break-words font-semibold text-slate-800">
              {row.caseId ? (
                <Link href={caseDetailHref(row.caseId, pathname)} className="mr-1.5 text-primary-700 hover:underline">
                  {row.caseNumber}
                </Link>
              ) : null}
              {row.description}
            </p>
            <p className="text-xs text-slate-500">
              {formatDate(row.expenseDate)}
              {row.clientName ? ` · ${row.clientName}` : ""}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="font-semibold text-slate-800">{formatMoney(row.amount)}</span>
            {row.canDelete && (
              <button
                type="button"
                onClick={() => void remove(row)}
                disabled={removing === row.id}
                aria-label="Kharcha hatayein"
                className="grid h-9 w-9 place-items-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"
              >
                {removing === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

// §W52 — user ke bheje hue kharche jo admin ke review mein hain (wapas le sakta
// hai) ya admin ne wapas kiye (wajah ke saath). Ye hisaab mein shumar nahi.
export function DeptReviewList({
  rows,
  onChanged,
  onToast,
}: {
  rows: DeptExpenseReviewRow[];
  onChanged: () => Promise<void> | void;
  onToast: (message: string, kind: ToastKind) => void;
}) {
  const pathname = usePathname();
  const [busy, setBusy] = useState<string | null>(null);

  async function cancel(id: string) {
    if (!confirm("Ye kharcha wapas le lein (admin ko review ke liye nahi jayega)?")) return;
    setBusy(id);
    const res = await officeFetch(`/api/office/dept-expense-requests/${encodeURIComponent(id)}`, {
      method: "POST",
      json: { action: "cancel" },
    });
    setBusy(null);
    if (!res.ok) {
      onToast(res.error, "error");
      return;
    }
    onToast("Kharcha wapas le liya", "success");
    await onChanged();
  }

  if (rows.length === 0) return null;
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-amber-200 bg-amber-50/40">
      {rows.map((row) => (
        <li key={row.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="break-words font-semibold text-slate-800">
              {row.caseId ? (
                <Link href={caseDetailHref(row.caseId, pathname)} className="mr-1.5 text-primary-700 hover:underline">
                  {row.caseNumber}
                </Link>
              ) : row.caseNumber ? (
                <span className="mr-1.5">{row.caseNumber}</span>
              ) : null}
              {row.description}
            </p>
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {formatDate(row.expenseDate)}
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  row.status === "PENDING" ? "bg-amber-100 text-amber-800" : "bg-slate-200 text-slate-600"
                }`}
              >
                {row.status === "PENDING" ? "Admin ke review mein" : "Wapas (manzoor nahi)"}
              </span>
            </p>
            {row.status === "REJECTED" && row.decisionNote && (
              <p className="text-xs text-slate-500">Wajah: {row.decisionNote}</p>
            )}
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className={`font-semibold ${row.status === "REJECTED" ? "text-slate-400 line-through" : "text-slate-800"}`}>
              {formatMoney(row.amount)}
            </span>
            {row.canCancel && (
              <button
                type="button"
                onClick={() => void cancel(row.id)}
                disabled={busy === row.id}
                aria-label="Kharcha wapas lein"
                title="Wapas lein"
                className="grid h-9 w-9 place-items-center rounded-lg text-red-500 hover:bg-red-50 disabled:opacity-50"
              >
                {busy === row.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}

// mode "receiver" = dept user (Mil gaya / Nahi mila); "admin" = cancel.
export function DeptRequestList({
  rows,
  mode,
  empty,
  onChanged,
  onToast,
  showUser,
}: {
  rows: DeptPayoutRequestRow[];
  mode: "receiver" | "admin" | "view";
  empty: string;
  onChanged: () => Promise<void> | void;
  onToast: (message: string, kind: ToastKind) => void;
  showUser?: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);

  async function decide(row: DeptPayoutRequestRow, action: "accept" | "reject") {
    if (action === "reject" && mode === "admin" && !confirm("Ye payment request cancel karein?")) return;
    setBusy(row.id);
    const res = await officeFetch(`/api/office/dept-payouts/${row.id}`, { method: "POST", json: { action } });
    setBusy(null);
    if (!res.ok) {
      onToast(res.error, "error");
      return;
    }
    onToast(
      action === "accept"
        ? `${formatMoney(row.amount)} mil gaye — hisaab update`
        : mode === "admin"
          ? "Request cancel ho gayi"
          : "Request wapas kar di",
      "success"
    );
    await onChanged();
  }

  if (rows.length === 0) {
    return <p className="rounded-xl border border-slate-100 px-3 py-3 text-sm text-slate-400">{empty}</p>;
  }
  return (
    <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
      {rows.map((row) => (
        <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-800">
              {showUser && row.userName ? <span>{row.userName}</span> : null}
              <DeptKindChip kind={row.kind} />
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${STATUS_CHIP[row.status]}`}>
                {DEPT_PAYOUT_STATUS_LABELS[row.status]}
              </span>
            </p>
            <p className="text-xs text-slate-500">
              {formatDate(row.entryDate)}
              {row.method ? ` · ${PAYMENT_METHOD_LABELS[row.method] || row.method}` : ""}
              {row.createdByName ? ` · ${row.createdByName}` : ""}
              {row.remarks ? ` · ${row.remarks}` : ""}
            </p>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            <span className="font-semibold text-sky-700">{formatMoney(row.amount)}</span>
            {row.status === "PENDING" && mode === "receiver" && (
              <>
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => void decide(row, "accept")}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {busy === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  Mil gaya
                </button>
                <button
                  type="button"
                  disabled={busy === row.id}
                  onClick={() => void decide(row, "reject")}
                  className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" /> Nahi mila
                </button>
              </>
            )}
            {row.status === "PENDING" && mode === "admin" && (
              <button
                type="button"
                disabled={busy === row.id}
                onClick={() => void decide(row, "reject")}
                className="inline-flex min-h-[36px] items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 disabled:opacity-50"
              >
                {busy === row.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                Cancel
              </button>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
