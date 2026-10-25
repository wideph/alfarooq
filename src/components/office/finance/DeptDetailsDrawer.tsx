"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import { PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { caseDetailHref } from "@/lib/office/case-nav";
import { ROLE_LABELS } from "@/lib/office/permissions";
import { dueToneClass } from "./ui";
import {
  normalizeDeptEntries,
  type DeptCommissionEntry,
  type DeptCommissionPayout,
  type DeptCommissionSummaryUser,
} from "./types";

const KIND_CHIP: Record<DeptCommissionEntry["kind"], string> = {
  PRINTING: "bg-sky-100 text-sky-700",
  ATTESTATION: "bg-amber-100 text-amber-700",
  COURIER: "bg-teal-100 text-teal-700",
};

const KIND_LABEL: Record<DeptCommissionEntry["kind"], string> = {
  PRINTING: "Printing",
  ATTESTATION: "Attestation",
  COURIER: "Courier",
};

// §W21 — Dept commission details drawer: case-by-case entries + payout
// history, oopar summary equation (Earned − Paid = Remaining).
export default function DeptDetailsDrawer({
  user,
  onClose,
}: {
  user: DeptCommissionSummaryUser;
  onClose: () => void;
}) {
  // §W34: case link par yehi page "from" — detail se wapsi + navbar tab yahin.
  const pathname = usePathname();
  const [data, setData] = useState<{ entries: DeptCommissionEntry[]; payouts: DeptCommissionPayout[] } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setData(null);
    setError("");
    officeFetch(`/api/office/dept-commissions/entries?adminId=${encodeURIComponent(user.adminId)}`).then((res) => {
      if (cancelled) return;
      if (res.ok) setData(normalizeDeptEntries(res.data));
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [user.adminId]);

  return (
    <div className="fixed inset-0 z-[60]">
      <button
        type="button"
        aria-label="Band karein"
        className="absolute inset-0 cursor-default bg-slate-900/40"
        onClick={onClose}
      />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white shadow-xl">
        <div className="flex items-start justify-between gap-2 border-b border-slate-100 p-4">
          <div className="min-w-0">
            <p className="truncate text-base font-bold text-slate-900">{user.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                {ROLE_LABELS[user.role] || user.role}
              </span>{" "}
              Department commission ka case-by-case hisaab
            </p>
          </div>
          <button
            type="button"
            aria-label="Band karein"
            onClick={onClose}
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-4">
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          {/* Summary equation: Earned − Paid = Remaining */}
          <div className="space-y-1.5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Earned (commission bani)</span>
              <span className="font-semibold text-emerald-700">{formatMoney(user.earned)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">Paid (wasool)</span>
              <span className="font-semibold text-sky-700">− {formatMoney(user.paid)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-slate-200 pt-2.5">
              <span className="text-sm font-bold text-slate-900">= Remaining (abhi dena hai)</span>
              <span className={`text-lg font-bold ${dueToneClass(user.remaining)}`}>
                {formatMoney(user.remaining)}
              </span>
            </div>
          </div>

          {!data && !error ? (
            <div className="animate-pulse space-y-3" aria-label="Detail load ho raha hai">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : data ? (
            <>
              {/* Case-by-case entries */}
              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Case-by-case entries
                </p>
                {data.entries.length === 0 ? (
                  <p className="rounded-xl border border-slate-100 px-3 py-3 text-sm text-slate-400">
                    Abhi koi commission entry nahi
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {data.entries.map((entry) => (
                      <li key={entry.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-800">
                            <span
                              className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${KIND_CHIP[entry.kind]}`}
                            >
                              {KIND_LABEL[entry.kind]}
                            </span>
                            {entry.caseId ? (
                              <Link
                                href={caseDetailHref(entry.caseId, pathname)}
                                className="text-primary-700 hover:underline"
                              >
                                {entry.caseNumber}
                              </Link>
                            ) : (
                              entry.caseNumber
                            )}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDate(entry.entryDate)}
                            {entry.caseCategory ? ` · ${entry.caseCategory}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold text-emerald-700">
                          {formatMoney(entry.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Payout history */}
              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Payout history (wasool)
                </p>
                {data.payouts.length === 0 ? (
                  <p className="rounded-xl border border-slate-100 px-3 py-3 text-sm text-slate-400">
                    Abhi koi payout nahi
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {data.payouts.map((payout) => (
                      <li key={payout.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800">
                            {payout.method ? PAYMENT_METHOD_LABELS[payout.method] || payout.method : "Payout"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDate(payout.entryDate)}
                            {payout.remarks ? ` · ${payout.remarks}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold text-sky-700">{formatMoney(payout.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
