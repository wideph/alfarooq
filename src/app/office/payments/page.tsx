"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, FileSearch, Loader2, Save } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";
import ExtraAmountPopup from "@/components/office/ExtraAmountPopup";
import { adminCanAny } from "@/components/admin/AdminNav";
import { formatDate, formatMoney, officeFetch, toInputDate } from "@/lib/office/client";
import { PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS, PAYMENT_STATUS_STYLES } from "@/lib/office/labels";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { caseDetailHref } from "@/lib/office/case-nav";

type PaymentRow = {
  id: string;
  amount: number;
  paymentDate: string;
  method: string;
  reference: string | null;
  status: string;
  remarks: string | null;
  hasSlip: boolean;
  createdAt: string;
  case: {
    id: string;
    caseNumber: string;
    clientName: string;
    rollNumber: string | null;
    registrationNumber: string | null;
    agreedAmount: number;
    bookingOffice: { id: string; name: string; type: string };
  };
  // §W29: is payment se pehle / baad ka baqi (server BR1.4 formula se).
  balance?: { receivedBefore: number; remainingBefore: number; remainingAfter: number; extraAfter: number };
};

function PaymentsSkeleton() {
  return (
    <div className="space-y-3 animate-pulse" aria-label="Payments load ho rahi hain">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-2">
              <div className="h-4 w-48 rounded bg-slate-200" />
              <div className="h-3 w-36 rounded bg-slate-100" />
              <div className="h-4 w-56 rounded bg-slate-200" />
            </div>
            <div className="h-5 w-20 rounded-full bg-slate-200" />
          </div>
          <div className="mt-3 flex gap-2 border-t border-slate-100 pt-3">
            <div className="h-10 w-24 rounded-xl bg-slate-200" />
            <div className="h-10 w-24 rounded-xl bg-slate-100" />
            <div className="h-10 w-20 rounded-xl bg-slate-100" />
          </div>
        </div>
      ))}
    </div>
  );
}

type VerifyResult = { needsExtraDecision: number | null; received: number; remaining: number; extra: number };

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

export default function OfficePaymentsPage() {
  const [tab, setTab] = useState<"PENDING" | "ALL">("PENDING");
  const [items, setItems] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<ToastData | null>(null);
  const setMessage = (m: string, kind: ToastKind = "success") =>
    setToast(m ? { message: m, kind } : null);
  const [edits, setEdits] = useState<Record<string, { paymentDate: string; amount: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [popup, setPopup] = useState<{ caseId: string; caseNumber: string; extra: number } | null>(null);

  // §W44: tab URL mein (?tab=all) — case detail se "back" par wapsi usi tab
  // par (case link ka from yahi jagah). Static page hai, is liye
  // useSearchParams ki bajaye window.location (Suspense ki zaroorat nahi).
  const [tabReady, setTabReady] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("tab") === "all") setTab("ALL");
    setTabReady(true);
  }, []);
  useEffect(() => {
    if (!tabReady) return;
    const url = tab === "ALL" ? "/office/payments?tab=all" : "/office/payments";
    if (window.location.pathname + window.location.search !== url) window.history.replaceState(null, "", url);
  }, [tab, tabReady]);
  const fromHere = tab === "ALL" ? "/office/payments?tab=all" : "/office/payments";

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    const res = await officeFetch<{ items: PaymentRow[] }>(
      `/api/office/payments${tab === "PENDING" ? "?status=PENDING" : ""}`
    );
    if (res.ok) setItems(res.data.items);
    if (!silent) setLoading(false);
  }, [tab]);

  useEffect(() => {
    if (tabReady) void load();
  }, [load, tabReady]);

  // §W11.5: payments list live (silent background refresh, spinner flash nahi).
  // §W20 (P2): promise return → hook in-flight dedup kar sakta hai.
  useLiveRefresh(useCallback(() => load(true), [load]));

  async function patch(payment: PaymentRow, body: Record<string, unknown>) {
    setBusy(payment.id);
    const res = await officeFetch<VerifyResult>(`/api/office/payments/${payment.id}`, { method: "PATCH", json: body });
    if (res.ok) {
      setMessage(`${payment.case.caseNumber}: payment update ho gayi`);
      setEdits((prev) => {
        const next = { ...prev };
        delete next[payment.id];
        return next;
      });
      if (res.data.needsExtraDecision) {
        setPopup({ caseId: payment.case.id, caseNumber: payment.case.caseNumber, extra: res.data.needsExtraDecision });
      }
      // §W20 (P2): PATCH ke baad office:changed event 300ms mein silent reload
      // kar deta hai — yahan full load() (spinner flash + doosri fetch) ki
      // zaroorat nahi.
    } else {
      setMessage(res.error, "error");
    }
    setBusy(null);
  }

  async function decideExtra(percent: number) {
    if (!popup) return;
    const res = await officeFetch(`/api/office/cases/${popup.caseId}/commission`, {
      method: "PATCH",
      json: { extraSharePercent: percent },
    });
    setMessage(res.ok ? `${popup.caseNumber}: extra share ${percent}% set ho gaya` : res.error, res.ok ? "success" : "error");
    setPopup(null);
  }

  return (
    <OfficePageFrame requiredAny={["office:payments:verify", "office:payments:submit"]}>
      {(admin) => {
        const canVerify = adminCanAny(admin, ["office:payments:verify"]);
        return (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-slate-900">Payments</h2>
              <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                {(["PENDING", "ALL"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={`rounded-lg px-3 py-2 min-h-[40px] text-sm font-semibold ${tab === t ? "bg-white shadow text-slate-900" : "text-slate-500"}`}
                  >
                    {t === "PENDING" ? "Verify pending" : "All"}
                  </button>
                ))}
              </div>
            </div>

            <Toast toast={toast} onClose={() => setToast(null)} />

            <div className="space-y-3">
              {loading ? (
                <PaymentsSkeleton />
              ) : items.length === 0 ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm text-slate-400">
                  {tab === "PENDING" ? "Koi payment verify ke liye pending nahi" : "Koi payment nahi"}
                </div>
              ) : (
                items.map((p) => {
                  const edit = edits[p.id];
                  return (
                    <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1.5">
                          <div>
                            <Link href={caseDetailHref(p.case.id, fromHere)} className="font-semibold text-primary-700 hover:underline">
                              {p.case.caseNumber}
                            </Link>
                            <span className="ml-2 text-xs text-slate-500">{p.case.bookingOffice.name}</span>
                          </div>
                          {/* §W29: student ki pehchan — naam + Roll / Reg */}
                          <div>
                            <p className="text-base font-bold text-slate-900">{p.case.clientName || "—"}</p>
                            <p className="text-xs text-slate-600">
                              Roll No: <span className="font-semibold text-slate-800">{p.case.rollNumber || "—"}</span>
                              <span className="mx-1.5 text-slate-300">|</span>
                              Reg No: <span className="font-semibold text-slate-800">{p.case.registrationNumber || "—"}</span>
                            </p>
                          </div>
                          {/* §W29: agreed amount + is payment se pehle ka baqi */}
                          <div className="flex flex-wrap gap-1.5 text-xs">
                            <span className="rounded-lg bg-slate-100 px-2 py-1 text-slate-700">
                              Agreed: <span className="font-bold text-slate-900">{formatMoney(p.case.agreedAmount)}</span>
                            </span>
                            {p.balance && (
                              <span className="rounded-lg bg-amber-50 px-2 py-1 text-amber-800 ring-1 ring-amber-200">
                                Is payment se pehle baqi:{" "}
                                <span className="font-bold">{formatMoney(p.balance.remainingBefore)}</span>
                              </span>
                            )}
                          </div>
                          <p className="text-sm">
                            <span className="font-bold text-slate-900">{formatMoney(p.amount)}</span>
                            <span className="text-slate-500"> · {formatDate(p.paymentDate)} · {PAYMENT_METHOD_LABELS[p.method] || p.method}</span>
                            {p.reference && <span className="text-slate-500"> · Ref {p.reference}</span>}
                          </p>
                          {/* NOT_RECEIVED / BOGUS ginti nahi hoti — un par "baad" ka hint nahi */}
                          {p.balance && (p.status === "PENDING" || p.status === "RECEIVED") && (
                            <p className="text-[11px] text-slate-500">
                              {p.balance.extraAfter > 0
                                ? `Is payment se ${formatMoney(p.balance.extraAfter)} extra ho jayenge`
                                : `Is payment ke baad baqi: ${formatMoney(p.balance.remainingAfter)}`}
                            </p>
                          )}
                          {p.remarks && <p className="text-xs text-slate-500">{p.remarks}</p>}
                        </div>
                        <div className="flex flex-col items-end gap-2">
                          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${PAYMENT_STATUS_STYLES[p.status]}`}>
                            {PAYMENT_STATUS_LABELS[p.status] || p.status}
                          </span>
                          {p.hasSlip ? (
                            <a
                              href={`/api/office/payments/${p.id}/slip`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                            >
                              <ExternalLink className="w-3.5 h-3.5" /> Slip dekhein
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">No slip</span>
                          )}
                          {/* §W44: case ka poora detail — wapsi isi list / tab par. */}
                          <Link
                            href={caseDetailHref(p.case.id, fromHere)}
                            className="inline-flex items-center gap-1 rounded-lg border border-primary-200 bg-primary-50 px-2.5 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-100"
                          >
                            <FileSearch className="w-3.5 h-3.5" /> Case detail
                          </Link>
                        </div>
                      </div>

                      {canVerify && (
                        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                          <button
                            disabled={busy === p.id || p.status === "RECEIVED"}
                            onClick={() => patch(p, { status: "RECEIVED" })}
                            className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                          >
                            <Check className="w-3.5 h-3.5" /> Received
                          </button>
                          <button
                            disabled={busy === p.id || p.status === "NOT_RECEIVED"}
                            onClick={() => patch(p, { status: "NOT_RECEIVED" })}
                            className="inline-flex min-h-[40px] items-center rounded-xl border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 disabled:opacity-40"
                          >
                            Not received
                          </button>
                          <button
                            disabled={busy === p.id || p.status === "BOGUS"}
                            onClick={() => {
                              if (confirm("Is payment ko bogus mark karein?")) patch(p, { status: "BOGUS" });
                            }}
                            className="inline-flex min-h-[40px] items-center rounded-xl border border-red-200 px-3 py-2 text-xs font-semibold text-red-600 disabled:opacity-40"
                          >
                            Bogus
                          </button>
                          <span className="mx-1 text-slate-300">|</span>
                          <input
                            type="date"
                            className={input}
                            value={edit ? edit.paymentDate : toInputDate(p.paymentDate)}
                            onChange={(e) =>
                              setEdits({ ...edits, [p.id]: { paymentDate: e.target.value, amount: edit ? edit.amount : String(p.amount) } })
                            }
                          />
                          <input
                            inputMode="decimal"
                            className={`${input} w-28`}
                            value={edit ? edit.amount : String(p.amount)}
                            onChange={(e) =>
                              setEdits({ ...edits, [p.id]: { paymentDate: edit ? edit.paymentDate : toInputDate(p.paymentDate), amount: e.target.value } })
                            }
                          />
                          {edit && (
                            <button
                              disabled={busy === p.id}
                              onClick={() => patch(p, { paymentDate: edit.paymentDate, amount: edit.amount })}
                              className="inline-flex min-h-[40px] items-center gap-1 rounded-xl bg-primary-600 px-3 py-2 text-xs font-semibold text-white"
                            >
                              <Save className="w-3.5 h-3.5" /> Save date/amount
                            </button>
                          )}
                          {busy === p.id && <Loader2 className="w-4 h-4 animate-spin text-slate-400" />}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {popup && (
              <ExtraAmountPopup
                caseNumber={popup.caseNumber}
                extra={popup.extra}
                caseId={popup.caseId}
                onSubmit={decideExtra}
                onClose={() => setPopup(null)}
              />
            )}
          </div>
        );
      }}
    </OfficePageFrame>
  );
}
