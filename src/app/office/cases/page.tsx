"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Plus, Search } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import { adminCanAny } from "@/components/admin/AdminNav";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import { ATTESTATION_STATUS_STYLES, STATUS_LABELS, STATUS_STYLES } from "@/lib/office/labels";
import { CASE_STATUSES } from "@/lib/office/permissions";

type CaseRow = {
  id: string;
  caseNumber: string;
  clientName: string;
  rollNumber: string | null;
  registrationNumber: string | null;
  status: string;
  isPrinted: boolean;
  expectedPrintingDate: string | null;
  createdAt: string;
  bookingOffice: { id: string; name: string; type: string };
  category: { id: string; name: string } | null;
  attestations: Array<{ id: string; status: string; completedDate: string | null; attestationType: { name: string } }>;
  totals: { received: number; remaining: number; extra: number; pendingCount: number; agreedAmount: number };
};

type Office = { id: string; name: string };

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

function CasesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<CaseRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const status = searchParams.get("status") || "";
  const officeId = searchParams.get("officeId") || "";
  const page = Number(searchParams.get("page")) || 1;

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    if (officeId) params.set("officeId", officeId);
    if (searchParams.get("q")) params.set("q", searchParams.get("q") || "");
    params.set("page", String(page));
    const res = await officeFetch<{ items: CaseRow[]; total: number }>(`/api/office/cases?${params}`);
    if (res.ok) {
      setItems(res.data.items);
      setTotal(res.data.total);
    }
    setLoading(false);
  }, [status, officeId, page, searchParams]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    officeFetch<Office[]>("/api/office/setup/booking-offices").then((res) => {
      if (res.ok) setOffices(res.data);
    });
  }, []);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/office/cases?${params}`);
  }

  return (
    <OfficePageFrame>
      {(admin) => (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">
              Cases <span className="text-sm font-normal text-slate-400">({total})</span>
            </h2>
            {adminCanAny(admin, ["office:cases:write"]) && (
              <Link
                href="/office/cases/new"
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Plus className="w-4 h-4" /> New case
              </Link>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            <form
              className="flex flex-1 min-w-[14rem] gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setParam("q", q.trim());
              }}
            >
              <input
                className={`${input} flex-1`}
                placeholder="Case #, name, roll / reg no, phone"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="rounded-xl border border-slate-200 bg-white px-3 text-slate-600">
                <Search className="w-4 h-4" />
              </button>
            </form>
            <select className={input} value={status} onChange={(e) => setParam("status", e.target.value)}>
              <option value="">All statuses</option>
              <option value="open">Open only</option>
              {CASE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            {admin.role !== "booking_office" && (
              <select className={input} value={officeId} onChange={(e) => setParam("officeId", e.target.value)}>
                <option value="">All offices</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Case</th>
                    <th className="px-3 py-2">Office / Category</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Money</th>
                    <th className="px-3 py-2">Print</th>
                    <th className="px-3 py-2">Attestations</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-slate-400">
                        Koi case nahi mila
                      </td>
                    </tr>
                  )}
                  {items.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-3 py-3 align-top">
                        <Link href={`/office/cases/${item.id}`} className="font-semibold text-primary-700 hover:underline">
                          {item.caseNumber}
                        </Link>
                        <p className="text-slate-800">{item.clientName}</p>
                        <p className="text-xs text-slate-400">
                          {item.rollNumber ? `Roll ${item.rollNumber}` : ""}
                          {item.rollNumber && item.registrationNumber ? " · " : ""}
                          {item.registrationNumber ? `Reg ${item.registrationNumber}` : ""}
                        </p>
                        <p className="text-xs text-slate-400">{formatDate(item.createdAt)}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <p className="text-slate-800">{item.bookingOffice.name}</p>
                        <p className="text-xs text-slate-500">{item.category?.name || "—"}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[item.status]}`}>
                          {STATUS_LABELS[item.status] || item.status}
                        </span>
                        {item.totals.pendingCount > 0 && (
                          <p className="mt-1 text-[11px] text-amber-600">{item.totals.pendingCount} payment verify pending</p>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top text-xs">
                        <p>Agreed: {formatMoney(item.totals.agreedAmount)}</p>
                        <p className="text-emerald-700">Received: {formatMoney(item.totals.received)}</p>
                        {item.totals.remaining > 0 && <p className="text-amber-700">Remaining: {formatMoney(item.totals.remaining)}</p>}
                        {item.totals.extra > 0 && <p className="text-violet-700">Extra: {formatMoney(item.totals.extra)}</p>}
                      </td>
                      <td className="px-3 py-3 align-top text-xs">
                        <p className={item.isPrinted ? "font-semibold text-emerald-700" : "text-slate-500"}>
                          {item.isPrinted ? "Printed" : "Not printed"}
                        </p>
                        <p className="text-slate-500">Expected: {formatDate(item.expectedPrintingDate)}</p>
                      </td>
                      <td className="px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          {item.attestations.length === 0 && <span className="text-xs text-slate-400">—</span>}
                          {item.attestations.map((a) => (
                            <span
                              key={a.id}
                              title={a.completedDate ? `Done ${formatDate(a.completedDate)}` : a.status}
                              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ATTESTATION_STATUS_STYLES[a.status]}`}
                            >
                              {a.attestationType.name}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {total > 50 && (
            <div className="flex justify-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setParam("page", String(page - 1))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 py-2 text-sm text-slate-500">Page {page}</span>
              <button
                disabled={page * 50 >= total}
                onClick={() => setParam("page", String(page + 1))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
    </OfficePageFrame>
  );
}

export default function OfficeCasesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      }
    >
      <CasesList />
    </Suspense>
  );
}
