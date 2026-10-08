"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { officeFetch } from "@/lib/office/client";
import { caseStatusLabel, caseStatusStyle } from "@/lib/office/labels";
import { CASE_STATUSES } from "@/lib/office/permissions";
import { useToast } from "@/hooks/useToast";

// §W11.1/W11.2 — ONE shared status control (cases list row + detail header):
// chip jaisa dikhnay wala compact select. Options = 12 fixed statuses (flow
// order) + is case ki har attestation ka option "Attestation: <name>" — select
// karne par chhota modal "Wajah / note *" maangta hai (API par lazmi), phir
// PATCH /api/office/cases/[id]/status. CANCELLED hamesha aakhir mein alag.
// Sirf admin ke liye render hota hai (caller decide karta hai).

type AttestationOption = { id: string; attestationType: { name: string } };

// 12 fixed statuses (CANCELLED alag, aakhir mein).
const FLOW_STATUSES = CASE_STATUSES.filter((s) => s !== "CANCELLED");

export default function CaseStatusSelect({
  caseId,
  status,
  currentAttestationId,
  attestations,
  onChanged,
  size = "sm",
}: {
  caseId: string;
  status: string;
  currentAttestationId?: string | null;
  attestations?: AttestationOption[];
  onChanged: () => void;
  size?: "sm" | "md";
}) {
  const { showToast, ToastElement } = useToast();
  const [pending, setPending] = useState<{ status: string; attestationId: string | null; label: string } | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  // Current select value: ATTESTATION ho to specific attestation option.
  const value = useMemo(() => {
    if (status === "ATTESTATION" && currentAttestationId) return `ATTESTATION:${currentAttestationId}`;
    return status;
  }, [status, currentAttestationId]);

  const currentName =
    status === "ATTESTATION"
      ? attestations?.find((a) => a.id === currentAttestationId)?.attestationType.name || null
      : null;
  const label = caseStatusLabel(status, currentName);

  function handleChange(raw: string) {
    if (raw === value) return;
    if (raw.startsWith("ATTESTATION:")) {
      const attestationId = raw.slice("ATTESTATION:".length);
      const name = attestations?.find((a) => a.id === attestationId)?.attestationType.name || "";
      setPending({ status: "ATTESTATION", attestationId, label: `Attestation: ${name}` });
    } else {
      setPending({ status: raw, attestationId: null, label: caseStatusLabel(raw) });
    }
    setNote("");
  }

  async function confirmChange() {
    if (!pending) return;
    if (!note.trim()) {
      showToast("Status change ki wajah (note) lazmi hai", "error");
      return;
    }
    setBusy(true);
    const res = await officeFetch(`/api/office/cases/${caseId}/status`, {
      method: "PATCH",
      json: {
        status: pending.status,
        note: note.trim(),
        ...(pending.attestationId ? { attestationId: pending.attestationId } : {}),
      },
    });
    setBusy(false);
    if (res.ok) {
      showToast(`Status update ho gaya: ${pending.label}`, "success");
      setPending(null);
      setNote("");
      onChanged();
    } else {
      showToast(res.error, "error");
    }
  }

  const sizeClasses =
    size === "md"
      ? "min-h-[44px] px-3.5 py-2 text-sm font-bold"
      : "min-h-[32px] px-2.5 py-1 text-[11px] font-semibold";

  return (
    <>
      <span
        className={`relative inline-flex max-w-full items-center gap-1 rounded-full ${sizeClasses} ${caseStatusStyle(status)}`}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className={size === "md" ? "h-4 w-4 shrink-0" : "h-3 w-3 shrink-0"} />
        <select
          aria-label="Case status badlein"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
        >
          {FLOW_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s === status && s !== "ATTESTATION" ? "✓ " : ""}
              {caseStatusLabel(s)}
            </option>
          ))}
          {(attestations || []).map((a) => (
            <option key={a.id} value={`ATTESTATION:${a.id}`}>
              {a.id === currentAttestationId && status === "ATTESTATION" ? "✓ " : ""}
              Attestation: {a.attestationType.name}
            </option>
          ))}
          <option disabled>──────────</option>
          <option value="CANCELLED">
            {status === "CANCELLED" ? "✓ " : ""}
            {caseStatusLabel("CANCELLED")}
          </option>
        </select>
      </span>

      {pending && (
        <div
          className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/40 p-4"
          onClick={() => !busy && setPending(null)}
        >
          <div
            className="w-full max-w-sm space-y-3 rounded-2xl bg-white p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Status badlein</h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Naya status: <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${caseStatusStyle(pending.status)}`}>{pending.label}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPending(null)}
                aria-label="Band karein"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">Wajah / note *</label>
              <textarea
                autoFocus
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                placeholder="Status kyun badal rahe hain? (lazmi)"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setPending(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !note.trim()}
                onClick={confirmChange}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastElement}
    </>
  );
}
