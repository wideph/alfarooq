"use client";

import type { LucideIcon } from "lucide-react";

const TONES = {
  slate: "bg-slate-50 text-slate-900",
  emerald: "bg-emerald-50 text-emerald-700",
  amber: "bg-amber-50 text-amber-700",
  red: "bg-red-50 text-red-700",
  violet: "bg-violet-50 text-violet-700",
  primary: "bg-primary-50 text-primary-800",
} as const;

// Compact stat tile (money summary, key dates).
export default function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = "slate",
}: {
  icon?: LucideIcon;
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof TONES;
}) {
  return (
    <div className={`rounded-xl border border-slate-100 p-3 ${TONES[tone]}`}>
      <p className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
        {Icon && <Icon className="h-3.5 w-3.5" />}
        {label}
      </p>
      <p className="mt-0.5 truncate text-base font-bold">{value}</p>
      {hint && <p className="text-[11px] opacity-60">{hint}</p>}
    </div>
  );
}
