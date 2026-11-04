"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Loader2, X } from "lucide-react";
import { formatMoney, officeFetch } from "@/lib/office/client";
import { caseStatusLabel, caseStatusStyle } from "@/lib/office/labels";
import { CASE_STATUSES } from "@/lib/office/permissions";
import { useToast } from "@/hooks/useToast";

// §W11.1/W11.2 — ONE shared status control (cases list row + detail header):
// chip jaisa dikhnay wala compact select. Options = 12 fixed statuses (flow
// order) + is case ki har attestation ka option "Attestation: <name>" — select
// karne par chhota modal "Wajah / note (optional)" maangta hai (§W14.7: optional), phir
// PATCH /api/office/cases/[id]/status. CANCELLED hamesha aakhir mein alag.
// Sirf admin ke liye render hota hai (caller decide karta hai).

type AttestationOption = {
  id: string;
  attestationType: { name: string };
  // §W57: modal ki list mein halat / tareekh (list row + detail dono dete hain).
  status?: string;
  scheduledDate?: string | null;
  completedDate?: string | null;
};

const ATTESTATION_STATE: Record<string, { label: string; cls: string }> = {
  PENDING: { label: "Pending", cls: "bg-slate-100 text-slate-600" },
  IN_PROGRESS: { label: "Jaari", cls: "bg-violet-100 text-violet-700" },
  DONE: { label: "Done", cls: "bg-emerald-100 text-emerald-700" },
};

// §W44: status peeche karne par server poochhta hai — department commission
// dobara dena hai ya nahi (har kaam ke liye alag).
type RecreditQuestion = { kind: string; label: string; count: number; amount: number; names: string[] };

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
  const [questions, setQuestions] = useState<RecreditQuestion[] | null>(null);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});

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
    } else if (raw === "ATTESTATION") {
      // §W57: sada "Attestation" — modal mein is case ki attestations ki list
      // se step chunna lazmi (server bhi bina step ke nahi manta).
      setPending({ status: "ATTESTATION", attestationId: null, label: "Attestation — step chunein" });
    } else {
      setPending({ status: raw, attestationId: null, label: caseStatusLabel(raw) });
    }
    setNote("");
    setQuestions(null);
    setAnswers({});
  }

  function closeModal() {
    setPending(null);
    setQuestions(null);
    setAnswers({});
  }

  async function confirmChange() {
    if (!pending) return;
    // §W14.7: note ab optional hai (khali note bhi chalta hai).
    setBusy(true);
    const res = await officeFetch(`/api/office/cases/${caseId}/status`, {
      method: "PATCH",
      json: {
        status: pending.status,
        note: note.trim(),
        ...(pending.attestationId ? { attestationId: pending.attestationId } : {}),
        ...(questions ? { recredit: answers } : {}),
      },
    });
    setBusy(false);
    if (res.ok) {
      showToast(`Status update ho gaya: ${pending.label}`, "success");
      closeModal();
      setNote("");
      onChanged();
      return;
    }
    // §W44: commission ka faisla chahiye — isi modal mein sawal dikhao.
    const asked = (res.data as { needsRecreditDecision?: RecreditQuestion[] } | undefined)?.needsRecreditDecision;
    if (res.status === 409 && Array.isArray(asked) && asked.length > 0) {
      setQuestions(asked);
      return;
    }
    showToast(res.error, "error");
  }

  const answeredAll = !questions || questions.every((question) => typeof answers[question.kind] === "boolean");

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
              {s === "ATTESTATION" ? "Attestation — step chunein…" : caseStatusLabel(s)}
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
          onClick={() => !busy && closeModal()}
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
                onClick={closeModal}
                aria-label="Band karein"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* §W57: Attestation status — is case ki attestations ki list (halat +
                tareekh) se step chunein; is ke baghair Confirm band. */}
            {pending.status === "ATTESTATION" && (
              <div className="space-y-1.5">
                <p className="text-xs font-semibold text-slate-600">Kis attestation par case ko le jayein?</p>
                {(attestations ?? []).length === 0 ? (
                  <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    Is case par abhi koi attestation nahi — pehle case ke &quot;Attestations&quot; tab se attestation / Set
                    of Attestations jodein.
                  </p>
                ) : (
                  <div className="max-h-56 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-1.5" role="radiogroup">
                    {(attestations ?? []).map((a, index) => {
                      const state = ATTESTATION_STATE[a.status ?? ""] ?? null;
                      const date = a.completedDate || a.scheduledDate;
                      const selected = pending.attestationId === a.id;
                      return (
                        <label
                          key={a.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm ${
                            selected ? "bg-primary-50 ring-1 ring-primary-300" : "hover:bg-slate-50"
                          }`}
                        >
                          <input
                            type="radio"
                            name={`attestation-${caseId}`}
                            checked={selected}
                            onChange={() =>
                              setPending({ status: "ATTESTATION", attestationId: a.id, label: `Attestation: ${a.attestationType.name}` })
                            }
                          />
                          <span className="w-5 shrink-0 text-xs text-slate-400">{index + 1}.</span>
                          <span className="min-w-0 flex-1 truncate font-medium text-slate-800">{a.attestationType.name}</span>
                          {state && (
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${state.cls}`}>{state.label}</span>
                          )}
                          {date && (
                            <span className="shrink-0 text-[11px] text-slate-400">
                              {new Date(date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}
                            </span>
                          )}
                        </label>
                      );
                    })}
                  </div>
                )}
                <p className="text-[11px] text-slate-400">
                  Chuni hui se pehle wali attestations Done, chuni hui jaari, baad wali Pending ho jayengi.
                </p>
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs text-slate-500">Wajah / note (optional)</label>
              <textarea
                autoFocus
                rows={2}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                placeholder="Wajah likhna optional hai"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            {questions && (
              <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-bold text-amber-800">
                  Ye kaam pehle ho chuka hai aur us ka commission department ko mil chuka hai. Kaam dobara hone par
                  commission dobara dena hai?
                </p>
                <p className="text-[11px] text-amber-800">
                  &quot;Haan&quot; = dobara wala commission is case ka kharcha bhi banega (case expenses mein nazar aayega)
                  aur booking office ke users ke khate se pehle wale formula ke mutabiq minus hoga.
                </p>
                {questions.map((question) => (
                  <div key={question.kind} className="space-y-1.5 rounded-lg bg-white p-2.5 text-xs">
                    <p className="text-slate-700">
                      <span className="font-bold">{question.label}</span> commission —{" "}
                      {formatMoney(question.amount)}
                      {question.names.length ? ` (${question.names.join(", ")})` : ""}
                      {question.count > 1 ? ` · ${question.count} dafa` : ""}
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAnswers({ ...answers, [question.kind]: true })}
                        className={`flex-1 rounded-lg px-3 py-1.5 font-semibold ${
                          answers[question.kind] === true
                            ? "bg-emerald-600 text-white"
                            : "border border-slate-200 text-slate-600 hover:border-emerald-300"
                        }`}
                      >
                        Haan, dobara dein
                      </button>
                      <button
                        type="button"
                        onClick={() => setAnswers({ ...answers, [question.kind]: false })}
                        className={`flex-1 rounded-lg px-3 py-1.5 font-semibold ${
                          answers[question.kind] === false
                            ? "bg-slate-700 text-white"
                            : "border border-slate-200 text-slate-600 hover:border-slate-400"
                        }`}
                      >
                        Nahi
                      </button>
                    </div>
                  </div>
                ))}
                <p className="text-[11px] text-amber-700">
                  Partner office ka case ho to dobara commission shareholders ke hisse se bhi katta hai.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={closeModal}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !answeredAll || (pending.status === "ATTESTATION" && !pending.attestationId)}
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
