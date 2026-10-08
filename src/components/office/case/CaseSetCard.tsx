"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Layers, Loader2 } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import { formatDate, officeFetch } from "@/lib/office/client";
import { ATTESTATION_STATUS_LABELS, ATTESTATION_STATUS_STYLES } from "@/lib/office/labels";
import { type CaseDetail, type CategorySetWithSteps, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

// docs 06 §N5/N7 — category set selection + generated step dates.
// office:cases:write set select karta hai (dimmed sets r-number ke mutabiq
// disabled); baqi departments dates read-only dekhte hain. Dates generate
// karne ka button admin / cashier / atta (office:attestation:write) ke liye.
export default function CaseSetCard({
  detail,
  admin,
  onReload,
  onMessage,
}: {
  detail: CaseDetail;
  admin: AdminNavUser;
  onReload: () => Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const canSelect = adminCanAny(admin, ["office:cases:write"]);
  const canGenerate =
    adminCanAny(admin, ["office:attestation:write", "office:atta:write"]) || admin.role === "cashier";
  const [sets, setSets] = useState<CategorySetWithSteps[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingReasons, setPendingReasons] = useState<string[]>([]);

  const loadSets = useCallback(async () => {
    if (!detail.category) return;
    setLoading(true);
    const params = new URLSearchParams({ categoryId: detail.category.id });
    if (detail.rollNumber) params.set("rollNumber", detail.rollNumber);
    const res = await officeFetch<CategorySetWithSteps[]>(`/api/office/setup/sets?${params}`);
    if (res.ok) setSets(res.data);
    setLoading(false);
  }, [detail.category, detail.rollNumber]);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  async function selectSet(set: CategorySetWithSteps) {
    if (set.dimmed || busy) return;
    setBusy(true);
    const res = await officeFetch<{ setName: string; dates: { pendingReasons: string[] } | null }>(
      `/api/office/cases/${detail.id}/set`,
      { method: "POST", json: { setId: set.id } }
    );
    if (res.ok) {
      onMessage(`Set select ho gaya: ${res.data.setName}`);
      if (res.data.dates?.pendingReasons?.length) setPendingReasons(res.data.dates.pendingReasons);
      else setPendingReasons([]);
      await onReload();
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function generateDates() {
    setBusy(true);
    const res = await officeFetch<{ status: string; pendingReasons: string[]; boardAttasNumber: string | null }>(
      `/api/office/cases/${detail.id}/generate-dates`,
      { method: "POST" }
    );
    if (res.ok) {
      setPendingReasons(res.data.pendingReasons || []);
      onMessage(
        res.data.status === "ok"
          ? `Dates generate ho gayi${res.data.boardAttasNumber ? ` — Board Attas # ${res.data.boardAttasNumber}` : ""}`
          : "Kuch dates pending hain — wajah neeche dekhein",
        res.data.status === "ok" ? "success" : "info"
      );
      await onReload();
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  const selectedSet = sets.find((set) => set.id === detail.setId) || null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 font-bold text-slate-900">
          <Layers className="w-4 h-4 text-primary-600" /> Attestation set
          {detail.setName && <span className="text-sm font-semibold text-primary-700">{detail.setName}</span>}
        </h3>
        {detail.setId && canGenerate && (
          <button disabled={busy} onClick={generateDates} className={primaryBtnClass}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CalendarClock className="w-4 h-4" />}
            Dates generate karein
          </button>
        )}
      </div>

      {!detail.category ? (
        <p className="text-sm text-slate-400">Pehle case ki category select karein — us ke baad set milega.</p>
      ) : loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
        </div>
      ) : (
        <>
          {canSelect && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-400">Set select karein</p>
              {sets.length === 0 && <p className="text-sm text-slate-400">Is category ke liye koi set nahi (Setup se add karein)</p>}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {sets.map((set) => {
                  const selected = set.id === detail.setId;
                  return (
                    <button
                      key={set.id}
                      disabled={busy || set.dimmed}
                      title={set.dimmed ? set.reason || "Ye set available nahi" : set.steps.map((s) => s.label).join(" + ")}
                      onClick={() => selectSet(set)}
                      className={`rounded-xl border p-3 text-left text-sm ${
                        set.dimmed
                          ? "cursor-not-allowed border-slate-200 opacity-50"
                          : selected
                            ? "border-primary-500 bg-primary-50"
                            : "border-slate-200 hover:border-primary-300"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 font-semibold text-slate-800">
                        {set.name}
                        {selected && <Check className="w-4 h-4 text-primary-600" />}
                      </span>
                      <span className="mt-1 block text-xs text-slate-500">{set.steps.map((s) => s.label).join(" + ")}</span>
                      {set.dimmed && <span className="mt-1 block text-xs font-semibold text-red-500">{set.reason}</span>}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {selectedSet && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase text-slate-400">Set steps & dates</p>
              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                {selectedSet.steps.map((step) => {
                  const attestation = detail.attestations.find((a) => a.attestationType.name === step.label);
                  return (
                    <div key={step.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
                      <div className="min-w-[9rem] flex-1">
                        <p className="font-semibold text-slate-800">{step.label}</p>
                        <p className="text-xs text-slate-500">
                          Scheduled {formatDate(attestation?.scheduledDate)}
                          {attestation?.completedDate ? ` · Done ${formatDate(attestation.completedDate)}` : ""}
                          {attestation?.notes ? ` · ${attestation.notes}` : ""}
                        </p>
                      </div>
                      {step.stepKey === "BORD" && detail.boardAttasNumber && (
                        <span className="rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
                          Board Attas # {detail.boardAttasNumber}
                        </span>
                      )}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                          ATTESTATION_STATUS_STYLES[attestation?.status || "PENDING"]
                        }`}
                      >
                        {ATTESTATION_STATUS_LABELS[attestation?.status || "PENDING"]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {pendingReasons.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              <p className="font-bold">Dates pending — wajah:</p>
              <ul className="mt-1 list-disc pl-4">
                {pendingReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
