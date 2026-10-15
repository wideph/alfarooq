"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import { LEDGER_TYPE_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { EmptyState, OfficeTypeChip, StatCard, TableSkeleton, dueToneClass, inputCls } from "./ui";
import {
  normalizeUsersPayload,
  type FinanceUserRow,
  type LedgerResponse,
} from "./types";

// /office/finance/[officeId] — ADMIN-only ledger detail. Upar member summary
// strip (wahi 4 numbers: Earning / Expense share / Wasool / Due), neeche
// office ka ledger entries table (member + date filters, pagination).
export default function OfficeLedgerDetail({ officeId }: { officeId: string }) {
  const [members, setMembers] = useState<FinanceUserRow[] | null>(null);
  const [ledger, setLedger] = useState<LedgerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [page, setPage] = useState(1);

  const loadMembers = useCallback(async () => {
    const res = await officeFetch("/api/office/finance/users");
    if (res.ok) {
      setMembers(normalizeUsersPayload(res.data).rows.filter((row) => row.officeId === officeId));
    }
  }, [officeId]);

  const loadLedger = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      const params = new URLSearchParams({ officeId, page: String(page) });
      if (memberFilter) params.set("memberId", memberFilter);
      if (from) params.set("from", from);
      if (to) params.set("to", to);
      const res = await officeFetch<LedgerResponse>(`/api/office/ledger?${params.toString()}`);
      if (res.ok) {
        setLedger(res.data);
        setError("");
      } else if (!silent) {
        setError(res.error);
      }
      if (!silent) setLoading(false);
    },
    [officeId, page, memberFilter, from, to]
  );

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    void loadLedger();
  }, [loadLedger]);

  useLiveRefresh(
    useCallback(() => {
      void loadMembers();
      void loadLedger(true);
    }, [loadMembers, loadLedger])
  );

  const officeName = members?.[0]?.officeName || ledger?.items[0]?.bookingOffice.name || "Office";
  const officeType = members?.[0]?.officeType || null;
  const totalPages = ledger ? Math.max(1, Math.ceil(ledger.total / (ledger.pageSize || 100))) : 1;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Link
          href="/office/finance"
          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Finance
        </Link>
        <h2 className="text-xl font-bold text-slate-900">{officeName} — ledger</h2>
        {officeType && <OfficeTypeChip type={officeType} />}
      </div>

      {/* Member summary strip — same 4 numbers as the users table */}
      {members && members.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900">Members summary</h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {members.map((m) => (
              <div key={m.memberId} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="flex items-center gap-2 text-sm font-bold text-slate-900">
                  {m.memberName}
                  {m.officeType === "PROFIT_SHARE" && m.percent > 0 && (
                    <span className="text-xs font-semibold text-slate-500">{m.percent}%</span>
                  )}
                  {m.officeType === "SALARY" && <OfficeTypeChip type="SALARY" short />}
                </p>
                <dl className="mt-2 space-y-1 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-500">Earning</dt>
                    <dd className="font-semibold text-emerald-700">{formatMoney(m.earning)}</dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-500">Expense share</dt>
                    <dd className="font-semibold text-red-600">
                      {m.expenseShare > 0 ? `− ${formatMoney(m.expenseShare)}` : "—"}
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-slate-500">Wasool</dt>
                    <dd className="font-semibold text-sky-700">{formatMoney(m.wasool)}</dd>
                  </div>
                  <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1.5">
                    <dt className="font-bold text-slate-800">Due</dt>
                    <dd className={`font-bold ${dueToneClass(m.due)}`}>{formatMoney(m.due)}</dd>
                  </div>
                </dl>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Office balance (all-time) */}
      {ledger && (
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <StatCard
            label="Office balance"
            value={ledger.officeBalances[officeId] || 0}
            tone={(ledger.officeBalances[officeId] || 0) >= 0 ? "amber" : "red"}
            hint={(ledger.officeBalances[officeId] || 0) >= 0 ? "Company owes office" : "Office ne advance liya"}
          />
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {members && members.length > 0 && (
          <select
            className={inputCls}
            value={memberFilter}
            onChange={(e) => {
              setMemberFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tamam members</option>
            {members.map((m) => (
              <option key={m.memberId} value={m.memberId}>
                {m.memberName}
              </option>
            ))}
          </select>
        )}
        <input
          type="date"
          className={inputCls}
          value={from}
          onChange={(e) => {
            setFrom(e.target.value);
            setPage(1);
          }}
        />
        <span className="text-slate-400">to</span>
        <input
          type="date"
          className={inputCls}
          value={to}
          onChange={(e) => {
            setTo(e.target.value);
            setPage(1);
          }}
        />
        {(memberFilter || from || to) && (
          <button
            type="button"
            onClick={() => {
              setMemberFilter("");
              setFrom("");
              setTo("");
              setPage(1);
            }}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-600"
          >
            Clear
          </button>
        )}
        {ledger && ledger.total > (ledger.pageSize || 100) && (
          <div className="ml-auto flex items-center gap-1">
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
              {page} / {totalPages}
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
        )}
      </div>

      {/* Entries table */}
      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        {error && <p className="m-3 rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}
        {loading && !ledger ? (
          <TableSkeleton rows={6} />
        ) : !ledger || ledger.items.length === 0 ? (
          <EmptyState>Abhi koi entry nahi</EmptyState>
        ) : (
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-3 py-2">Date</th>
                <th className="px-3 py-2">Member</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Case</th>
                <th className="px-3 py-2 text-right">Credit</th>
                <th className="px-3 py-2 text-right">Debit</th>
                <th className="px-3 py-2">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {ledger.items.map((e) => (
                <tr key={e.id}>
                  <td className="whitespace-nowrap px-3 py-2">{formatDate(e.entryDate)}</td>
                  <td className="px-3 py-2">{e.member?.name || <span className="text-slate-400">Office</span>}</td>
                  <td className="px-3 py-2">
                    {LEDGER_TYPE_LABELS[e.type] || e.type}
                    {e.method && (
                      <span className="text-xs text-slate-400"> ({PAYMENT_METHOD_LABELS[e.method] || e.method})</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    {e.case ? (
                      <Link href={`/office/cases/${e.case.id}`} className="text-primary-700 hover:underline">
                        {e.case.caseNumber}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-3 py-2 text-right text-emerald-700">
                    {e.direction === "CREDIT" ? formatMoney(e.amount) : ""}
                  </td>
                  <td className="px-3 py-2 text-right text-red-700">
                    {e.direction === "DEBIT" ? formatMoney(e.amount) : ""}
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-500">{e.remarks || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
