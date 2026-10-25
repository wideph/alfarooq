"use client";

import { useState } from "react";
import { CheckCheck, Loader2, X } from "lucide-react";
import type { ToastKind } from "@/components/Toast";
import { officeFetch } from "@/lib/office/client";
import { caseStatusLabel } from "@/lib/office/labels";

// §W32 — "Attestation complete karein" (POST .../attestations/complete-all).
// Wajah ka box: printing / attestation / courier department ka user printed
// proof ke baad FINAL file ke baghair complete kare to wajah LAZMI (server
// bhi check karta hai); normal FINAL wale raaste par optional. Case
// "Attestation complete — final payment pending" par jata hai; payment poori ho
// to khud courier stage par.

const MIN_REASON = 5;

export default function CompleteAttestationButton({
  caseId,
  reasonRequired,
  label = "Attestation complete karein",
  fullWidth = false,
  onDone,
  onMessage,
}: {
  caseId: string;
  reasonRequired: boolean;
  label?: string;
  fullWidth?: boolean;
  onDone: () => void | Promise<void>;
  onMessage?: (message: string, kind?: ToastKind) => void;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const trimmed = reason.trim();
  const canSubmit = !busy && (!reasonRequired || trimmed.length >= MIN_REASON);

  async function submit() {
    if (!canSubmit) return;
    setBusy(true);
    try {
      const res = await officeFetch<{ status: string; completed?: boolean }>(
        `/api/office/cases/${caseId}/attestations/complete-all`,
        { method: "POST", json: trimmed ? { reason: trimmed } : {} }
      );
      if (res.ok) {
        onMessage?.(
          res.data.completed
            ? `Attestation complete — ${caseStatusLabel(res.data.status)}`
            : "Steps DONE ho gaye, magar case status nahi badla (set ke steps check karein)",
          res.data.completed ? "success" : "info"
        );
        setOpen(false);
        setReason("");
        await onDone();
      } else {
        onMessage?.(res.error, "error");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 ${
          fullWidth ? "w-full text-sm" : ""
        }`}
      >
        <CheckCheck className="h-4 w-4" /> {label}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          onClick={() => !busy && setOpen(false)}
        >
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Attestation complete karein</h3>
                <p className="text-xs text-slate-500">
                  Tamam attestation steps DONE ho jayen ge aur case &quot;Attestation complete — final payment
                  pending&quot; par chala jayega. Payment poori ho to khud courier stage par.
                </p>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Band karein"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-semibold text-slate-700">
                Wajah {reasonRequired ? <span className="text-red-600">(lazmi)</span> : "(optional)"}
              </span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Maslan: attestation proof alag se nahi, printed proof hi kaafi hai"
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
              {reasonRequired && trimmed.length < MIN_REASON && (
                <span className="text-[11px] text-slate-400">Kam az kam {MIN_REASON} huroof likhein</span>
              )}
            </label>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canSubmit}
                onClick={() => void submit()}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                Complete karein
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
