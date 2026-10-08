"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, Loader2, MessageSquare, Send } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import { formatDateTime, officeFetch } from "@/lib/office/client";
import { ROLE_LABELS } from "@/lib/office/permissions";
import { type CaseRemarkItem, inputClass, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

// docs 06 §N7 — targeted department remarks. Visibility API handle karti hai;
// yahan list + create (role ke mutabiq limited targets) + "Mark seen" (warning
// hatane ke liye PATCH recipientId).

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

export default function CaseRemarksCard({
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
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      <h3 className="flex items-center gap-2 font-bold text-slate-900">
        <MessageSquare className="w-4 h-4 text-primary-600" /> Department remarks
      </h3>

      {hasUnseenWarning && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" /> Aap ke department ke liye new remarks hain
          </span>
          <button
            disabled={busy}
            onClick={markSeen}
            className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Mark seen
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
        </div>
      ) : (
        <ul className="space-y-2">
          {items.length === 0 && <li className="text-sm text-slate-400">Koi remark nahi</li>}
          {items.map((remark) => {
            const unseenForMe = remark.targets.some((target) => target.forMe && !target.seenAt);
            return (
              <li
                key={remark.id}
                className={`rounded-xl border p-3 text-sm ${
                  unseenForMe ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50"
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
              </li>
            );
          })}
        </ul>
      )}

      {canWrite && allowedTargets.length > 0 && (
        <div className="space-y-2 rounded-xl border border-slate-200 p-3">
          <p className="text-xs font-semibold uppercase text-slate-500">Naya remark (departments ko warning)</p>
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
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  targets.includes(target) ? "border-primary-500 bg-primary-50 text-primary-700" : "border-slate-200 text-slate-600"
                }`}
              >
                <input type="checkbox" className="hidden" checked={targets.includes(target)} onChange={() => toggleTarget(target)} />
                {REMARK_TARGET_LABELS[target]}
              </label>
            ))}
          </div>
          <button disabled={busy || !text.trim() || targets.length === 0} onClick={submit} className={primaryBtnClass}>
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Remark bhejein
          </button>
        </div>
      )}
    </div>
  );
}
