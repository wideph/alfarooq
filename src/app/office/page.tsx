"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Building2, Plus } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import { adminCanAny } from "@/components/admin/AdminNav";
import { officeFetch } from "@/lib/office/client";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import OfficeCard from "@/components/office/dashboard/OfficeCard";
import OfficesTotalsStrip from "@/components/office/dashboard/OfficesTotalsStrip";
import type { OfficeDashboardResponse } from "@/components/office/dashboard/types";

// /office — saari booking offices ka overview. Admin ko totals strip + har
// office ki money milti hai; booking-office viewer ko sirf apni offices aur
// apna due nazar aata hai (baqi members ki money API bhejta hi nahi).
export default function OfficesOverviewPage() {
  const [data, setData] = useState<OfficeDashboardResponse | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await officeFetch<OfficeDashboardResponse>("/api/office/dashboard");
    if (res.ok) setData(res.data);
    else setError(res.error);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // §W11.5: overview live (15s polling + focus + office:changed).
  useLiveRefresh(load);

  return (
    <OfficePageFrame>
      {(admin) => {
        const isAdmin = data?.viewer.isAdmin ?? admin.role === "admin";
        return (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-900">Offices</h2>
              {adminCanAny(admin, ["office:cases:write"]) && (
                <Link
                  href="/office/cases/new"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <Plus className="w-4 h-4" /> New case
                </Link>
              )}
            </div>

            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

            {!data ? (
              <OfficesSkeleton isAdmin={isAdmin} />
            ) : data.offices.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
                <Building2 className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">Abhi koi office nahi hai</p>
                <p className="mt-1 text-xs text-slate-400">
                  Nayi office banane ke liye admin panel ya Links ke setup area ka istemal karein — office
                  yahan nazar aayegi.
                </p>
              </div>
            ) : (
              <>
                {isAdmin && <OfficesTotalsStrip totals={data.totals} />}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {data.offices.map((office) => (
                    <OfficeCard key={office.id} office={office} isAdmin={isAdmin} />
                  ))}
                </div>
              </>
            )}
          </div>
        );
      }}
    </OfficePageFrame>
  );
}

function OfficesSkeleton({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="space-y-6 animate-pulse" aria-label="Offices load ho rahi hain">
      {isAdmin && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="h-3 w-2/3 rounded bg-slate-200" />
              <div className="mt-3 h-6 w-1/2 rounded bg-slate-200" />
            </div>
          ))}
        </div>
      )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="space-y-2 border-b border-slate-100 p-4">
              <div className="h-4 w-1/2 rounded bg-slate-200" />
              <div className="h-3 w-1/3 rounded bg-slate-100" />
            </div>
            <div className="space-y-3 p-4">
              <div className="h-3 w-24 rounded bg-slate-200" />
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-5 w-20 rounded-full bg-slate-100" />
                ))}
              </div>
              <div className="h-16 rounded-xl bg-slate-100" />
            </div>
            <div className="flex gap-2 border-t border-slate-100 p-3">
              <div className="h-9 flex-1 rounded-xl bg-slate-100" />
              <div className="h-9 flex-1 rounded-xl bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
