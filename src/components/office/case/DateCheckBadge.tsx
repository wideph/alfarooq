"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Loader2, WifiOff } from "lucide-react";
import type { AttestationDateCheck } from "@/lib/office/types";

// §W61 — attestation date ki ONLINE check halat (Tavily khabrein + attached AI):
//   VERIFIED  — AI ne online khabrein dekh kar khula din kaha (roz dobara)
//   OFFLINE   — AI ne check kiya magar online khabrein nahi mili (jald dobara)
//   PENDING   — check baqi (system khud chala raha hai)
//   TENTATIVE — 20 din se aage; qareeb aane par check
//   CLOSED    — band mila; date khud aage ho rahi hai
const STYLES: Record<AttestationDateCheck["status"], { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  VERIFIED: { label: "AI ✓ online", className: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  OFFLINE: { label: "AI ✓ (bina online)", className: "bg-amber-50 text-amber-700 border-amber-200", Icon: WifiOff },
  PENDING: { label: "AI check baqi", className: "bg-sky-50 text-sky-700 border-sky-200", Icon: Clock },
  TENTATIVE: { label: "Tentative (20+ din)", className: "bg-slate-50 text-slate-600 border-slate-200", Icon: CalendarClock },
  CLOSED: { label: "Band — date badal rahi", className: "bg-red-50 text-red-700 border-red-200", Icon: AlertTriangle },
};

function when(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return date.toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Karachi" });
}

export default function DateCheckBadge({ check, checking = false }: { check?: AttestationDateCheck | null; checking?: boolean }) {
  if (!check) return null;
  const style = STYLES[check.status];
  const busy = checking && (check.status === "PENDING" || check.status === "CLOSED");
  const Icon = busy ? Loader2 : style.Icon;
  const title = [check.note, check.checkedAt ? `Check: ${when(check.checkedAt)}` : "", ...check.sources.map((source) => `• ${source.title}`)]
    .filter(Boolean)
    .join("\n");
  return (
    <span className="inline-flex items-center gap-1">
      <span
        title={title}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.className}`}
      >
        <Icon className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
        {busy ? "AI online check…" : style.label}
        {check.checkedAt && !busy && <span className="font-normal opacity-70">{when(check.checkedAt)}</span>}
      </span>
      {check.sources[0] && (
        <a
          href={check.sources[0].url}
          target="_blank"
          rel="noopener noreferrer"
          title={check.sources[0].title}
          className="text-[10px] font-semibold text-primary-700 hover:underline"
          onClick={(event) => event.stopPropagation()}
        >
          saboot
        </a>
      )}
    </span>
  );
}
