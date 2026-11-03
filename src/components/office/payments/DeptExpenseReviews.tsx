"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, Info, Loader2, Receipt, Truck, X } from "lucide-react";
import type { ToastKind } from "@/components/Toast";
import { formatDate, formatDateTime, formatMoney, officeFetch } from "@/lib/office/client";
import { caseDetailHref } from "@/lib/office/case-nav";
import { ROLE_LABELS } from "@/lib/office/permissions";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";

// §W52 — super admin: department users (courier / printing / attestation) ke
// bheje hue kharchon ka review. Manzoor karne par hi kharcha system mein
// (W51 nizam: courier → case ka expense + shares / commission rule, other →
// admin profit; dono user ki "Admin se wasooli" mein). Wapas = kuch nahi banta,
// wajah user ko jati hai. Teen hisse: Review baqi / Manzoor / Wapas.

type ReviewStatus = "PENDING" | "ACCEPTED" | "REJECTED";

type ReviewRow = {
  id: string;
  kind: "COURIER" | "OTHER";
  amount: number;
  requestedAmount: number | null;
  description: string;
  expenseDate: string;
  status: ReviewStatus;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  userName: string | null;
  userRole: string | null;
  decidedByName: string | null;
  caseId: string | null;
  caseNumber: string | null;
  caseDeleted: boolean;
  case: {
    clientName: string | null;
    rollNumber: string | null;
    registrationNumber: string | null;
    officeName: string;
    officeType: string;
    expenseDeductPercent: number;
  } | null;
};

const STATUS_TABS: Array<{ key: ReviewStatus; label: string; empty: string }> = [
  { key: "PENDING", label: "Review baqi", empty: "Koi kharcha review ke intezar mein nahi" },
  { key: "ACCEPTED", label: "Manzoor shuda", empty: "Abhi koi manzoor kharcha nahi" },
  { key: "REJECTED", label: "Wapas kiye", empty: "Koi kharcha wapas nahi kiya gaya" },
];

// Manzoori ka asar — admin ko saaf pata ho ke "Manzoor" se kya hoga.
function effectText(row: ReviewRow) {
  const who = row.userName || "user";
  if (row.kind === "OTHER" || row.caseDeleted || !row.case) {
    return `Admin ke profit se minus hoga (kisi office ke share / commission se nahi) aur ${who} ki "Admin se wasooli" mein judega.`;
  }
  const office =
    row.case.officeType === "PROFIT_SHARE"
      ? "partner office — shareholders apne % ke mutabiq, baqi admin"
      : row.case.officeType === "FIXED_COMMISSION"
        ? row.case.expenseDeductPercent > 0
          ? `commission office — case ke rule se ${row.case.expenseDeductPercent}% commission se minus`
          : "commission office — commission se kuch nahi katega (case ka rule 0%)"
        : "salary office — company ka kharcha";
  return `Case ${row.caseNumber} ka expense banega (${office}) aur ${who} ki "Admin se wasooli" mein judega.`;
}

export default function DeptExpenseReviews({
  from,
  onToast,
}: {
  from: string;
  onToast: (message: string, kind?: ToastKind) => void;
}) {
  const [status, setStatus] = useState<ReviewStatus>("PENDING");
  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [counts, setCounts] = useState<Record<ReviewStatus, number>>({ PENDING: 0, ACCEPTED: 0, REJECTED: 0 });
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await officeFetch<{ items: ReviewRow[]; counts: Record<ReviewStatus, number> }>(
      `/api/office/dept-expense-requests?status=${status}`
    );
    if (res.ok) {
      setRows(res.data.items);
      setCounts(res.data.counts);
    }
  }, [status]);
  useLiveRefresh(load, { immediate: true });

  function switchTo(next: ReviewStatus) {
    if (next === status) return;
    setRows(null);
    setRejecting(null);
    setStatus(next);
  }

  async function decide(row: ReviewRow, action: "accept" | "reject") {
    const amountText = (amounts[row.id] ?? String(row.amount)).trim().replace(/,/g, "");
    if (action === "accept" && !(Number(amountText) > 0)) {
      onToast("Raqam sahi likhein (0 se zyada)", "error");
      return;
    }
    setBusy(row.id);
    const res = await officeFetch(`/api/office/dept-expense-requests/${row.id}`, {
      method: "POST",
      json: action === "accept" ? { action, amount: amountText } : { action, note: reason.trim() || undefined },
    });
    setBusy(null);
    if (!res.ok) {
      onToast(res.error, "error");
      return;
    }
    onToast(
      action === "accept"
        ? `Manzoor: ${formatMoney(Number(amountText))} — ${row.userName || "user"} ki wasooli mein jud gaya`
        : `Wapas kar diya — ${row.userName || "user"} ko wajah chali gayi`,
      "success"
    );
    setRejecting(null);
    setReason("");
    // List se foran hata do; office:changed baqi sab taaza kar deta hai.
    setRows((prev) => (prev ? prev.filter((item) => item.id !== row.id) : prev));
    setCounts((prev) => ({
      ...prev,
      PENDING: Math.max(0, prev.PENDING - 1),
      [action === "accept" ? "ACCEPTED" : "REJECTED"]: prev[action === "accept" ? "ACCEPTED" : "REJECTED"] + 1,
    }));
  }

  const pendingTotal = status === "PENDING" ? (rows ?? []).reduce((acc, row) => acc + row.amount, 0) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-900">
        <Info className="mt-0.5 h-4 w-4 shrink-0" />
        <p>
          Courier / printing / attestation users ke bheje hue kharche. Jab tak aap <b>Manzoor</b> na karein, ye kisi
          hisaab mein nahi aate (na case expense, na shares / commission, na profit, na user ki wasooli). Raqam ghalat ho
          to manzoori se pehle theek kar dein.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1">
        {STATUS_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => switchTo(tab.key)}
            className={`inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold sm:flex-none ${
              status === tab.key ? "bg-white text-slate-900 shadow" : "text-slate-500"
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                tab.key === "PENDING" && counts.PENDING > 0 ? "bg-amber-500 text-white" : "bg-slate-200 text-slate-600"
              }`}
            >
              {counts[tab.key]}
            </span>
          </button>
        ))}
      </div>

      {status === "PENDING" && rows && rows.length > 0 && (
        <p className="text-sm text-slate-600">
          <b>{rows.length}</b> kharche review ke intezar mein — kul <b>{formatMoney(pendingTotal)}</b>. Purane pehle.
        </p>
      )}

      {rows === null ? (
        <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-14">
          <Loader2 className="h-7 w-7 animate-spin text-primary-500" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
          {STATUS_TABS.find((tab) => tab.key === status)?.empty}
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((row) => {
            const KindIcon = row.kind === "COURIER" ? Truck : Receipt;
            const amountValue = amounts[row.id] ?? String(row.amount);
            const isBusy = busy === row.id;
            return (
              <div key={row.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1.5">
                    {/* Kis ne bheja + qism */}
                    <p className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-900">{row.userName || "User"}</span>
                      {row.userRole && (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                          {ROLE_LABELS[row.userRole] || row.userRole}
                        </span>
                      )}
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          row.kind === "COURIER" ? "bg-teal-100 text-teal-700" : "bg-violet-100 text-violet-700"
                        }`}
                      >
                        <KindIcon className="h-3 w-3" />
                        {row.kind === "COURIER" ? "Courier kharcha" : "Other expenses"}
                      </span>
                    </p>
                    {/* Courier: kis case ka */}
                    {row.kind === "COURIER" && (
                      <div className="text-sm">
                        {row.caseId && !row.caseDeleted ? (
                          <Link href={caseDetailHref(row.caseId, from)} className="font-semibold text-primary-700 hover:underline">
                            {row.caseNumber}
                          </Link>
                        ) : (
                          <span className="font-semibold text-slate-700">{row.caseNumber || "Case"}</span>
                        )}
                        {row.case && (
                          <span className="text-slate-600">
                            {" · "}
                            {row.case.clientName || "Naam —"}
                            {row.case.rollNumber ? ` · Roll ${row.case.rollNumber}` : ""}
                            {row.case.registrationNumber ? ` · Reg ${row.case.registrationNumber}` : ""}
                            <span className="text-slate-400"> · {row.case.officeName}</span>
                          </span>
                        )}
                        {row.caseDeleted && (
                          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-red-600">
                            <AlertTriangle className="h-3.5 w-3.5" /> Case delete ho chuka — manzoori par Other expenses mein
                            banega
                          </p>
                        )}
                      </div>
                    )}
                    {/* User ka likha hua */}
                    <p className="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-800">{row.description}</p>
                    <p className="text-xs text-slate-500">
                      Kharche ki tareekh {formatDate(row.expenseDate)} · bheja {formatDateTime(row.createdAt)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xl font-bold text-slate-900">{formatMoney(row.amount)}</p>
                    {row.requestedAmount !== null && row.requestedAmount !== row.amount && (
                      <p className="text-[11px] text-slate-500">bheja tha {formatMoney(row.requestedAmount)}</p>
                    )}
                  </div>
                </div>

                {row.status === "PENDING" ? (
                  <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                    <p className="text-xs text-slate-500">
                      <b className="text-slate-700">Manzoor karne par:</b> {effectText(row)}
                    </p>
                    {rejecting === row.id ? (
                      <div className="space-y-2 rounded-xl border border-red-200 bg-red-50 p-3">
                        <label className="block text-xs font-semibold text-red-800">
                          Wapas karne ki wajah (user ko dikhegi)
                          <input
                            value={reason}
                            onChange={(e) => setReason(e.target.value)}
                            placeholder="Maslan: slip / raseed nahi, raqam ghalat"
                            className="mt-1 w-full rounded-xl border border-red-200 bg-white px-3 py-2 text-sm font-normal text-slate-800 outline-none focus:border-red-400"
                          />
                        </label>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void decide(row, "reject")}
                            className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-red-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          >
                            {isBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                            Wapas bhejein
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setRejecting(null);
                              setReason("");
                            }}
                            className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            Rehne dein
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="text-xs text-slate-500">
                          Raqam (Rs)
                          <input
                            value={amountValue}
                            onChange={(e) => setAmounts((prev) => ({ ...prev, [row.id]: e.target.value }))}
                            inputMode="decimal"
                            aria-label="Manzoor raqam"
                            className="mt-1 block w-32 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                          />
                        </label>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void decide(row, "accept")}
                          className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                          {isBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                          Manzoor karein
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => {
                            setRejecting(row.id);
                            setReason("");
                          }}
                          className="inline-flex min-h-[40px] items-center gap-1 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          <X className="h-4 w-4" /> Wapas karein
                        </button>
                        {Number(amountValue.replace(/,/g, "")) !== row.amount && (
                          <span className="text-[11px] font-semibold text-amber-700">
                            Raqam badli — user ne {formatMoney(row.amount)} bheja tha
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <p
                    className={`mt-3 rounded-xl px-3 py-2 text-xs font-semibold ${
                      row.status === "ACCEPTED" ? "bg-emerald-50 text-emerald-800" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {row.status === "ACCEPTED" ? "Manzoor" : "Wapas kiya"}
                    {row.decidedAt ? ` — ${formatDateTime(row.decidedAt)}` : ""}
                    {row.decidedByName ? ` · ${row.decidedByName}` : ""}
                    {row.decisionNote ? ` · ${row.status === "REJECTED" ? "Wajah: " : ""}${row.decisionNote}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
