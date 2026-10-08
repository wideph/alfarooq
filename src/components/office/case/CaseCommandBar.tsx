"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgePercent, Flame, Layers, Loader2, Printer, Tag } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import ExtraAmountPopup from "@/components/office/ExtraAmountPopup";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/office/labels";
import { BOOKING_OFFICE_TYPE_LABELS } from "@/lib/office/permissions";
import type { CaseDetail } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

// Sticky top command bar: identity chips + primary contextual actions.
// Urgent toggle (office:cases:write) aur extra-amount decision (ledger:write)
// yahin se — pehle CaseHeader mein thay.
export default function CaseCommandBar({
  detail,
  admin,
  onUpdated,
  onMessage,
}: {
  detail: CaseDetail;
  admin: AdminNavUser;
  onUpdated: (next: CaseDetail) => void;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const canEdit = adminCanAny(admin, ["office:cases:write"]);
  const canLedgerWrite = adminCanAny(admin, ["office:ledger:write"]);
  const [popup, setPopup] = useState(false);
  const [busy, setBusy] = useState(false);

  // §N7: Urgent badge toggle (booking office / admin).
  async function toggleUrgent() {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}`, {
      method: "PATCH",
      json: { isUrgent: !detail.isUrgent },
    });
    if (res.ok) {
      onUpdated(res.data);
      onMessage(res.data.isUrgent ? "Case urgent mark ho gaya" : "Urgent badge hata diya");
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function decideExtra(percent: number) {
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/commission`, {
      method: "PATCH",
      json: { extraSharePercent: percent },
    });
    if (res.ok) {
      onUpdated(res.data);
      onMessage(`Extra share ${percent}% set ho gaya`);
    } else onMessage(res.error, "error");
    setPopup(false);
  }

  return (
    <div className="sticky top-16 z-30 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          href="/office/cases"
          aria-label="All cases"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-primary-300 hover:text-primary-700"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{detail.caseNumber}</span>
            {detail.isUrgent && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                <Flame className="h-3 w-3" /> URGENT
              </span>
            )}
            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[detail.status]}`}>
              {STATUS_LABELS[detail.status] || detail.status}
            </span>
            <span
              className={`inline-flex items-center gap-1 text-[11px] ${detail.isPrinted ? "font-semibold text-emerald-700" : "text-slate-400"}`}
              title={detail.isPrinted ? `Printed ${formatDate(detail.printedAt)}` : "Not printed"}
            >
              <Printer className="h-3.5 w-3.5" />
              {detail.isPrinted ? `Printed ${formatDate(detail.printedAt)}` : "Not printed"}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <h1 className="truncate text-base font-bold leading-tight text-slate-900">{detail.clientName || "—"}</h1>
            {detail.category && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                <Tag className="h-3 w-3" /> {detail.category.name}
              </span>
            )}
            {detail.setName && (
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-50 px-2 py-0.5 text-[11px] font-semibold text-primary-700">
                <Layers className="h-3 w-3" /> {detail.setName}
              </span>
            )}
            {detail.boardAttasNumber && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-bold text-indigo-700">
                Board Attas # {detail.boardAttasNumber}
              </span>
            )}
          </div>
        </div>

        <div className="ms-auto flex flex-wrap items-center gap-2">
          <p className="hidden text-[11px] leading-tight text-slate-400 xl:block">
            {detail.bookingOffice.name} · {BOOKING_OFFICE_TYPE_LABELS[detail.bookingOffice.type]}
            <br />
            Created {formatDate(detail.createdAt)}
            {detail.createdByName ? ` by ${detail.createdByName}` : ""}
          </p>
          {detail.needsExtraDecision !== null && canLedgerWrite && (
            <button
              onClick={() => setPopup(true)}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-2 text-xs font-semibold text-white"
            >
              <BadgePercent className="h-4 w-4" /> Extra {formatMoney(detail.needsExtraDecision)} — decide karein
            </button>
          )}
          {canEdit && (
            <button
              disabled={busy}
              onClick={toggleUrgent}
              className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold disabled:opacity-50 ${
                detail.isUrgent
                  ? "border border-red-300 bg-white text-red-600"
                  : "bg-red-600 text-white"
              }`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Flame className="h-4 w-4" />}
              {detail.isUrgent ? "Urgent hatayein" : "Urgent karein"}
            </button>
          )}
        </div>
      </div>

      {popup && detail.needsExtraDecision !== null && (
        <ExtraAmountPopup
          caseNumber={detail.caseNumber}
          extra={detail.needsExtraDecision}
          onSubmit={decideExtra}
          onClose={() => setPopup(false)}
        />
      )}
    </div>
  );
}
