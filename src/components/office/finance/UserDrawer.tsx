"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import { PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import AccountEquation from "./AccountEquation";
import { OfficeTypeChip } from "./ui";
import {
  EARNING_TYPE_LABELS,
  normalizeMemberDetail,
  type FinanceUserRow,
  type MemberFinanceDetail,
} from "./types";

// Slide-over: selected member ka poora hisaab — summary equation, earning
// breakdown, office expense deductions, payout history (contract 2).
export default function UserDrawer({ member, onClose }: { member: FinanceUserRow; onClose: () => void }) {
  const [detail, setDetail] = useState<MemberFinanceDetail | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setError("");
    officeFetch(`/api/office/finance/users/${member.memberId}`).then((res) => {
      if (cancelled) return;
      if (res.ok) setDetail(normalizeMemberDetail(res.data));
      else setError(res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [member.memberId]);

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
            <p className="truncate text-base font-bold text-slate-900">{member.memberName}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
              {member.officeName}
              <OfficeTypeChip type={member.officeType} />
              {member.percent > 0 && <span className="font-semibold text-slate-600">{member.percent}%</span>}
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

          {!detail && !error ? (
            <div className="animate-pulse space-y-3" aria-label="Detail load ho raha hai">
              <div className="h-28 rounded-2xl bg-slate-100" />
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : detail ? (
            <>
              <AccountEquation summary={detail.summary} />

              {/* Earning breakdown */}
              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Earning breakdown</p>
                {detail.earnings.length === 0 ? (
                  <p className="rounded-xl border border-slate-100 px-3 py-3 text-sm text-slate-400">
                    Abhi koi earning entry nahi
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {detail.earnings.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800">{EARNING_TYPE_LABELS[e.type] || e.type}</p>
                          <p className="text-xs text-slate-500">
                            {formatDate(e.date)}
                            {e.caseNumber && e.caseId && (
                              <>
                                {" · "}
                                <Link href={`/office/cases/${e.caseId}`} className="text-primary-700 hover:underline">
                                  {e.caseNumber}
                                </Link>
                              </>
                            )}
                            {e.remarks ? ` · ${e.remarks}` : ""}
                          </p>
                        </div>
                        <span
                          className={`shrink-0 font-semibold ${
                            e.direction === "DEBIT" ? "text-red-600" : "text-emerald-700"
                          }`}
                        >
                          {e.direction === "DEBIT" ? "− " : ""}
                          {formatMoney(e.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Office expense deductions */}
              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">
                  Office expense deductions
                </p>
                {detail.expenses.length === 0 ? (
                  <p className="rounded-xl border border-slate-100 px-3 py-3 text-sm text-slate-400">
                    Koi expense deduction nahi
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {detail.expenses.map((e) => (
                      <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800">{e.description || "Office expense"}</p>
                          <p className="text-xs text-slate-500">{formatDate(e.entryDate)}</p>
                        </div>
                        <span className="shrink-0 font-semibold text-red-600">− {formatMoney(e.amount)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Payout history */}
              <section>
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-500">Payout history (wasool)</p>
                {detail.payouts.length === 0 ? (
                  <p className="rounded-xl border border-slate-100 px-3 py-3 text-sm text-slate-400">
                    Abhi koi payout nahi
                  </p>
                ) : (
                  <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
                    {detail.payouts.map((p) => (
                      <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                        <div className="min-w-0">
                          <p className="font-semibold text-slate-800">
                            {p.method ? PAYMENT_METHOD_LABELS[p.method] || p.method : "Payout"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDate(p.date)}
                            {p.remarks ? ` · ${p.remarks}` : ""}
                          </p>
                        </div>
                        <span className="shrink-0 font-semibold text-sky-700">{formatMoney(p.amount)}</span>
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
