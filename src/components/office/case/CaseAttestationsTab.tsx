"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, Check, Layers, Loader2, Plus, Printer, Stamp, Trash2 } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import SectionCard from "@/components/ui/SectionCard";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { formatDate, officeFetch, toInputDate } from "@/lib/office/client";
import { ATTESTATION_STATUS_LABELS, ATTESTATION_STATUS_STYLES } from "@/lib/office/labels";
import { ATTESTATION_STATUSES } from "@/lib/office/permissions";
import { type CaseDetail, type CategorySetWithSteps, inputClass, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

type AttestationType = { id: string; name: string; isActive: boolean };

type Props = {
  detail: CaseDetail;
  admin: AdminNavUser;
  onUpdated: (next: CaseDetail) => void;
  onReload: () => Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
  pendingReasons: string[];
  setPendingReasons: (reasons: string[]) => void;
};

// Attestations & Dates tab: set selection (dimmed logic preserved), generate
// dates, merged steps table (step / scheduled / status / notes / actions),
// board attas number, expected printing date. Logic pehle CaseSetCard +
// CaseAttestations mein tha.
export default function CaseAttestationsTab(props: Props) {
  return (
    <div className="space-y-4">
      <SetPanel {...props} />
      <StepsPanel {...props} />
    </div>
  );
}

/* ------------------------------- Set panel ------------------------------- */

function SetPanel({ detail, admin, onReload, onMessage, setPendingReasons }: Props) {
  const canSelect = adminCanAny(admin, ["office:cases:write"]);
  const canGenerate =
    adminCanAny(admin, ["office:attestation:write", "office:atta:write"]) || admin.role === "cashier";
  const [sets, setSets] = useState<CategorySetWithSteps[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

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

  return (
    <SectionCard
      icon={Layers}
      title="Attestation set"
      actions={
        detail.setId &&
        canGenerate && (
          <button disabled={busy} onClick={generateDates} className={`${primaryBtnClass} min-h-[40px]`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CalendarClock className="h-4 w-4" />}
            Dates generate karein
          </button>
        )
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className={`rounded-full px-3 py-1 text-xs font-bold ${detail.setName ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-slate-500"}`}>
          {detail.setName ? `Set: ${detail.setName}` : "Koi set select nahi"}
        </span>
        {detail.boardAttasNumber && (
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-bold text-indigo-700">
            Board Attas # {detail.boardAttasNumber}
          </span>
        )}
      </div>

      {!detail.category ? (
        <EmptyState icon={Layers} hint="Pehle case ki category select karein — us ke baad set milega" />
      ) : loading ? (
        <SkeletonRows rows={2} />
      ) : canSelect ? (
        <div className="space-y-2">
          {sets.length === 0 && <EmptyState icon={Layers} hint="Is category ke liye koi set nahi (Setup se add karein)" />}
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {sets.map((set) => {
              const selected = set.id === detail.setId;
              return (
                <button
                  key={set.id}
                  disabled={busy || set.dimmed}
                  title={set.dimmed ? set.reason || "Ye set available nahi" : set.steps.map((s) => s.label).join(" + ")}
                  onClick={() => selectSet(set)}
                  className={`rounded-xl border p-3 text-left text-sm transition ${
                    set.dimmed
                      ? "cursor-not-allowed border-slate-200 opacity-50"
                      : selected
                        ? "border-primary-500 bg-primary-50"
                        : "border-slate-200 hover:border-primary-300"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2 font-semibold text-slate-800">
                    {set.name}
                    {selected && <Check className="h-4 w-4 text-primary-600" />}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{set.steps.map((s) => s.label).join(" + ")}</span>
                  {set.dimmed && <span className="mt-1 block text-xs font-semibold text-red-500">{set.reason}</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        !detail.setName && <p className="text-sm text-slate-400">Set booking office select karega.</p>
      )}
    </SectionCard>
  );
}

/* --------------------- Steps table + printing controls -------------------- */

function StepsPanel({ detail, admin, onUpdated, onMessage }: Props) {
  const canEditList = adminCanAny(admin, ["office:cases:write"]);
  const canStatus = adminCanAny(admin, ["office:attestation:write"]);
  // §N7: atta department sirf steps aage barha sakta hai (PENDING → IN_PROGRESS → DONE).
  const canAtta = !canStatus && adminCanAny(admin, ["office:atta:write"]);
  const [types, setTypes] = useState<AttestationType[]>([]);
  const [addId, setAddId] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (canEditList) {
      officeFetch<AttestationType[]>("/api/office/setup/attestation-types").then((res) => {
        if (res.ok) setTypes(res.data.filter((t) => t.isActive));
      });
    }
  }, [canEditList]);

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
    <SectionCard
      icon={Stamp}
      title="Steps & dates"
      count={detail.attestations.length}
      actions={
        canStatus && (
          // §W11.3: case status ka control ab sirf CaseStatusHeader mein hai
          // (admin, note lazmi) — yahan duplicate status UI nahi. Printed flag
          // workflow shortcut yahin rehta hai.
          <button
            disabled={busy}
            onClick={() =>
              call(
                `/api/office/cases/${detail.id}/status`,
                "PATCH",
                { isPrinted: !detail.isPrinted },
                detail.isPrinted ? "Printed flag hata diya" : "Case printed mark ho gaya"
              )
            }
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold ${
              detail.isPrinted ? "border border-slate-300 text-slate-700" : "bg-indigo-600 text-white"
            }`}
          >
            <Printer className="h-3.5 w-3.5" /> {detail.isPrinted ? "Unmark printed" : "Mark printed"}
          </button>
        )
      }
    >
      <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatTile
          icon={CalendarClock}
          label="Expected printing"
          value={formatDate(detail.expectedPrintingDate)}
          hint="Payment date + 6 din, pehla working day"
          tone="primary"
        />
      </div>

      {detail.attestations.length === 0 ? (
        <EmptyState icon={Stamp} hint="Koi attestation required nahi — set select karein ya neeche add karein" />
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
          {detail.attestations.map((a) => {
            // §W11.3: current attestation (Case.currentAttestationId) highlight.
            const isCurrent = a.id === detail.currentAttestationId && detail.status === "ATTESTATION";
            return (
            <li
              key={a.id}
              className={`flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm ${
                isCurrent ? "bg-violet-50 ring-2 ring-inset ring-violet-400" : ""
              }`}
            >
              <div className="min-w-[10rem] flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-800">
                  {a.attestationType.name}
                  {isCurrent && (
                    <span className="rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white">
                      CURRENT
                    </span>
                  )}
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
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    disabled={busy}
                    aria-label="Attestation status"
                    className="min-h-[36px] rounded-lg border border-slate-200 px-2 py-1.5 text-xs"
                    value={a.status}
                    onChange={(e) =>
                      call(
                        `/api/office/cases/${detail.id}/attestations`,
                        "PATCH",
                        { id: a.id, status: e.target.value },
                        "Attestation status update ho gaya"
                      )
                    }
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
                      className="ml-1 min-h-[36px] rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      value={toInputDate(a.scheduledDate)}
                      onChange={(e) =>
                        call(`/api/office/cases/${detail.id}/attestations`, "PATCH", { id: a.id, scheduledDate: e.target.value }, "Date update ho gayi")
                      }
                    />
                  </label>
                  <label className="text-[11px] text-slate-500">
                    Done
                    <input
                      type="date"
                      className="ml-1 min-h-[36px] rounded-lg border border-slate-200 px-2 py-1 text-xs"
                      value={toInputDate(a.completedDate)}
                      onChange={(e) =>
                        call(`/api/office/cases/${detail.id}/attestations`, "PATCH", { id: a.id, completedDate: e.target.value }, "Date update ho gayi")
                      }
                    />
                  </label>
                </div>
              ) : (
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ATTESTATION_STATUS_STYLES[a.status]}`}>
                  {ATTESTATION_STATUS_LABELS[a.status]}
                </span>
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
                  className={`inline-flex min-h-[40px] items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-40 ${
                    a.status === "PENDING" ? "bg-violet-600 text-white" : "bg-emerald-600 text-white"
                  }`}
                >
                  {busy && <Loader2 className="h-3 w-3 animate-spin" />}
                  {a.status === "PENDING" ? "Shuru karein" : "Done karein"}
                </button>
              )}

              {canEditList && a.status === "PENDING" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    call(`/api/office/cases/${detail.id}/attestations?attestationId=${a.id}`, "DELETE", undefined, "Attestation remove ho gayi")
                  }
                  aria-label="Attestation remove karein"
                  className="rounded-lg p-2 text-red-500 hover:bg-red-50"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
            );
          })}
        </ul>
      )}

      {canEditList && available.length > 0 && (
        <div className="mt-3 flex gap-2">
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
            className={`${primaryBtnClass} min-h-[40px] shrink-0`}
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Add
          </button>
        </div>
      )}
    </SectionCard>
  );
}
