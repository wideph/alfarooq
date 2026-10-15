"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Wallet } from "lucide-react";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import { PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { EmptyState, SectionHeader, TableSkeleton } from "./ui";
import type { PaymentsResponse } from "./types";

// Payments received — current functionality as-is (paginated RECEIVED list
// with case / client / method / office / submitted-by). Self-refreshing.
export default function PaymentsReceived() {
  const [payments, setPayments] = useState<PaymentsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);

  const load = useCallback(async (pageNo: number, silent = false) => {
    if (!silent) setLoading(true);
    const res = await officeFetch<PaymentsResponse>(`/api/office/payments?status=RECEIVED&page=${pageNo}`);
    if (res.ok) setPayments(res.data);
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    void load(page);
  }, [page, load]);

  // §W20 (P2): promise return → hook in-flight dedup.
  useLiveRefresh(useCallback(() => load(page, true), [load, page]));

  const totalPages = payments ? Math.max(1, Math.ceil(payments.total / payments.pageSize)) : 1;

  return (
    <section className="space-y-2">
      <SectionHeader
        icon={<Wallet className="h-4 w-4 text-emerald-600" />}
        title="Payments received"
        count={payments?.total}
        action={
          payments && payments.total > payments.pageSize ? (
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Pichla page"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs text-slate-500">
                {payments.page} / {totalPages}
              </span>
              <button
                type="button"
                aria-label="Agla page"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="grid h-8 w-8 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          ) : undefined
        }
      />

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {loading && !payments ? (
          <TableSkeleton rows={5} />
        ) : !payments || payments.items.length === 0 ? (
          <EmptyState>Koi received payment nahi</EmptyState>
        ) : (
          <>
            {/* Mobile cards */}
            <ul className="divide-y divide-slate-100 md:hidden">
              {payments.items.map((p) => (
                <li key={p.id} className="space-y-1 p-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-emerald-700">{formatMoney(p.amount)}</span>
                    <span className="text-xs text-slate-500">
                      {PAYMENT_METHOD_LABELS[p.method] || p.method} · {formatDate(p.paymentDate)}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-600">
                    <Link href={`/office/cases/${p.case.id}`} className="font-semibold text-primary-700 hover:underline">
                      {p.case.caseNumber}
                    </Link>
                    <span>· {p.case.clientName}</span>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    {p.case.bookingOffice?.name || "—"}
                    {p.submittedByName ? ` · submit: ${p.submittedByName}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            {/* Desktop table */}
            <table className="hidden min-w-full text-sm md:table">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2">Method</th>
                  <th className="px-3 py-2">Case</th>
                  <th className="px-3 py-2">Client</th>
                  <th className="px-3 py-2">Office</th>
                  <th className="px-3 py-2">Submitted by</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {payments.items.map((p) => (
                  <tr key={p.id}>
                    <td className="whitespace-nowrap px-3 py-2">{formatDate(p.paymentDate)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-emerald-700">
                      {formatMoney(p.amount)}
                    </td>
                    <td className="px-3 py-2">{PAYMENT_METHOD_LABELS[p.method] || p.method}</td>
                    <td className="px-3 py-2">
                      <Link href={`/office/cases/${p.case.id}`} className="font-semibold text-primary-700 hover:underline">
                        {p.case.caseNumber}
                      </Link>
                    </td>
                    <td className="px-3 py-2">{p.case.clientName}</td>
                    <td className="px-3 py-2">{p.case.bookingOffice?.name || "—"}</td>
                    <td className="px-3 py-2 text-slate-500">{p.submittedByName || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </section>
  );
}
