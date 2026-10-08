"use client";

import { useEffect, useState } from "react";
import { Loader2, Plus, Printer, Trash2 } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import { formatDate, officeFetch, toInputDate } from "@/lib/office/client";
import { ATTESTATION_STATUS_LABELS, ATTESTATION_STATUS_STYLES, STATUS_LABELS } from "@/lib/office/labels";
import { ATTESTATION_STATUSES, CASE_STATUSES } from "@/lib/office/permissions";
import { type CaseDetail, inputClass, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

type AttestationType = { id: string; name: string; isActive: boolean };

// R1.2 attestation office: printed flag, per-attestation status/dates, manual
// case status. R1.3 booking office: add/remove required attestations.
export default function CaseAttestations({
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
  const canEditList = adminCanAny(admin, ["office:cases:write"]);
  const canStatus = adminCanAny(admin, ["office:attestation:write"]);
  // §N7: atta department sirf steps aage barha sakta hai (PENDING → IN_PROGRESS → DONE).
  const canAtta = !canStatus && adminCanAny(admin, ["office:atta:write"]);
  const [types, setTypes] = useState<AttestationType[]>([]);
  const [addId, setAddId] = useState("");
  const [busy, setBusy] = useState(false);
  const [manualStatus, setManualStatus] = useState(detail.status);

  useEffect(() => {
    if (canEditList) {
      officeFetch<AttestationType[]>("/api/office/setup/attestation-types").then((res) => {
        if (res.ok) setTypes(res.data.filter((t) => t.isActive));
      });
    }
  }, [canEditList]);

  useEffect(() => setManualStatus(detail.status), [detail.status]);

  async function call(url: string, method: string, json?: unknown, success = "Update ho gaya") {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(url, { method, json });
    if (res.ok) {
      onUpdated(res.data);
      onMessage(success);
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  const available = types.filter((t) => !detail.attestations.some((a) => a.attestationType.id === t.id));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-bold text-slate-900">Printing & attestations</h3>
        {canStatus && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              disabled={busy}
              onClick={() => call(`/api/office/cases/${detail.id}/status`, "PATCH", { isPrinted: !detail.isPrinted }, detail.isPrinted ? "Printed flag hata diya" : "Case printed mark ho gaya")}
              className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-semibold ${
                detail.isPrinted ? "border border-slate-300 text-slate-700" : "bg-indigo-600 text-white"
              }`}
            >
              <Printer className="w-3.5 h-3.5" /> {detail.isPrinted ? "Unmark printed" : "Mark printed"}
            </button>
            <select className="rounded-xl border border-slate-200 px-2 py-2 text-xs" value={manualStatus} onChange={(e) => setManualStatus(e.target.value)}>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s} disabled={s === "CANCELLED" && admin.role !== "admin"}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {manualStatus !== detail.status && (
              <button disabled={busy} onClick={() => call(`/api/office/cases/${detail.id}/status`, "PATCH", { status: manualStatus }, "Case status update ho gaya")} className="rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white">
                Set status
              </button>
            )}
          </div>
        )}
      </div>

      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {detail.attestations.length === 0 && <p className="p-4 text-sm text-slate-400">Koi attestation required nahi</p>}
        {detail.attestations.map((a) => (
          <div key={a.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
            <div className="min-w-[10rem] flex-1">
              <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                {a.attestationType.name}
                {a.attestationType.name === "Bord" && detail.boardAttasNumber && (
                  <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
                    Board Attas # {detail.boardAttasNumber}
                  </span>
                )}
              </p>
              <p className="text-xs text-slate-500">
                Scheduled {formatDate(a.scheduledDate)} · Done {formatDate(a.completedDate)}
                {a.notes ? ` · ${a.notes}` : ""}
              </p>
            </div>
            {canStatus ? (
              <>
                <select
                  disabled={busy}
                  className="rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                  value={a.status}
                  onChange={(e) => call(`/api/office/cases/${detail.id}/attestations`, "PATCH", { id: a.id, status: e.target.value }, "Attestation status update ho gaya")}
                >
                  {ATTESTATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {ATTESTATION_STATUS_LABELS[s]}
                    </option>
                  ))}
                </select>
                <label className="text-[11px] text-slate-500">
                  Sched.
                  <input
                    type="date"
                    className="ml-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    value={toInputDate(a.scheduledDate)}
                    onChange={(e) => call(`/api/office/cases/${detail.id}/attestations`, "PATCH", { id: a.id, scheduledDate: e.target.value }, "Date update ho gayi")}
                  />
                </label>
                <label className="text-[11px] text-slate-500">
                  Done
                  <input
                    type="date"
                    className="ml-1 rounded-lg border border-slate-200 px-2 py-1 text-xs"
                    value={toInputDate(a.completedDate)}
                    onChange={(e) => call(`/api/office/cases/${detail.id}/attestations`, "PATCH", { id: a.id, completedDate: e.target.value }, "Date update ho gayi")}
                  />
                </label>
              </>
            ) : (
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ATTESTATION_STATUS_STYLES[a.status]}`}>{ATTESTATION_STATUS_LABELS[a.status]}</span>
            )}
            {canAtta && a.status !== "DONE" && (
              <button
                disabled={busy}
                onClick={() =>
                  call(
                    `/api/office/cases/${detail.id}/attestations`,
                    "PATCH",
                    { id: a.id, status: a.status === "PENDING" ? "IN_PROGRESS" : "DONE" },
                    a.status === "PENDING" ? "Step shuru ho gaya" : "Step done ho gaya"
                  )
                }
                className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                  a.status === "PENDING" ? "bg-violet-600 text-white" : "bg-emerald-600 text-white"
                }`}
              >
                {busy && <Loader2 className="w-3 h-3 animate-spin" />}
                {a.status === "PENDING" ? "Shuru karein" : "Done karein"}
              </button>
            )}
            {canEditList && a.status === "PENDING" && (
              <button disabled={busy} onClick={() => call(`/api/office/cases/${detail.id}/attestations?attestationId=${a.id}`, "DELETE", undefined, "Attestation remove ho gayi")} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {canEditList && available.length > 0 && (
        <div className="flex gap-2">
          <select className={`${inputClass} max-w-xs`} value={addId} onChange={(e) => setAddId(e.target.value)}>
            <option value="">Attestation add karein…</option>
            {available.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button
            disabled={busy || !addId}
            onClick={async () => {
              await call(`/api/office/cases/${detail.id}/attestations`, "POST", { attestationTypeId: addId }, "Attestation add ho gayi");
              setAddId("");
            }}
            className={primaryBtnClass}
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} Add
          </button>
        </div>
      )}
    </div>
  );
}
