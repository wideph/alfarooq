"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Banknote, Briefcase, ClipboardList, Loader2, Plus } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import { adminCanAny } from "@/components/admin/AdminNav";
import { formatDate, officeFetch } from "@/lib/office/client";
import { CASE_STATUSES } from "@/lib/office/permissions";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/office/labels";

type Dashboard = {
  statusCounts: Record<string, number>;
  totalCases: number;
  pendingPayments: number;
  pendingRemaining: number;
  recentCases: Array<{
    id: string;
    caseNumber: string;
    clientName: string;
    status: string;
    expectedPrintingDate: string | null;
    createdAt: string;
    bookingOffice: { name: string };
    category: { name: string } | null;
  }>;
};

export default function OfficeDashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    officeFetch<Dashboard>("/api/office/dashboard").then((res) => {
      if (res.ok) setData(res.data);
      else setError(res.error);
    });
  }, []);

  return (
    <OfficePageFrame>
      {(admin) => (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">Dashboard</h2>
            <div className="flex gap-2">
              {adminCanAny(admin, ["office:cases:write"]) && (
                <Link
                  href="/office/cases/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <Plus className="w-4 h-4" /> New case
                </Link>
              )}
              <Link
                href="/office/cases"
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                <Briefcase className="w-4 h-4" /> All cases
              </Link>
            </div>
          </div>

          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          {!data ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Card label="Total cases" value={data.totalCases} icon={<Briefcase className="w-5 h-5" />} />
                <Card
                  label="Payments pending verify"
                  value={data.pendingPayments}
                  icon={<Banknote className="w-5 h-5" />}
                  href={adminCanAny(admin, ["office:payments:verify"]) ? "/office/payments" : undefined}
                  tone={data.pendingPayments > 0 ? "amber" : "slate"}
                />
                <Card
                  label="Remaining claims pending"
                  value={data.pendingRemaining}
                  icon={<ClipboardList className="w-5 h-5" />}
                  tone={data.pendingRemaining > 0 ? "amber" : "slate"}
                />
                <Card
                  label="In process"
                  value={data.statusCounts.IN_PROCESS || 0}
                  icon={<ClipboardList className="w-5 h-5" />}
                />
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
                <h3 className="mb-3 font-bold text-slate-900">Cases by status</h3>
                <div className="flex flex-wrap gap-2">
                  {CASE_STATUSES.map((status) => (
                    <Link
                      key={status}
                      href={`/office/cases?status=${status}`}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[status]}`}
                    >
                      {STATUS_LABELS[status]}: {data.statusCounts[status] || 0}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-slate-100 font-bold text-slate-900">Recent cases</div>
                <div className="divide-y divide-slate-100">
                  {data.recentCases.length === 0 && (
                    <div className="p-8 text-center">
                      <Briefcase className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                      <p className="text-sm font-medium text-slate-500">Abhi koi case nahi hai</p>
                      <p className="mt-1 text-xs text-slate-400">
                        Naya case banane ke liye oopar &quot;New case&quot; par click karein — case yahan
                        nazar aayega.
                      </p>
                    </div>
                  )}
                  {data.recentCases.map((item) => (
                    <Link
                      key={item.id}
                      href={`/office/cases/${item.id}`}
                      className="flex flex-wrap items-center justify-between gap-2 p-4 text-sm hover:bg-slate-50"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">
                          {item.caseNumber} · {item.clientName}
                        </p>
                        <p className="text-xs text-slate-500">
                          {item.bookingOffice.name}
                          {item.category ? ` · ${item.category.name}` : ""} · {formatDate(item.createdAt)}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {item.expectedPrintingDate && (
                          <span className="text-xs text-slate-500">Print: {formatDate(item.expectedPrintingDate)}</span>
                        )}
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[item.status]}`}>
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </OfficePageFrame>
  );
}

function Card({
  label,
  value,
  icon,
  href,
  tone = "slate",
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  href?: string;
  tone?: "slate" | "amber";
}) {
  const body = (
    <div
      className={`rounded-2xl border p-4 shadow-sm ${
        tone === "amber" ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <div className="flex items-center justify-between text-slate-500">
        <span className="text-xs font-semibold uppercase tracking-wide">{label}</span>
        {icon}
      </div>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}
