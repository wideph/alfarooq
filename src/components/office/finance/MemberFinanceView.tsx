"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import { PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import AccountEquation from "./AccountEquation";
import { EmptyState, OfficeTypeChip, SectionHeader } from "./ui";
import {
  normalizeMemberDetail,
  normalizeOfficeExpenses,
  normalizeUsersPayload,
  type MemberFinanceDetail,
  type OfficeExpenseItem,
  type PayoutRequestRow,
} from "./types";

// Booking-office login — SIRF apna hisaab: Mera account equation, expense
// deductions, payout history + pending requests (Accept/Reject), office ke
// general expenses (read-only). Kisi aur member ka data kahin nahi.
export default function MemberFinanceView({ admin }: { admin: AdminNavUser }) {
  const currentAdminId = (admin as AdminNavUser & { adminId?: string }).adminId || "";

  const [detail, setDetail] = useState<MemberFinanceDetail | null>(null);
  const [requests, setRequests] = useState<PayoutRequestRow[] | null>(null);
  const [officeExpenses, setOfficeExpenses] = useState<OfficeExpenseItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const setMessage = (m: string, kind: ToastKind = "success") => setToast(m ? { message: m, kind } : null);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    // 1) Apni member row (server booking-office ko sirf usi ki rows deta hai).
    const usersRes = await officeFetch("/api/office/finance/users");
    if (!usersRes.ok) {
      if (!silent) {
        setError(usersRes.error);
        setLoading(false);
      }
      return;
    }
    const own = normalizeUsersPayload(usersRes.data).rows[0];
    if (!own) {
      if (!silent) {
        setError("Aap ka member account is office se linked nahi");
        setLoading(false);
      }
      return;
    }
    // 2) Detail (equation + earnings + expenses + payouts), 3) payout requests,
    // 4) office general expenses — sab parallel.
    const [detailRes, requestsRes, expensesRes] = await Promise.all([
      officeFetch(`/api/office/finance/users/${own.memberId}`),
      officeFetch<PayoutRequestRow[]>("/api/office/payouts"),
      officeFetch("/api/office/office-expenses"),
    ]);
    if (detailRes.ok) {
      setDetail(normalizeMemberDetail(detailRes.data));
      setError("");
    } else if (!silent) {
      setError(detailRes.error);
    }
    if (requestsRes.ok) setRequests(requestsRes.data);
    if (expensesRes.ok) setOfficeExpenses(normalizeOfficeExpenses(expensesRes.data));
    if (!silent) setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // §W20 (P2): promise return → hook in-flight dedup.
  useLiveRefresh(useCallback(() => load(true), [load]));

  async function decide(id: string, action: "accept" | "reject") {
    setBusy(id);
    const res = await officeFetch(`/api/office/payouts/${id}`, { method: "POST", json: { action } });
    setBusy(null);
    if (res.ok) {
      setMessage(
        action === "accept" ? "Payout accept ho gayi — ledger men aa gayi" : "Payout request reject kar di gayi",
        "success"
      );
      // §W20 (P2): POST ke baad office:changed event 300ms mein silent reload
      // kar deta hai — explicit load(true) duplicate fetch thi, hata di.
    } else {
      setMessage(res.error, "error");
    }
  }

  return (
    <div className="space-y-5">
      <h2 className="text-xl font-bold text-slate-900">Mera account</h2>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {loading && !detail ? (
        <div className="animate-pulse space-y-3" aria-label="Load ho raha hai">
          <div className="h-32 rounded-2xl bg-slate-100" />
          <div className="h-24 rounded-2xl bg-slate-100" />
        </div>
      ) : detail ? (
        <>
          {/* Mera account — equation */}
          <section className="space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900">{detail.member.name}</h3>
              <span className="text-xs text-slate-500">{detail.member.officeName}</span>
              <OfficeTypeChip type={detail.member.officeType} />
              {detail.member.percent > 0 && (
                <span className="text-xs font-semibold text-slate-600">{detail.member.percent}% share</span>
              )}
            </div>
            <AccountEquation summary={detail.summary} />
          </section>

          {/* Office expense deductions */}
          <section className="space-y-2">
            <SectionHeader title="Office expense deductions" count={detail.expenses.length} />
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {detail.expenses.length === 0 ? (
                <EmptyState>Koi expense deduction nahi</EmptyState>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {detail.expenses.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">{e.description || "Office expense"}</p>
                        <p className="text-xs text-slate-400">{formatDate(e.entryDate)}</p>
                      </div>
                      <span className="shrink-0 font-semibold text-red-600">− {formatMoney(e.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Payout requests — PENDING par Accept / Reject (sirf apni linked rows) */}
          {requests && requests.length > 0 && (
            <section className="space-y-2">
              <SectionHeader title="Payout requests" count={requests.length} />
              <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white shadow-sm">
                {requests.map((r) => {
                  const canDecide =
                    r.status === "PENDING" && r.member?.adminId !== null && r.member?.adminId === currentAdminId;
                  return (
                    <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-800">{r.member?.name || "—"}</p>
                        <p className="text-xs text-slate-400">
                          {formatDate(r.entryDate)}
                          {r.method ? ` · ${PAYMENT_METHOD_LABELS[r.method] || r.method}` : ""}
                          {r.remarks ? ` · ${r.remarks}` : ""}
                        </p>
                      </div>
                      <span className="font-bold text-slate-900">{formatMoney(r.amount)}</span>
                      {r.status === "PENDING" ? (
                        canDecide ? (
                          <span className="flex items-center gap-1.5">
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => void decide(r.id, "accept")}
                              className="min-h-[32px] rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              {busy === r.id ? <Loader2 className="h-3 w-3 animate-spin" /> : "Accept"}
                            </button>
                            <button
                              type="button"
                              disabled={busy === r.id}
                              onClick={() => void decide(r.id, "reject")}
                              className="min-h-[32px] rounded-lg bg-red-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-700 disabled:opacity-50"
                            >
                              Reject
                            </button>
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                            Pending
                          </span>
                        )
                      ) : (
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                            r.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"
                          }`}
                        >
                          {r.status === "ACCEPTED" ? "Accepted" : "Rejected"}
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}

          {/* Payout history */}
          <section className="space-y-2">
            <SectionHeader title="Payout history (wasool)" count={detail.payouts.length} />
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              {detail.payouts.length === 0 ? (
                <EmptyState>Abhi koi payout nahi</EmptyState>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {detail.payouts.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-800">
                          {p.method ? PAYMENT_METHOD_LABELS[p.method] || p.method : "Payout"}
                        </p>
                        <p className="text-xs text-slate-400">
                          {formatDate(p.date)}
                          {p.remarks ? ` · ${p.remarks}` : ""}
                        </p>
                      </div>
                      <span className="shrink-0 font-semibold text-sky-700">{formatMoney(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </>
      ) : null}

      {/* Office general expenses — read-only */}
      <section className="space-y-2">
        <SectionHeader
          icon={<Wallet className="h-4 w-4 text-red-500" />}
          title="Office general expenses"
          count={officeExpenses?.length}
        />
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!officeExpenses ? (
            <EmptyState>Load ho raha hai…</EmptyState>
          ) : officeExpenses.length === 0 ? (
            <EmptyState>Koi office expense nahi</EmptyState>
          ) : (
            <ul className="divide-y divide-slate-100">
              {officeExpenses.map((e) => (
                <li key={e.id} className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-800">{e.description || "Office expense"}</p>
                    <p className="text-xs text-slate-400">{formatDate(e.entryDate)}</p>
                  </div>
                  <span className="shrink-0 font-semibold text-red-600">{formatMoney(e.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}
