"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

// Shared white section card: icon + title + optional count badge + actions.
export default function SectionCard({
  icon: Icon,
  title,
  count,
  actions,
  children,
  className = "",
  id,
}: {
  icon?: LucideIcon;
  title: string;
  count?: number | null;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section
      id={id}
      className={`scroll-mt-28 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5 ${className}`}
    >
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
          {Icon && (
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-50 text-primary-600">
              <Icon className="h-4 w-4" />
            </span>
          )}
          {title}
          {count !== undefined && count !== null && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              {count}
            </span>
          )}
        </h3>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}
