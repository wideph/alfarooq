"use client";

import Link from "next/link";
import { ArrowRight, Briefcase, Users } from "lucide-react";
import { formatMoney } from "@/lib/office/client";
import { caseStatusLabel, caseStatusStyle } from "@/lib/office/labels";
import { BOOKING_OFFICE_TYPE_LABELS, CASE_STATUSES, type BookingOfficeType } from "@/lib/office/permissions";
import type { OfficeDashboardOffice } from "@/components/office/dashboard/types";

// Card par chhota chip — poora label bohat lamba hai ("Fixed commission (per
// category)"), is liye compact naam rakhe hain.
const TYPE_CHIP_LABELS: Record<string, string> = {
  PROFIT_SHARE: "Profit Share",
  FIXED_COMMISSION: "Fixed Commission",
  SALARY: "Salary",
};

function officeTypeLabel(type: string): string {
  return (
    TYPE_CHIP_LABELS[type] ||
    BOOKING_OFFICE_TYPE_LABELS[type as BookingOfficeType] ||
    type
  );
}

// Ek office ka overview card — /office grid mein use hota hai. Money row sirf
// admin ke liye; booking-office viewer ko sirf "Mera due" dikhta hai.
export default function OfficeCard({
  office,
  isAdmin,
}: {
  office: OfficeDashboardOffice;
  isAdmin: boolean;
}) {
  // /office/cases + uski API dono ?officeId= filter support karte hain (scope
  // server-side check hota hai), is liye card se direct filtered list khulti hai.
  const casesHref = `/office/cases?officeId=${encodeURIComponent(office.id)}`;
  const financeHref = isAdmin ? `/office/finance/${encodeURIComponent(office.id)}` : "/office/finance";

  // Sirf non-zero statuses, CASE_STATUSES ke canonical order mein.
  const orderedStatuses = [
    ...CASE_STATUSES,
    ...Object.keys(office.statusCounts).filter((s) => !CASE_STATUSES.includes(s as (typeof CASE_STATUSES)[number])),
  ].filter((s, index, list) => (office.statusCounts[s] || 0) > 0 && list.indexOf(s) === index);
  const visibleStatuses = orderedStatuses.slice(0, 4);
  const hiddenCount = orderedStatuses.length - visibleStatuses.length;

  return (
    <div className="flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Header — poora click Cases (filtered) par jata hai */}
      <Link
        href={casesHref}
        className="block rounded-t-2xl border-b border-slate-100 p-4 transition-colors hover:bg-slate-50"
      >
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-slate-900">{office.name}</h3>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
            {officeTypeLabel(office.type)}
          </span>
        </div>
        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
          <Users className="h-3.5 w-3.5" />
          {office.memberCount} {office.memberCount === 1 ? "member" : "members"}
        </p>
      </Link>

      <div className="flex-1 space-y-3 p-4">
        {/* Cases row */}
        <div>
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <Briefcase className="h-3.5 w-3.5" />
            {office.casesTotal} {office.casesTotal === 1 ? "case" : "cases"}
          </p>
          {visibleStatuses.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {visibleStatuses.map((status) => (
                <span
                  key={status}
                  className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${caseStatusStyle(status)}`}
                >
                  {caseStatusLabel(status)}: {office.statusCounts[status]}
                </span>
              ))}
              {hiddenCount > 0 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                  +{hiddenCount} more
                </span>
              )}
            </div>
          )}
        </div>

        {/* Money row — admin: office ki poori money; non-admin: sirf apna due */}
        {isAdmin ? (
          <div className="grid grid-cols-3 gap-2 rounded-xl bg-slate-50 p-3 text-center">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pending</p>
              <p className="mt-0.5 text-sm font-bold text-amber-600">
                {formatMoney(office.pendingPaymentsAmount)}
              </p>
              <p className="text-[11px] text-slate-400">
                {office.pendingPaymentsCount} {office.pendingPaymentsCount === 1 ? "payment" : "payments"}
              </p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Received</p>
              <p className="mt-0.5 text-sm font-bold text-emerald-600">{formatMoney(office.receivedTotal)}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Dues</p>
              <p className="mt-0.5 text-sm font-bold text-amber-600">{formatMoney(office.duesTotal)}</p>
            </div>
          </div>
        ) : (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-700">
            Mera due: {formatMoney(office.ownDue)}
          </p>
        )}
      </div>

      {/* Footer links */}
      <div className="flex items-center gap-2 border-t border-slate-100 p-3">
        <Link
          href={casesHref}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Cases <ArrowRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href={financeHref}
          className="inline-flex flex-1 items-center justify-center gap-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          Finance <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
