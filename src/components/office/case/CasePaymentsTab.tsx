"use client";

import { useState } from "react";
import {
  AlertTriangle,
  BadgePercent,
  Check,
  CreditCard,
  ExternalLink,
  Loader2,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import ExtraAmountPopup from "@/components/office/ExtraAmountPopup";
import { formatDate, formatMoney, officeFetch, todayInputDate, toInputDate } from "@/lib/office/client";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from "@/lib/office/labels";
import { PAYMENT_METHODS } from "@/lib/office/permissions";
import { type CaseDetail, ghostBtnClass, inputClass, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

type VerifyResult = { needsExtraDecision: number | null };

type TabProps = {
  detail: CaseDetail;
  admin: AdminNavUser;
  onUpdated: (next: CaseDetail) => void;
  onReload: () => Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
};

// Payments tab: claimed-remaining approval strip, payment add form + verify
// queue, commission / remaining-claim controls. Logic pehle CasePayments +
// CaseMoneyCard + CaseHeader (remaining accept/edit) mein tha — sab preserved.
export default function CasePaymentsTab(props: TabProps) {
  return (
    <div className="space-y-4">
      <ClaimedRemainingStrip {...props} />
      <PaymentsPanel {...props} />
      <CommissionPanel {...props} />
    </div>
  );
}

/* ------------- Claimed remaining: cashier/admin accept ya edit ------------- */

function ClaimedRemainingStrip({ detail, admin, onUpdated, onMessage }: TabProps) {
  const canVerify = adminCanAny(admin, ["office:payments:verify"]);
  const [editRemaining, setEditRemaining] = useState("");
  const [busy, setBusy] = useState(false);

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

  if (detail.claimedRemainingStatus !== "PENDING" || detail.claimedRemaining === null) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span className="flex-1">
        Booking office ke mutabiq remaining payment: <strong>{formatMoney(detail.claimedRemaining)}</strong>
        {canVerify ? " — accept ya edit karein." : " — cashier ki approval pending."}
      </span>
      {canVerify && (
        <div className="flex flex-wrap items-center gap-2">
          <button disabled={busy} onClick={() => remaining("accept")} className={`${primaryBtnClass} min-h-[40px]`}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Accept
          </button>
          <input
            inputMode="decimal"
            placeholder="Different remaining"
            value={editRemaining}
            onChange={(e) => setEditRemaining(e.target.value)}
            className={`${inputClass} max-w-[11rem]`}
          />
          <button disabled={busy || !editRemaining} onClick={() => remaining("edit")} className={`${ghostBtnClass} min-h-[40px]`}>
            Set & accept
          </button>
        </div>
      )}
    </div>
  );
}

/* ----------------------------- Payments panel ----------------------------- */

function PaymentsPanel({ detail, admin, onReload, onUpdated, onMessage }: TabProps) {
  const canSubmit = adminCanAny(admin, ["office:payments:submit"]);
  const canVerify = adminCanAny(admin, ["office:payments:verify"]);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    amount: "",
    paymentDate: todayInputDate(),
    method: "CASH",
    reference: "",
    remarks: "",
    status: "PENDING",
  });
  const [slip, setSlip] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, { paymentDate: string; amount: string }>>({});
  const [popupExtra, setPopupExtra] = useState<number | null>(null);

  async function submit() {
    setSaving(true);
    const fd = new FormData();
    fd.append("caseId", detail.id);
    Object.entries(form).forEach(([k, v]) => fd.append(k, v));
    if (slip) fd.append("slip", slip);
    const res = await fetch("/api/office/payments", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      onMessage(form.status === "RECEIVED" ? "Payment record ho gayi (received)" : "Payment slip submit ho gayi; cashier verify karega");
      setShowForm(false);
      setForm({ amount: "", paymentDate: todayInputDate(), method: "CASH", reference: "", remarks: "", status: "PENDING" });
      setSlip(null);
      await onReload();
      if (data.needsExtraDecision) setPopupExtra(data.needsExtraDecision);
    } else onMessage(data.error || "Payment submit nahi ho saki", "error");
    setSaving(false);
  }

  async function patch(id: string, body: Record<string, unknown>) {
    setBusy(id);
    const res = await officeFetch<VerifyResult>(`/api/office/payments/${id}`, { method: "PATCH", json: body });
    if (res.ok) {
      onMessage("Payment update ho gayi");
      setEdits((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      await onReload();
      if (res.data.needsExtraDecision) setPopupExtra(res.data.needsExtraDecision);
    } else onMessage(res.error, "error");
    setBusy(null);
  }

  async function remove(id: string) {
    if (!confirm("Payment delete karein?")) return;
    setBusy(id);
    const res = await officeFetch(`/api/office/payments/${id}`, { method: "DELETE" });
    onMessage(res.ok ? "Payment delete ho gayi" : res.error, res.ok ? "success" : "error");
    if (res.ok) await onReload();
    setBusy(null);
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
    setPopupExtra(null);
  }

  return (
    <SectionCard
      icon={CreditCard}
      title="Payments"
      count={detail.payments.length}
      actions={
        (canSubmit || canVerify) &&
        detail.status !== "CANCELLED" && (
          <button
            onClick={() => setShowForm(!showForm)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-primary-600 px-3 text-xs font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Add payment
          </button>
        )
      }
    >
      {showForm && (
        <div className="mb-3 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
            <input
              className={inputClass}
              inputMode="decimal"
              placeholder="Amount (Rs)"
              value={form.amount}
              onChange={(e) => setForm({ ...form, amount: e.target.value })}
            />
            <input
              type="date"
              className={inputClass}
              value={form.paymentDate}
              onChange={(e) => setForm({ ...form, paymentDate: e.target.value })}
            />
            <select className={inputClass} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              placeholder="Reference / transaction id"
              value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })}
            />
            <input
              className={inputClass}
              placeholder="Remarks"
              value={form.remarks}
              onChange={(e) => setForm({ ...form, remarks: e.target.value })}
            />
            {canVerify && (
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="PENDING">Slip — verify baad mein</option>
                <option value="RECEIVED">Received (maine khud li)</option>
              </select>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Upload className="h-4 w-4" />
            <input type="file" accept="application/pdf,.pdf,image/*" onChange={(e) => setSlip(e.target.files?.[0] || null)} className="text-sm" />
          </label>
          <div className="flex gap-2">
            <button disabled={saving || !form.amount || !form.paymentDate} onClick={submit} className={`${primaryBtnClass} min-h-[40px]`}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Submit
            </button>
            <button onClick={() => setShowForm(false)} className={`${ghostBtnClass} min-h-[40px]`}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {detail.payments.length === 0 ? (
        <EmptyState icon={CreditCard} hint="Abhi koi payment nahi — Add payment se pehli payment record karein" />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {detail.payments.map((p) => {
            const edit = edits[p.id];
            return (
              <li key={p.id} className="space-y-2 p-3 text-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p>
                      <span className="font-bold text-slate-900">{formatMoney(p.amount)}</span>
                      <span className="text-slate-500">
                        {" "}
                        · {formatDate(p.paymentDate)} · {PAYMENT_METHOD_LABELS[p.method] || p.method}
                      </span>
                      {p.reference && <span className="text-slate-500"> · {p.reference}</span>}
                    </p>
                    <p className="text-xs text-slate-400">
                      Submitted by {p.submittedByName || "—"}
                      {p.verifiedByName ? ` · verified by ${p.verifiedByName} ${formatDate(p.verifiedAt)}` : ""}
                    </p>
                    {p.remarks && <p className="text-xs text-slate-500">{p.remarks}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    {p.hasSlip && (
                      <a
                        href={`/api/office/payments/${p.id}/slip`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
                      >
                        <ExternalLink className="h-3.5 w-3.5" /> Slip
                      </a>
                    )}
                    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PAYMENT_STATUS_STYLES[p.status]}`}>
                      {PAYMENT_STATUS_LABELS[p.status]}
                    </span>
                  </div>
                </div>
                {canVerify && (
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      disabled={busy === p.id || p.status === "RECEIVED"}
                      onClick={() => patch(p.id, { status: "RECEIVED" })}
                      className="min-h-[36px] rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                    >
                      Received
                    </button>
                    <button
                      disabled={busy === p.id || p.status === "NOT_RECEIVED"}
                      onClick={() => patch(p.id, { status: "NOT_RECEIVED" })}
                      className="min-h-[36px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40"
                    >
                      Not received
                    </button>
                    <button
                      disabled={busy === p.id || p.status === "BOGUS"}
                      onClick={() => {
                        if (confirm("Bogus mark karein?")) patch(p.id, { status: "BOGUS" });
                      }}
                      className="min-h-[36px] rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-40"
                    >
                      Bogus
                    </button>
                    <input
                      type="date"
                      aria-label="Payment date"
                      className="min-h-[36px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      value={edit ? edit.paymentDate : toInputDate(p.paymentDate)}
                      onChange={(e) =>
                        setEdits({ ...edits, [p.id]: { paymentDate: e.target.value, amount: edit ? edit.amount : String(p.amount) } })
                      }
                    />
                    <input
                      inputMode="decimal"
                      aria-label="Amount"
                      className="min-h-[36px] w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                      value={edit ? edit.amount : String(p.amount)}
                      onChange={(e) =>
                        setEdits({
                          ...edits,
                          [p.id]: { paymentDate: edit ? edit.paymentDate : toInputDate(p.paymentDate), amount: e.target.value },
                        })
                      }
                    />
                    {edit && (
                      <button
                        disabled={busy === p.id}
                        onClick={() => patch(p.id, edit)}
                        className="min-h-[36px] rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white"
                      >
                        Save
                      </button>
                    )}
                    {(admin.role === "admin" || p.status !== "RECEIVED") && (
                      <button
                        disabled={busy === p.id}
                        onClick={() => remove(p.id)}
                        aria-label="Payment delete karein"
                        className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                    {busy === p.id && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                  </div>
                )}
                {!canVerify && canSubmit && p.status === "PENDING" && (
                  <button disabled={busy === p.id} onClick={() => remove(p.id)} className="text-xs text-red-600 hover:underline">
                    Delete (pending)
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {popupExtra !== null && (
        <ExtraAmountPopup caseNumber={detail.caseNumber} extra={popupExtra} onSubmit={decideExtra} onClose={() => setPopupExtra(null)} />
      )}
    </SectionCard>
  );
}

/* ----------------- Commission & remaining claim (booking) ----------------- */

function CommissionPanel({ detail, admin, onUpdated, onMessage }: TabProps) {
  const canLedgerWrite = adminCanAny(admin, ["office:ledger:write"]);
  const canClaim = adminCanAny(admin, ["office:cases:write", "office:payments:submit"]);
  const [commission, setCommission] = useState(String(detail.commissionAmount));
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
    <SectionCard icon={BadgePercent} title="Commission & remaining">
      {isFixed ? (
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-slate-50 p-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Booking office commission (fixed)</p>
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
            <p className="text-xs text-amber-600">
              Is office/category ke liye commission set nahi hai (Setup → Booking office → commissions).
            </p>
          )}
          {canLedgerWrite && (
            <div className="space-y-2 rounded-xl border border-slate-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Commission change (cashier / admin)</p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  className={`${inputClass} sm:max-w-[10rem]`}
                  inputMode="decimal"
                  value={commission}
                  onChange={(e) => setCommission(e.target.value)}
                />
                <input className={inputClass} placeholder="Wajah (zaroori)" value={reason} onChange={(e) => setReason(e.target.value)} />
                <button
                  disabled={busy || !reason.trim() || commission === String(detail.commissionAmount)}
                  onClick={() => patchCommission({ commissionAmount: commission, reason }, "Commission update ho gayi")}
                  className={`${primaryBtnClass} min-h-[40px] shrink-0`}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
                </button>
              </div>
              {detail.totals.extra > 0 && (
                <div className="flex flex-col gap-2 pt-1 sm:flex-row">
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
                    className={`${primaryBtnClass} min-h-[40px] shrink-0`}
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
        <div className="mt-3 space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Remaining payment (booking office likhe)</p>
          <p className="text-xs text-slate-500">
            Current: {detail.claimedRemaining === null ? "—" : formatMoney(detail.claimedRemaining)} ·{" "}
            {detail.claimedRemainingStatus === "PENDING"
              ? "cashier approval pending"
              : detail.claimedRemainingStatus === "ACCEPTED"
                ? "accepted"
                : "not set"}
          </p>
          <div className="flex gap-2">
            <input
              className={`${inputClass} max-w-[12rem]`}
              inputMode="decimal"
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              placeholder="Rs"
            />
            <button disabled={busy || claim === ""} onClick={submitClaim} className={`${primaryBtnClass} min-h-[40px]`}>
              Submit
            </button>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
