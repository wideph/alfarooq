"use client";

import { Banknote, Briefcase, Building2, Wallet } from "lucide-react";
import { formatMoney } from "@/lib/office/client";
import type { OfficeDashboardTotals } from "@/components/office/dashboard/types";

// Admin-only totals strip — saari offices ka ek nazar summary. Money semantics:
// pending/dues amber, received emerald.
export default function OfficesTotalsStrip({ totals }: { totals: OfficeDashboardTotals }) {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <StatCard label="Offices" value={String(totals.offices)} icon={<Building2 className="h-5 w-5" />} />
      <StatCard label="Total cases" value={String(totals.casesTotal)} icon={<Briefcase className="h-5 w-5" />} />
      <StatCard
        label="Pending payments"
        value={formatMoney(totals.pendingPaymentsAmount)}
        icon={<Banknote className="h-5 w-5" />}
        tone={totals.pendingPaymentsAmount > 0 ? "amber" : "slate"}
      />
      <StatCard
        label="Received total"
        value={formatMoney(totals.receivedTotal)}
        icon={<Banknote className="h-5 w-5" />}
        tone={totals.receivedTotal > 0 ? "emerald" : "slate"}
      />
      <StatCard
        label="Total dues"
        value={formatMoney(totals.duesTotal)}
        icon={<Wallet className="h-5 w-5" />}
        tone={totals.duesTotal > 0 ? "amber" : "slate"}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  tone = "slate",
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone?: "slate" | "amber" | "emerald";
}) {
  const toneClasses =
    tone === "amber"
      ? "border-amber-200 bg-amber-50"
      : tone === "emerald"
        ? "border-emerald-200 bg-emerald-50"
        : "border-slate-200 bg-white";
  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClasses}`}>
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-lg font-bold text-slate-900">{value}</p>
    </div>
  );
}
