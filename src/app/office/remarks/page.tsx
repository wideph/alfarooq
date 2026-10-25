"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck, Loader2, MessageSquare } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";
import { formatDateTime, officeFetch } from "@/lib/office/client";
import { caseStatusLabel, caseStatusStyle } from "@/lib/office/labels";
import { ROLE_LABELS } from "@/lib/office/permissions";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { caseDetailHref } from "@/lib/office/case-nav";

// §W32 — user ka Remarks tab: kisi bhi case mein jo remarks is user ke liye
// bheje gaye (role / department), har case ki pehchan ke saath. Dekh lene se
// nahi hat-te — sirf "Done" se.

type InboxItem = {
  id: string;
  text: string;
  createdAt: string;
  createdByName: string | null;
  createdByRole: string;
  forTargets: string[];
  case: {
    id: string;
    caseNumber: string;
    clientName: string | null;
    rollNumber: string | null;
    registrationNumber: string | null;
    onlineVerificationNumber: string | null;
    status: string;
  };
};

const TARGET_LABELS: Record<string, string> = {
  ADMIN: "Admin",
  BOOKING: "Booking office",
  FILING: "Filing",
  PRINTING: "Printing",
  ATTESTATION: "Attestation",
  COURIER: "Courier",
};

export default function OfficeRemarksPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastData | null>(null);
  const setMessage = (m: string, kind: ToastKind = "success") => setToast(m ? { message: m, kind } : null);

  const load = useCallback(async () => {
    const res = await officeFetch<{ items: InboxItem[]; count: number }>("/api/office/remarks");
    if (res.ok) {
      setItems(res.data.items);
      setCount(res.data.count);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useLiveRefresh(load);

  async function markDone(body: { remarkIds?: string[]; all?: boolean }, key: string) {
    setBusy(key);
    try {
      const res = await officeFetch<{ done: number; count: number }>("/api/office/remarks/done", { method: "POST", json: body });
      if (res.ok) {
        const ids = new Set(body.remarkIds ?? []);
        setItems((prev) => (body.all ? [] : prev.filter((item) => !ids.has(item.id))));
        setCount(res.data.count);
        setMessage(body.all ? "Tamam remarks done" : "Remark done");
        if (body.all) await load();
      } else {
        setMessage(res.error, "error");
      }
    } finally {
      setBusy(null);
    }
  }

  return (
    <OfficePageFrame>
      <div className="space-y-4">
        <Toast toast={toast} onClose={() => setToast(null)} />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 text-xl font-bold text-slate-900">
              <MessageSquare className="h-5 w-5 text-primary-600" /> Remarks
              {count > 0 && (
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">{count}</span>
              )}
            </h2>
            <p className="text-xs text-slate-500">
              Aap ke liye bheje gaye remarks — &quot;Done&quot; karne tak yahin rehte hain.
            </p>
          </div>
          {items.length > 1 && (
            <button
              type="button"
              disabled={busy !== null}
              onClick={() => {
                if (confirm(`Tamam ${count} remarks done karein?`)) void markDone({ all: true }, "all");
              }}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              Sab done karein
            </button>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16">
            <Loader2 className="h-8 w-8 animate-spin text-primary-500" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
            <CheckCheck className="h-8 w-8 text-emerald-500" />
            <p className="text-sm font-semibold text-slate-700">Aap ke liye koi pending remark nahi</p>
          </div>
        ) : (
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={caseDetailHref(item.case.id, "/office/remarks")} className="font-semibold text-primary-700 hover:underline">
                        {item.case.caseNumber}
                      </Link>
                      <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${caseStatusStyle(item.case.status)}`}>
                        {caseStatusLabel(item.case.status)}
                      </span>
                    </div>
                    <p className="text-base font-bold text-slate-900">{item.case.clientName || "—"}</p>
                    <p className="text-xs text-slate-600">
                      Roll No: <span className="font-semibold text-slate-800">{item.case.rollNumber || "—"}</span>
                      <span className="mx-1.5 text-slate-300">|</span>
                      Reg No: <span className="font-semibold text-slate-800">{item.case.registrationNumber || "—"}</span>
                      {item.case.onlineVerificationNumber && (
                        <>
                          <span className="mx-1.5 text-slate-300">|</span>
                          Online Verification #:{" "}
                          <span className="font-semibold text-indigo-700">{item.case.onlineVerificationNumber}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => void markDone({ remarkIds: [item.id] }, item.id)}
                    className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {busy === item.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                    Done
                  </button>
                </div>
                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-amber-50 px-3 py-2 text-sm text-slate-800 ring-1 ring-amber-100">
                  {item.text}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                  <span>
                    {item.createdByName || "—"}
                    {item.createdByRole ? ` (${ROLE_LABELS[item.createdByRole] || item.createdByRole})` : ""}
                  </span>
                  <span>· {formatDateTime(item.createdAt)}</span>
                  {item.forTargets.map((target) => (
                    <span key={target} className="rounded-full bg-slate-100 px-2 py-0.5 font-semibold text-slate-600">
                      {TARGET_LABELS[target] || target}
                    </span>
                  ))}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </OfficePageFrame>
  );
}
