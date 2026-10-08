"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, MessageSquare, Send } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { formatDateTime, officeFetch } from "@/lib/office/client";
import { ROLE_LABELS } from "@/lib/office/permissions";
import { type CaseRemarkItem, inputClass, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

// docs 06 §N7 — targeted department remarks. Visibility API handle karti hai;
// yahan list + create (role ke mutabiq limited targets) + "Mark seen" (warning
// hatane ke liye PATCH recipientId). Chat-style bubbles: apne right, baqi left.

type RemarkTarget = "ADMIN" | "BOOKING" | "FILING" | "PRINTING" | "ATTA" | "COURIER";

const ALL_TARGETS: RemarkTarget[] = ["ADMIN", "BOOKING", "FILING", "PRINTING", "ATTA", "COURIER"];

export const REMARK_TARGET_LABELS: Record<RemarkTarget, string> = {
  ADMIN: "Admin",
  BOOKING: "Booking office",
  FILING: "Filing",
  PRINTING: "Printing",
  ATTA: "Atta",
  COURIER: "Courier",
};

// Client-side mirror of workflow.ts allowedRemarkTargets (server-only file).
function allowedTargetsFor(role?: string | null): RemarkTarget[] {
  switch (role) {
    case "admin":
      return ALL_TARGETS;
    case "booking_office":
      return ["ADMIN", "ATTA", "PRINTING"];
    case "filing":
      return ["ADMIN", "BOOKING", "PRINTING"];
    case "printing":
    case "atta":
    case "courier":
      return ALL_TARGETS;
    default:
      return [];
  }
}

export default function CaseRemarksTab({
  caseId,
  admin,
  onMessage,
  onChanged,
}: {
  caseId: string;
  admin: AdminNavUser;
  onMessage: (message: string, kind?: ToastKind) => void;
  onChanged?: () => Promise<void>;
}) {
  const canWrite = adminCanAny(admin, ["office:remarks:write"]);
  const [items, setItems] = useState<CaseRemarkItem[]>([]);
  const [hasUnseenWarning, setHasUnseenWarning] = useState(false);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [targets, setTargets] = useState<RemarkTarget[]>([]);
  const [busy, setBusy] = useState(false);

  const allowedTargets = allowedTargetsFor(admin.role);

  const load = useCallback(async () => {
    const res = await officeFetch<{ items: CaseRemarkItem[]; hasUnseenWarning: boolean }>(
      `/api/office/cases/${caseId}/remarks`
    );
    if (res.ok) {
      setItems(res.data.items);
      setHasUnseenWarning(res.data.hasUnseenWarning);
    }
    setLoading(false);
  }, [caseId]);

  useEffect(() => {
    void load();
  }, [load]);

  function toggleTarget(target: RemarkTarget) {
    setTargets((prev) => (prev.includes(target) ? prev.filter((t) => t !== target) : [...prev, target]));
  }

  async function submit() {
    setBusy(true);
    const res = await officeFetch(`/api/office/cases/${caseId}/remarks`, {
      method: "POST",
      json: { text, targets },
    });
    if (res.ok) {
      onMessage("Remark bhej diya gaya");
      setText("");
      setTargets([]);
      await load();
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function markSeen() {
    setBusy(true);
    const unseen = items.flatMap((remark) =>
      remark.targets.filter((target) => target.forMe && !target.seenAt).map((target) => target.recipientId)
    );
    for (const recipientId of unseen) {
      await officeFetch(`/api/office/cases/${caseId}/remarks`, { method: "PATCH", json: { recipientId } });
    }
    onMessage("Remarks seen mark ho gaye");
    await load();
    if (onChanged) await onChanged();
    setBusy(false);
  }

  return (
    <SectionCard
      icon={MessageSquare}
      title="Department remarks"
      count={items.length}
      actions={
        hasUnseenWarning && (
          <button
            disabled={busy}
            onClick={markSeen}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Mark seen
          </button>
        )
      }
    >
      {hasUnseenWarning && (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
          <AlertTriangle className="h-4 w-4 shrink-0" /> Aap ke department ke liye new remarks hain
        </div>
      )}

      {loading ? (
        <SkeletonRows rows={3} />
      ) : items.length === 0 ? (
        <EmptyState icon={MessageSquare} hint="Koi remark nahi — neeche se pehla remark bhejein" />
      ) : (
        <ul className="space-y-2">
          {items.map((remark) => {
            const unseenForMe = remark.targets.some((target) => target.forMe && !target.seenAt);
            return (
              <li key={remark.id} className={`flex ${remark.mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[85%] rounded-2xl border px-3.5 py-2.5 text-sm sm:max-w-[70%] ${
                    unseenForMe
                      ? "border-amber-300 bg-amber-50"
                      : remark.mine
                        ? "border-primary-200 bg-primary-50"
                        : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <p className="whitespace-pre-wrap text-slate-800">{remark.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {remark.targets.map((target) => (
                      <span
                        key={target.recipientId}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          target.seenAt ? "bg-slate-200 text-slate-600" : "bg-amber-200 text-amber-800"
                        }`}
                        title={target.seenAt ? `Seen ${formatDateTime(target.seenAt)}` : "Abhi unseen"}
                      >
                        {REMARK_TARGET_LABELS[target.target as RemarkTarget] || target.target}
                        {target.seenAt ? " ✓" : ""}
                      </span>
                    ))}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {remark.createdByName || "—"} ({ROLE_LABELS[remark.createdByRole] || remark.createdByRole}) ·{" "}
                    {formatDateTime(remark.createdAt)}
                    {remark.mine ? " · aap ka remark" : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && allowedTargets.length > 0 && (
        <div className="mt-3 space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Naya remark (departments ko warning)</p>
          <textarea
            className={inputClass}
            rows={2}
            placeholder="Remark likhein…"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            {allowedTargets.map((target) => (
              <label
                key={target}
                className={`min-h-[40px] cursor-pointer rounded-full border px-3 py-2 text-xs font-semibold ${
                  targets.includes(target)
                    ? "border-primary-500 bg-primary-50 text-primary-700"
                    : "border-slate-200 text-slate-600"
                }`}
              >
                <input type="checkbox" className="hidden" checked={targets.includes(target)} onChange={() => toggleTarget(target)} />
                {REMARK_TARGET_LABELS[target]}
              </label>
            ))}
          </div>
          <button disabled={busy || !text.trim() || targets.length === 0} onClick={submit} className={`${primaryBtnClass} min-h-[40px]`}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Remark bhejein
          </button>
        </div>
      )}
    </SectionCard>
  );
}
