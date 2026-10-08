"use client";

import { AlertTriangle, CalendarClock, MessageSquareWarning } from "lucide-react";
import type { CaseDetail } from "@/lib/office/types";

// Slim single-line alerts — sirf tab dikhte hain jab koi warning ho:
// set-missing (red), unseen remarks (amber), generate-dates pendingReasons (amber box).
export default function CaseWarningStrip({
  detail,
  pendingReasons,
  onOpenTab,
}: {
  detail: CaseDetail;
  pendingReasons: string[];
  onOpenTab: (tab: string) => void;
}) {
  if (!detail.setMissingWarning && !detail.hasUnseenWarning && pendingReasons.length === 0) return null;

  return (
    <div className="space-y-2">
      {detail.setMissingWarning && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 sm:text-sm">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          <span className="flex-1">
            Is case ka set select nahi kiya gaya — printing ho chuki hai. &quot;Attestations &amp; Dates&quot; tab se set select karein.
          </span>
          <button
            onClick={() => onOpenTab("attestations")}
            className="rounded-lg bg-red-600 px-2.5 py-1.5 text-[11px] font-bold text-white"
          >
            Set select karein
          </button>
        </div>
      )}

      {detail.hasUnseenWarning && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 sm:text-sm">
          <MessageSquareWarning className="h-4 w-4 shrink-0" />
          <span className="flex-1">Aap ke department ke liye new remarks hain.</span>
          <button
            onClick={() => onOpenTab("remarks")}
            className="rounded-lg bg-amber-600 px-2.5 py-1.5 text-[11px] font-bold text-white"
          >
            Remarks dekhein
          </button>
        </div>
      )}

      {pendingReasons.length > 0 && (
        <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-bold">Dates pending — wajah:</p>
            <ul className="mt-0.5 list-disc pl-4">
              {pendingReasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}
