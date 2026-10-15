"use client";

import type { ReactNode } from "react";
import { formatMoney } from "@/lib/office/client";
import type { BookingOfficeType } from "@/lib/office/permissions";
import { OFFICE_TYPE_SHORT } from "./types";

// Shared building blocks for the office finance screens (wave 16). Card /
// table / rounded-2xl conventions match the rest of the office module.

export const inputCls =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

export const primaryBtnCls =
  "inline-flex min-h-[40px] items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";

export type Tone = "emerald" | "red" | "sky" | "amber" | "slate" | "primary";

const TONE_BOX: Record<Tone, string> = {
  emerald: "border-emerald-200 bg-emerald-50 text-emerald-800",
  red: "border-red-200 bg-red-50 text-red-800",
  sky: "border-sky-200 bg-sky-50 text-sky-800",
  amber: "border-amber-200 bg-amber-50 text-amber-800",
  slate: "border-slate-200 bg-slate-50 text-slate-800",
  primary: "border-primary-200 bg-primary-50 text-primary-800",
};

export function StatCard({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: Tone;
  hint?: string;
}) {
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${TONE_BOX[tone]}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{label}</p>
      <p className="mt-1 truncate text-xl font-bold">{formatMoney(value)}</p>
      {hint ? <p className="mt-0.5 text-[11px] opacity-60">{hint}</p> : null}
    </div>
  );
}

const TYPE_CHIP: Record<BookingOfficeType, string> = {
  FIXED_COMMISSION: "bg-sky-100 text-sky-700",
  PROFIT_SHARE: "bg-emerald-100 text-emerald-700",
  SALARY: "bg-slate-200 text-slate-600",
};

export function OfficeTypeChip({ type, short }: { type: BookingOfficeType; short?: boolean }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-bold ${TYPE_CHIP[type]}`}
    >
      {short && type === "SALARY" ? "Salary" : OFFICE_TYPE_SHORT[type]}
    </span>
  );
}

export function SectionHeader({
  icon,
  title,
  count,
  action,
}: {
  icon?: ReactNode;
  title: string;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        {icon}
        {title}
        {typeof count === "number" && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">{count}</span>
        )}
      </h3>
      {action}
    </div>
  );
}

export function TableSkeleton({ rows }: { rows: number }) {
  return (
    <div className="animate-pulse divide-y divide-slate-100" aria-label="Load ho raha hai">
      <div className="bg-slate-50 px-3 py-2">
        <div className="h-3 w-1/2 rounded bg-slate-200" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-3 py-3">
          <div className="h-3.5 w-20 rounded bg-slate-200" />
          <div className="h-3.5 flex-1 rounded bg-slate-100" />
          <div className="h-3.5 w-16 rounded bg-slate-100" />
          <div className="h-3.5 w-14 rounded bg-slate-200" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="px-3 py-8 text-center text-sm text-slate-400">{children}</p>;
}

// Due amount colouring used everywhere: amber jab dena hai, emerald jab clear.
export function dueToneClass(due: number): string {
  if (due > 0) return "text-amber-700";
  if (due < 0) return "text-red-700";
  return "text-emerald-700";
}
