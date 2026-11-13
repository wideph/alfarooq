"use client";

import { AlertTriangle, CalendarClock, CheckCircle2, Clock, Loader2, WifiOff } from "lucide-react";
import type { AttestationDateCheck } from "@/lib/office/types";

// §W61 — attestation date ki ONLINE check halat (Tavily khabrein + attached AI):
//   VERIFIED  — online khabrein dekh kar khula din (roz dobara)
//   OFFLINE   — check hua magar online khabrein nahi mili (jald dobara)
//   PENDING   — check baqi (system khud chala raha hai)
//   TENTATIVE — 20 din se aage; qareeb aane par check
//   CLOSED    — chhutti mili; date khud aage ho rahi hai
// §W63 (owner): check ka WAQT / TAREEKH yahan kabhi nahi (na badge mein, na
// tooltip mein) — attestation ki date ke saath doosri date confusion banati thi.
const STYLES: Record<AttestationDateCheck["status"], { label: string; className: string; Icon: typeof CheckCircle2 }> = {
  VERIFIED: { label: "✓ Khula din (online check)", className: "bg-emerald-50 text-emerald-700 border-emerald-200", Icon: CheckCircle2 },
  OFFLINE: { label: "✓ Khula din (bina online)", className: "bg-amber-50 text-amber-700 border-amber-200", Icon: WifiOff },
  PENDING: { label: "Chhutti check baqi", className: "bg-sky-50 text-sky-700 border-sky-200", Icon: Clock },
  TENTATIVE: { label: "Tentative (20+ din)", className: "bg-slate-50 text-slate-600 border-slate-200", Icon: CalendarClock },
  CLOSED: { label: "Chhutti — date badal rahi", className: "bg-red-50 text-red-700 border-red-200", Icon: AlertTriangle },
};

export default function DateCheckBadge({ check, checking = false }: { check?: AttestationDateCheck | null; checking?: boolean }) {
  if (!check) return null;
  const style = STYLES[check.status];
  const busy = checking && (check.status === "PENDING" || check.status === "CLOSED");
  const Icon = busy ? Loader2 : style.Icon;
  const title = [check.note, ...check.sources.map((source) => `• ${source.title}`)].filter(Boolean).join("\n");
  return (
    <span className="inline-flex items-center gap-1">
      <span
        title={title}
        className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${style.className}`}
      >
        <Icon className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
        {busy ? "Chhutti check ho raha…" : style.label}
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
