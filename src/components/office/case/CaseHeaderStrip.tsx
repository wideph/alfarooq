"use client";

import { Hash, ScanBarcode } from "lucide-react";
import { caseStatusLabel, caseStatusStyle } from "@/lib/office/labels";
import type { CaseDetail } from "@/lib/office/types";

// §W21 — case detail page ka slim always-on header strip: har tab ke upar
// case ki pehchan (case #, client, Roll/Reg, category, status) + BMFQ fields
// (Board Attestation #, Online Verification #) ek nazar mein. Sirf full view
// par render hota hai — limited dept views ke apne headers hain.
//
// onlineVerificationNumber contract field hai; types.ts (serializer side)
// mid-flight ho sakta hai, is liye yahan optional extension rakhi hai.
export type CaseHeaderDetail = CaseDetail & { onlineVerificationNumber?: string | null };

export default function CaseHeaderStrip({ detail }: { detail: CaseHeaderDetail }) {
  return (
    <div className="sticky top-16 z-20 rounded-2xl border border-slate-200 bg-white/95 px-3 py-2 shadow-sm backdrop-blur">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{detail.caseNumber}</span>
        <span className="max-w-full truncate text-sm font-bold text-slate-900">{detail.clientName || "—"}</span>

        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
          Roll {detail.rollNumber || "—"}
        </span>
        {detail.registrationNumber && (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
            Reg {detail.registrationNumber}
          </span>
        )}

        {detail.category?.name && (
          <span className="inline-block rounded-full bg-primary-50 px-2.5 py-0.5 text-[11px] font-semibold text-primary-700">
            {detail.category.name}
          </span>
        )}
        <span
          className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${caseStatusStyle(detail.status)}`}
        >
          {caseStatusLabel(detail.status, detail.currentAttestation?.attestationTypeName)}
        </span>

        {detail.boardAttestationNumber && (
          <span className="inline-flex items-center gap-1 rounded-full bg-indigo-100 px-2.5 py-0.5 text-[11px] font-bold text-indigo-700">
            <Hash className="h-3 w-3" /> Board Attestation # {detail.boardAttestationNumber}
          </span>
        )}
        {detail.onlineVerificationNumber && (
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-0.5 text-[11px] font-bold text-teal-700">
            <ScanBarcode className="h-3 w-3" /> Online Verification # {detail.onlineVerificationNumber}
          </span>
        )}
      </div>
    </div>
  );
}
