"use client";

import { useState } from "react";
import { Check, ExternalLink, Loader2, Plus, Trash2, Upload } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import ExtraAmountPopup from "@/components/office/ExtraAmountPopup";
import { formatDate, formatMoney, officeFetch, todayInputDate, toInputDate } from "@/lib/office/client";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from "@/lib/office/labels";
import { PAYMENT_METHODS } from "@/lib/office/permissions";
import { type CaseDetail, ghostBtnClass, inputClass, primaryBtnClass } from "@/lib/office/types";

type VerifyResult = { needsExtraDecision: number | null };

export default function CasePayments({
  detail,
  admin,
  onReload,
  onUpdated,
  onMessage,
}: {
  detail: CaseDetail;
  admin: AdminNavUser;
  onReload: () => Promise<void>;
  onUpdated: (next: CaseDetail) => void;
  onMessage: (message: string) => void;
}) {
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
    } else onMessage(data.error || "Payment submit nahi ho saki");
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
    } else onMessage(res.error);
    setBusy(null);
  }

  async function remove(id: string) {
    if (!confirm("Payment delete karein?")) return;
    setBusy(id);
    const res = await officeFetch(`/api/office/payments/${id}`, { method: "DELETE" });
    onMessage(res.ok ? "Payment delete ho gayi" : res.error);
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
    } else onMessage(res.error);
    setPopupExtra(null);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900">Payments</h3>
        {(canSubmit || canVerify) && detail.status !== "CANCELLED" && (
          <button onClick={() => setShowForm(!showForm)} className="inline-flex items-center gap-1 text-sm text-primary-700">
            <Plus className="w-4 h-4" /> Add payment
          </button>
        )}
      </div>

      {showForm && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <input className={inputClass} inputMode="decimal" placeholder="Amount (Rs)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
            <input type="date" className={inputClass} value={form.paymentDate} onChange={(e) => setForm({ ...form, paymentDate: e.target.value })} />
            <select className={inputClass} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABELS[m]}
                </option>
              ))}
            </select>
            <input className={inputClass} placeholder="Reference / transaction id" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            <input className={inputClass} placeholder="Remarks" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} />
            {canVerify && (
              <select className={inputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="PENDING">Slip — verify baad mein</option>
                <option value="RECEIVED">Received (maine khud li)</option>
              </select>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <Upload className="w-4 h-4" />
            <input type="file" accept="application/pdf,.pdf,image/*" onChange={(e) => setSlip(e.target.files?.[0] || null)} className="text-sm" />
          </label>
          <div className="flex gap-2">
            <button disabled={saving || !form.amount || !form.paymentDate} onClick={submit} className={primaryBtnClass}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Submit
            </button>
            <button onClick={() => setShowForm(false)} className={ghostBtnClass}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {detail.payments.length === 0 && <p className="p-4 text-sm text-slate-400">Abhi koi payment nahi</p>}
        {detail.payments.map((p) => {
          const edit = edits[p.id];
          return (
            <div key={p.id} className="p-3 text-sm space-y-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p>
                    <span className="font-bold text-slate-900">{formatMoney(p.amount)}</span>
                    <span className="text-slate-500"> · {formatDate(p.paymentDate)} · {PAYMENT_METHOD_LABELS[p.method] || p.method}</span>
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
                      <ExternalLink className="w-3.5 h-3.5" /> Slip
                    </a>
                  )}
                  <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PAYMENT_STATUS_STYLES[p.status]}`}>
                    {PAYMENT_STATUS_LABELS[p.status]}
                  </span>
                </div>
              </div>
              {canVerify && (
                <div className="flex flex-wrap items-center gap-2">
                  <button disabled={busy === p.id || p.status === "RECEIVED"} onClick={() => patch(p.id, { status: "RECEIVED" })} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
                    Received
                  </button>
                  <button disabled={busy === p.id || p.status === "NOT_RECEIVED"} onClick={() => patch(p.id, { status: "NOT_RECEIVED" })} className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-semibold text-slate-700 disabled:opacity-40">
                    Not received
                  </button>
                  <button
                    disabled={busy === p.id || p.status === "BOGUS"}
                    onClick={() => {
                      if (confirm("Bogus mark karein?")) patch(p.id, { status: "BOGUS" });
                    }}
                    className="rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 disabled:opacity-40"
                  >
                    Bogus
                  </button>
                  <input
                    type="date"
                    className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    value={edit ? edit.paymentDate : toInputDate(p.paymentDate)}
                    onChange={(e) => setEdits({ ...edits, [p.id]: { paymentDate: e.target.value, amount: edit ? edit.amount : String(p.amount) } })}
                  />
                  <input
                    inputMode="decimal"
                    className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    value={edit ? edit.amount : String(p.amount)}
                    onChange={(e) => setEdits({ ...edits, [p.id]: { paymentDate: edit ? edit.paymentDate : toInputDate(p.paymentDate), amount: e.target.value } })}
                  />
                  {edit && (
                    <button disabled={busy === p.id} onClick={() => patch(p.id, edit)} className="rounded-lg bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white">
                      Save
                    </button>
                  )}
                  {(admin.role === "admin" || p.status !== "RECEIVED") && (
                    <button disabled={busy === p.id} onClick={() => remove(p.id)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                  {busy === p.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                </div>
              )}
              {!canVerify && canSubmit && p.status === "PENDING" && (
                <button disabled={busy === p.id} onClick={() => remove(p.id)} className="text-xs text-red-600 hover:underline">
                  Delete (pending)
                </button>
              )}
            </div>
          );
        })}
      </div>

      {popupExtra !== null && <ExtraAmountPopup caseNumber={detail.caseNumber} extra={popupExtra} onSubmit={decideExtra} onClose={() => setPopupExtra(null)} />}
    </div>
  );
}
