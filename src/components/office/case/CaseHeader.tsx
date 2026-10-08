"use client";

import { useState } from "react";
import { AlertTriangle, CalendarClock, Flame, Loader2, Printer } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import ExtraAmountPopup from "@/components/office/ExtraAmountPopup";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/office/labels";
import { BOOKING_OFFICE_TYPE_LABELS } from "@/lib/office/permissions";
import { type CaseDetail, inputClass, primaryBtnClass, ghostBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

export default function CaseHeader({
  detail,
  admin,
  onUpdated,
  onMessage,
}: {
  detail: CaseDetail;
  admin: AdminNavUser;
  onUpdated: (next: CaseDetail) => void;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const canVerify = adminCanAny(admin, ["office:payments:verify"]);
  const canLedgerWrite = adminCanAny(admin, ["office:ledger:write"]);
  const canEdit = adminCanAny(admin, ["office:cases:write"]);
  const [popup, setPopup] = useState(false);
  const [editRemaining, setEditRemaining] = useState("");
  const [busy, setBusy] = useState(false);

  // §N7: Urgent badge toggle (booking office / admin).
  async function toggleUrgent() {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}`, {
      method: "PATCH",
      json: { isUrgent: !detail.isUrgent },
    });
    if (res.ok) {
      onUpdated(res.data);
      onMessage(res.data.isUrgent ? "Case urgent mark ho gaya" : "Urgent badge hata diya");
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function decideExtra(percent: number) {
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/commission`, {
      method: "PATCH",
      json: { extraSharePercent: percent },
    });
    if (res.ok) {
      onUpdated(res.data);
      onMessage(`Extra share ${percent}% set ho gaya`);
    } else onMessage(res.error, "error");
    setPopup(false);
  }

  async function remaining(action: "accept" | "edit") {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/remaining`, {
      method: "PATCH",
      json: { action, remaining: editRemaining },
    });
    if (res.ok) {
      onUpdated(res.data);
      onMessage("Remaining amount accept ho gaya; agreed amount update hui");
      setEditRemaining("");
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function finalizeProfit() {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/profit`, { method: "POST" });
    if (res.ok) {
      onUpdated(res.data);
      onMessage("Profit share calculate ho gaya");
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{detail.caseNumber}</p>
            <h2 className="flex flex-wrap items-center gap-2 text-2xl font-bold text-slate-900">
              {detail.clientName || "—"}
              {detail.isUrgent && (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white">
                  <Flame className="w-3.5 h-3.5" /> URGENT
                </span>
              )}
            </h2>
            <p className="text-sm text-slate-500">
              {detail.bookingOffice.name} · {BOOKING_OFFICE_TYPE_LABELS[detail.bookingOffice.type]}
              {detail.category ? ` · ${detail.category.name}` : ""}
              {detail.setName ? ` · Set: ${detail.setName}` : ""}
            </p>
            <p className="text-xs text-slate-400">
              Created {formatDate(detail.createdAt)}
              {detail.createdByName ? ` by ${detail.createdByName}` : ""}
            </p>
            {detail.boardAttasNumber && (
              <p className="mt-1">
                <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                  Board Attas # {detail.boardAttasNumber}
                </span>
              </p>
            )}
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[detail.status]}`}>
              {STATUS_LABELS[detail.status] || detail.status}
            </span>
            <span className={`inline-flex items-center gap-1 text-xs ${detail.isPrinted ? "text-emerald-700 font-semibold" : "text-slate-500"}`}>
              <Printer className="w-3.5 h-3.5" /> {detail.isPrinted ? `Printed ${formatDate(detail.printedAt)}` : "Not printed"}
            </span>
            {canEdit && (
              <button
                disabled={busy}
                onClick={toggleUrgent}
                className={`inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
                  detail.isUrgent ? "border border-red-300 text-red-600" : "bg-red-600 text-white"
                }`}
              >
                <Flame className="w-3.5 h-3.5" /> {detail.isUrgent ? "Urgent hatayein" : "Urgent karein"}
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <Info label="Agreed" value={formatMoney(detail.totals.agreedAmount)} />
          <Info label="Received" value={formatMoney(detail.totals.received)} tone="emerald" />
          <Info label="Remaining" value={formatMoney(detail.totals.remaining)} tone={detail.totals.remaining > 0 ? "amber" : undefined} />
          {detail.totals.extra > 0 && <Info label="Extra received" value={formatMoney(detail.totals.extra)} tone="violet" />}
          <div className="rounded-xl bg-primary-50 border border-primary-100 p-3">
            <p className="flex items-center gap-1 text-[11px] font-semibold uppercase text-primary-600">
              <CalendarClock className="w-3.5 h-3.5" /> Expected printing
            </p>
            <p className="text-base font-bold text-primary-800">{formatDate(detail.expectedPrintingDate)}</p>
            <p className="text-[11px] text-primary-500">Payment date + 6 din, pehla working day</p>
          </div>
        </div>
      </div>

      {detail.setMissingWarning && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-300 bg-red-50 p-4 text-sm font-semibold text-red-700">
          <AlertTriangle className="w-4 h-4" />
          Is case ka set select nahi kiya gaya — printing ho chuki hai. Neeche &quot;Attestation set&quot; card se set select karein.
        </div>
      )}

      {detail.needsExtraDecision !== null && canLedgerWrite && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-800">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Is case mein {formatMoney(detail.needsExtraDecision)} extra receive hui hai — booking office ka share % decide karein.
          </span>
          <button onClick={() => setPopup(true)} className={primaryBtnClass}>
            Decide karein
          </button>
        </div>
      )}

      {detail.claimedRemainingStatus === "PENDING" && detail.claimedRemaining !== null && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 space-y-2">
          <p className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Booking office ke mutabiq remaining payment: <strong>{formatMoney(detail.claimedRemaining)}</strong>
            {canVerify ? " — accept ya edit karein." : " — cashier ki approval pending."}
          </p>
          {canVerify && (
            <div className="flex flex-wrap gap-2">
              <button disabled={busy} onClick={() => remaining("accept")} className={primaryBtnClass}>
                {busy && <Loader2 className="w-4 h-4 animate-spin" />} Accept
              </button>
              <input
                inputMode="decimal"
                placeholder="Different remaining"
                value={editRemaining}
                onChange={(e) => setEditRemaining(e.target.value)}
                className={`${inputClass} max-w-[12rem]`}
              />
              <button disabled={busy || !editRemaining} onClick={() => remaining("edit")} className={ghostBtnClass}>
                Set & accept
              </button>
            </div>
          )}
        </div>
      )}

      {detail.bookingOffice.type === "PROFIT_SHARE" && canLedgerWrite && (detail.profitStale || (!detail.profitFinalizedAt && detail.totals.received > 0)) && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            {detail.profitStale
              ? "Payments / expenses badle hain — profit share dobara calculate karein."
              : "Profit share abhi calculate nahi hua (received − expenses ka % shareholders ko)."}
          </span>
          <button disabled={busy} onClick={finalizeProfit} className={primaryBtnClass}>
            {busy && <Loader2 className="w-4 h-4 animate-spin" />} {detail.profitFinalizedAt ? "Re-calculate" : "Calculate profit share"}
          </button>
        </div>
      )}

      {popup && detail.needsExtraDecision !== null && (
        <ExtraAmountPopup caseNumber={detail.caseNumber} extra={detail.needsExtraDecision} onSubmit={decideExtra} onClose={() => setPopup(false)} />
      )}
    </div>
  );
}

function Info({ label, value, tone }: { label: string; value: string; tone?: "emerald" | "amber" | "violet" }) {
  const tones = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    violet: "text-violet-700",
  };
  return (
    <div className="rounded-xl bg-slate-50 p-3">
      <p className="text-[11px] font-semibold uppercase text-slate-400">{label}</p>
      <p className={`text-base font-bold ${tone ? tones[tone] : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
