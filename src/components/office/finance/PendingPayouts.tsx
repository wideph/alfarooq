"use client";

import { Clock } from "lucide-react";
import { formatDate, formatMoney } from "@/lib/office/client";
import { PAYMENT_METHOD_LABELS } from "@/lib/office/labels";
import { SectionHeader } from "./ui";
import type { PayoutRequestRow } from "./types";

// Pending payout requests — admin ke liye STATUS ONLY. Accept/reject member
// ke apne view (Mera account) se hota hai.
export default function PendingPayouts({ requests }: { requests: PayoutRequestRow[] }) {
  if (requests.length === 0) return null;
  return (
    <section className="space-y-2">
      <SectionHeader
        icon={<Clock className="h-4 w-4 text-amber-500" />}
        title="Pending payout requests"
        count={requests.length}
      />
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {requests.map((r) => (
          <li
            key={r.id}
            className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/60 px-3 py-2.5 text-sm shadow-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-slate-800">
                {r.member?.name || "—"}
                <span className="ml-1 text-xs font-normal text-slate-500">· {r.bookingOffice?.name || "—"}</span>
              </p>
              <p className="text-xs text-slate-400">
                {formatDate(r.entryDate)}
                {r.method ? ` · ${PAYMENT_METHOD_LABELS[r.method] || r.method}` : ""}
                {r.remarks ? ` · ${r.remarks}` : ""}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1">
              <span className="font-bold text-slate-900">{formatMoney(r.amount)}</span>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                Pending
              </span>
            </div>
          </li>
        ))}
      </ul>
      <p className="text-xs text-slate-400">Accept / reject member ke apne account se hota hai.</p>
    </section>
  );
}
