"use client";

import Link from "next/link";
import { ArrowRight, Building2 } from "lucide-react";
import { formatMoney } from "@/lib/office/client";
import type { BookingOfficeType } from "@/lib/office/permissions";
import { OfficeTypeChip, SectionHeader } from "./ui";

export type OfficeCardData = {
  officeId: string;
  officeName: string;
  officeType: BookingOfficeType;
  received: number;
  expenses: number;
  dues: number;
};

// Ek compact card per office — kai offices hon to grid wrap ho jati hai.
export default function OfficesGrid({ offices }: { offices: OfficeCardData[] }) {
  return (
    <section className="space-y-2">
      <SectionHeader
        icon={<Building2 className="h-4 w-4 text-primary-600" />}
        title="Offices"
        count={offices.length}
      />
      {offices.length === 0 ? (
        <p className="rounded-2xl border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-400">
          Abhi koi office nahi
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {offices.map((office) => (
            <div
              key={office.officeId}
              className="flex flex-col rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2">
                <p className="min-w-0 flex-1 truncate text-sm font-bold text-slate-900">{office.officeName}</p>
                <OfficeTypeChip type={office.officeType} />
              </div>
              <dl className="mt-3 space-y-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Received</dt>
                  <dd className="font-semibold text-emerald-700">{formatMoney(office.received)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Expenses</dt>
                  <dd className="font-semibold text-red-600">{formatMoney(office.expenses)}</dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-slate-500">Total dues</dt>
                  <dd className={`font-bold ${office.dues > 0 ? "text-amber-700" : "text-emerald-700"}`}>
                    {formatMoney(office.dues)}
                  </dd>
                </div>
              </dl>
              <Link
                href={`/office/finance/${office.officeId}`}
                className="mt-3 inline-flex items-center gap-1 self-start text-xs font-bold text-primary-700 hover:underline"
              >
                Ledger <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
