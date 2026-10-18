"use client";

import { useCallback, useState } from "react";
import { HandCoins, Printer, Stamp } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import { PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { EmptyState, SectionHeader, StatCard, TableSkeleton } from "./ui";
import {
  normalizeDeptEntries,
  normalizeDeptSummary,
  type DeptCommissionEntry,
  type DeptCommissionPayout,
  type DeptCommissionSummaryUser,
} from "./types";

// §W22 (F22.3) — Dept user (office:printing:write / office:attestation-dept:write,
// bina finance:read / ledger:read) ka scoped "Mera account" view: sirf APNI dept
// commission summary (Earned / Wasool / Remaining) + case-by-case entries +
// payout history. Read-only — Pay sirf admin/cashier ke Finance view se hota hai.
// Backend relaxed guard summary mein sirf own row aur entries?adminId=<self>
// allow karta hai, is liye kisi aur user ka data yahan aa hi nahi sakta.

function DeptKindChip({ kind }: { kind: DeptCommissionEntry["kind"] }) {
  const isPrinting = kind === "PRINTING";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
        isPrinting ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"
      }`}
    >
      {isPrinting ? <Printer className="h-3 w-3" /> : <Stamp className="h-3 w-3" />}
      {isPrinting ? "Printing" : "Attestation"}
    </span>
  );
}

export default function DeptMyAccount({ admin }: { admin: AdminNavUser }) {
  const selfId =
    (admin as AdminNavUser & { adminId?: string; id?: string }).adminId ||
    (admin as AdminNavUser & { id?: string }).id ||
    "";

  const [row, setRow] = useState<DeptCommissionSummaryUser | null>(null);
  const [entries, setEntries] = useState<DeptCommissionEntry[] | null>(null);
  const [payouts, setPayouts] = useState<DeptCommissionPayout[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    // 1) Summary — relaxed guard par sirf apni row aati hai.
    const summaryRes = await officeFetch("/api/office/dept-commissions/summary");
    if (!summaryRes.ok) {
      setError(summaryRes.error);
      setLoading(false);
      return;
    }
    const users = normalizeDeptSummary(summaryRes.data);
    const own = users.find((user) => user.adminId === selfId) ?? users[0] ?? null;
    setRow(own);
    if (!own) {
      setEntries([]);
      setPayouts([]);
      setError("");
      setLoading(false);
      return;
    }
    // 2) Apni case-by-case entries + payout history (adminId === self allowed).
    const entriesRes = await officeFetch(
      `/api/office/dept-commissions/entries?adminId=${encodeURIComponent(own.adminId)}`
    );
    if (entriesRes.ok) {
      const normalized = normalizeDeptEntries(entriesRes.data);
      setEntries(normalized.entries);
      setPayouts(normalized.payouts);
      setError("");
    } else {
      setError(entriesRes.error);
    }
    setLoading(false);
  }, [selfId]);

  // Mount fetch (immediate) + office:changed/polling live refresh.
  useLiveRefresh(load, { immediate: true });

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Mera account (Department commission)</h2>
        <p className="text-sm text-slate-500">
          Printing/attestation complete karne par commission yahan credit hoti hai. Payment admin ki taraf se
          hoti hai — ye view read-only hai.
        </p>
      </div>

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {loading ? (
        <div className="animate-pulse space-y-3" aria-label="Load ho raha hai">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="h-24 rounded-2xl bg-slate-100" />
            <div className="h-24 rounded-2xl bg-slate-100" />
            <div className="h-24 rounded-2xl bg-slate-100" />
          </div>
          <div className="h-40 rounded-2xl bg-slate-100" />
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Earned (commission)" value={row?.earned ?? 0} tone="emerald" />
            <StatCard label="Wasool (paid)" value={row?.paid ?? 0} tone="sky" />
            <StatCard
              label="Remaining"
              value={row?.remaining ?? 0}
              tone={(row?.remaining ?? 0) > 0 ? "amber" : "emerald"}
              hint={(row?.remaining ?? 0) > 0 ? "Admin se wasooli baqi" : "Sab clear"}
            />
          </div>

          {/* Case-by-case entries */}
          <section className="space-y-2">
            <SectionHeader
              icon={<Printer className="h-4 w-4 text-primary-600" />}
              title="Case-by-case commission entries"
              count={entries?.length}
            />
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {entries === null ? (
                <TableSkeleton rows={3} />
              ) : entries.length === 0 ? (
                <EmptyState>
                  Abhi koi commission credit nahi hui — printing/attestation complete karne par yahan show hogi
                </EmptyState>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Date</th>
                        <th className="px-3 py-2">Department</th>
                        <th className="px-3 py-2">Case</th>
                        <th className="px-3 py-2">Category</th>
                        <th className="px-3 py-2 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {entries.map((entry) => (
                        <tr key={entry.id}>
                          <td className="px-3 py-2.5 text-slate-600">{formatDate(entry.entryDate)}</td>
                          <td className="px-3 py-2.5">
                            <DeptKindChip kind={entry.kind} />
                          </td>
                          <td className="px-3 py-2.5 font-semibold text-slate-800">{entry.caseNumber}</td>
                          <td className="px-3 py-2.5 text-slate-600">{entry.caseCategory || "—"}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                            {formatMoney(entry.amount)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>

          {/* Payout history */}
          <section className="space-y-2">
            <SectionHeader
              icon={<HandCoins className="h-4 w-4 text-sky-600" />}
              title="Payout history (wasool)"
              count={payouts?.length}
            />
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {payouts === null ? (
                <TableSkeleton rows={2} />
              ) : payouts.length === 0 ? (
                <EmptyState>Abhi koi payout nahi</EmptyState>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {payouts.map((payout) => (
                    <li key={payout.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">
                          {payout.method ? PAYMENT_METHOD_LABELS[payout.method] || payout.method : "Payout"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDate(payout.entryDate)}
                          {payout.remarks ? ` · ${payout.remarks}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold text-sky-700">{formatMoney(payout.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
