"use client";

import { useState } from "react";
import { Loader2, Save } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import { type CaseDetail, inputClass, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

// Commission (type 1) controls + booking office "remaining" claim (BR2, BR3.2, BR3.6).
export default function CaseMoneyCard({
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
  const canLedgerWrite = adminCanAny(admin, ["office:ledger:write"]);
  const canClaim = adminCanAny(admin, ["office:cases:write", "office:payments:submit"]);
  const canEditCase = adminCanAny(admin, ["office:cases:write"]);
  const [commission, setCommission] = useState(String(detail.commissionAmount));
  const [agreedRemarks, setAgreedRemarks] = useState(detail.agreedAmountRemarks || "");
  const [reason, setReason] = useState("");
  const [extraPercent, setExtraPercent] = useState(detail.extraSharePercent === null ? "" : String(detail.extraSharePercent));
  const [claim, setClaim] = useState(detail.claimedRemaining === null ? "" : String(detail.claimedRemaining));
  const [busy, setBusy] = useState(false);
  const isFixed = detail.bookingOffice.type === "FIXED_COMMISSION";

  async function patchCommission(body: Record<string, unknown>, success: string) {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/commission`, { method: "PATCH", json: body });
    if (res.ok) {
      onUpdated(res.data);
      onMessage(success);
      setReason("");
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  // §N7: agreed amount ke sath remarks (maslan installments ki tafseel).
  async function saveAgreedRemarks() {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}`, {
      method: "PATCH",
      json: { agreedAmountRemarks: agreedRemarks },
    });
    if (res.ok) {
      onUpdated(res.data);
      onMessage("Agreed amount remarks save ho gaye");
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function submitClaim() {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/remaining`, {
      method: "PATCH",
      json: { action: "claim", remaining: claim },
    });
    if (res.ok) {
      onUpdated(res.data);
      onMessage("Remaining amount cashier ko bhej di gayi");
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      <h3 className="font-bold text-slate-900">Commission & remaining</h3>

      <div className="space-y-2 rounded-xl bg-slate-50 p-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-[11px] font-semibold uppercase text-slate-400">Agreed amount</p>
            <p className="text-lg font-bold text-slate-900">{formatMoney(detail.agreedAmount)}</p>
          </div>
        </div>
        {canEditCase ? (
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              className={inputClass}
              placeholder="Agreed amount remarks (maslan: 2 installments)"
              value={agreedRemarks}
              onChange={(e) => setAgreedRemarks(e.target.value)}
            />
            <button
              disabled={busy || agreedRemarks === (detail.agreedAmountRemarks || "")}
              onClick={saveAgreedRemarks}
              className={primaryBtnClass}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Remarks save
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Remarks: {detail.agreedAmountRemarks || "—"}</p>
        )}
      </div>

      {isFixed ? (
        <div className="space-y-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
            <div>
              <p className="text-[11px] font-semibold uppercase text-slate-400">Booking office commission (fixed)</p>
              <p className="text-lg font-bold text-slate-900">{formatMoney(detail.commissionAmount)}</p>
            </div>
            <div className="text-right text-xs text-slate-500">
              <p>Half: {detail.commissionHalfCreditedAt ? `credited ${formatDate(detail.commissionHalfCreditedAt)}` : "pending"}</p>
              <p>Final: {detail.commissionFullCreditedAt ? `credited ${formatDate(detail.commissionFullCreditedAt)}` : "pending"}</p>
              {detail.extraSharePercent !== null && (
                <p>
                  Extra share: {detail.extraSharePercent}%{detail.extraShareCreditedAt ? ` (credited)` : ""}
                </p>
              )}
            </div>
          </div>
          {detail.commissionAmount === 0 && (
            <p className="text-xs text-amber-600">Is office/category ke liye commission set nahi hai (Setup → Booking office → commissions).</p>
          )}
          {canLedgerWrite && (
            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase text-slate-500">Commission change (cashier / admin)</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <input className={`${inputClass} sm:max-w-[10rem]`} inputMode="decimal" value={commission} onChange={(e) => setCommission(e.target.value)} />
                <input className={inputClass} placeholder="Wajah (zaroori)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button
                  disabled={busy || !reason.trim() || commission === String(detail.commissionAmount)}
                  onClick={() => patchCommission({ commissionAmount: commission, reason }, "Commission update ho gayi")}
                  className={primaryBtnClass}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
                </button>
              </div>
              {detail.totals.extra > 0 && (
                <div className="flex flex-col sm:flex-row gap-2 pt-1">
                  <input
                    className={`${inputClass} sm:max-w-[10rem]`}
                    inputMode="decimal"
                    placeholder="Extra share %"
                    value={extraPercent}
                    onChange={(e) => setExtraPercent(e.target.value)}
                  />
                  <button
                    disabled={busy || extraPercent === ""}
                    onClick={() => patchCommission({ extraSharePercent: extraPercent }, "Extra share % update ho gaya")}
                    className={primaryBtnClass}
                  >
                    Set extra share %
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      ) : detail.bookingOffice.type === "PROFIT_SHARE" ? (
        <p className="text-sm text-slate-600">
          Profit-share office: (received − case expenses) ka % shareholders ko jata hai.{" "}
          {detail.profitFinalizedAt ? `Last calculated ${formatDate(detail.profitFinalizedAt)}.` : "Abhi calculate nahi hua."}
        </p>
      ) : (
        <p className="text-sm text-slate-600">Salary-based office: is case ka poora profit company ka hai.</p>
      )}

      {canClaim && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Remaining payment (booking office likhe)</p>
          <p className="text-xs text-slate-500">
            Current: {detail.claimedRemaining === null ? "—" : formatMoney(detail.claimedRemaining)} ·{" "}
            {detail.claimedRemainingStatus === "PENDING" ? "cashier approval pending" : detail.claimedRemainingStatus === "ACCEPTED" ? "accepted" : "not set"}
          </p>
          <div className="flex gap-2">
            <input className={`${inputClass} max-w-[12rem]`} inputMode="decimal" value={claim} onChange={(e) => setClaim(e.target.value)} placeholder="Rs" />
            <button disabled={busy || claim === ""} onClick={submitClaim} className={primaryBtnClass}>
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
