"use client";

import { Printer, Stamp } from "lucide-react";
import SectionCard from "@/components/ui/SectionCard";
import { formatDate, formatMoney } from "@/lib/office/client";
import type { CaseDetail } from "@/lib/office/types";

// §W22 (F22.6): case detail payload ka top-level deptCommissions field (ledger
// DEPT_COMMISSION entries of this case — REAL CaseExpense rows nahi). Local
// intersection type: src/lib/office/types.ts backend contract file hai.
export type DeptCommissionAttachment = {
  id: string;
  kind: "PRINTING" | "ATTESTATION" | null;
  amount: number;
  adminName: string;
  entryDate: string;
};
export type CaseDetailWithDeptCommissions = CaseDetail & { deptCommissions?: DeptCommissionAttachment[] };

// Is case par credit hui dept commissions (printing/attestation) — read-only
// mini-list. Ye REAL CaseExpense rows NAHI hain (pool/member formulas
// unaffected; DEPT_COMMISSION bucket admin profit mein pehle se deduct hota
// hai) — sirf display taake case ke sath attached commission nazar aaye.
// Dono tabs (Payments + History/expenses) mein render hota hai.
export default function DeptCommissionsAttached({ detail }: { detail: CaseDetail }) {
  const items = (detail as CaseDetailWithDeptCommissions).deptCommissions;
  if (!items || items.length === 0) return null;

  return (
    <SectionCard icon={Printer} title="Department commissions (attached)" count={items.length}>
      <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {items.map((item) => {
          const isPrinting = item.kind !== "ATTESTATION";
          return (
            <li key={item.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-sm">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                  isPrinting ? "bg-sky-100 text-sky-700" : "bg-amber-100 text-amber-700"
                }`}
              >
                {isPrinting ? <Printer className="h-3 w-3" /> : <Stamp className="h-3 w-3" />}
                {isPrinting ? "Printing" : "Attestation"}
              </span>
              <span className="min-w-0 flex-1">
                <span className="font-medium text-slate-800">{item.adminName}</span>
                <span className="text-xs text-slate-400"> · {formatDate(item.entryDate)}</span>
              </span>
              <span className="shrink-0 font-semibold text-slate-900">{formatMoney(Number(item.amount) || 0)}</span>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-slate-500">
        Ye commission case ke sath attached hai — member shares se nahi kat-ti.
      </p>
    </SectionCard>
  );
}
