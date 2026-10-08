"use client";

import type { LucideIcon } from "lucide-react";

// Empty state: soft icon + Roman-Urdu hint.
export default function EmptyState({
  icon: Icon,
  hint,
  className = "",
}: {
  icon: LucideIcon;
  hint: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center justify-center gap-1.5 rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center ${className}`}>
      <Icon className="h-6 w-6 text-slate-300" />
      <p className="text-sm text-slate-400">{hint}</p>
    </div>
  );
}
