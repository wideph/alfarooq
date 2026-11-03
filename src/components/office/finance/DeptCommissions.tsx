"use client";

import { useState } from "react";
import { HandCoins, Printer } from "lucide-react";
import { formatMoney } from "@/lib/office/client";
import { ROLE_LABELS } from "@/lib/office/permissions";
import type { ToastKind } from "@/components/Toast";
import { EmptyState, SectionHeader, TableSkeleton, dueToneClass } from "./ui";
import DeptPayModal, { deptPayable } from "./DeptPayModal";
import DeptDetailsDrawer from "./DeptDetailsDrawer";
import type { DeptCommissionSummaryUser } from "./types";

// §W21 — Department commissions (Printing / Attestation / Courier). Summary per
// dept user: Earned | Paid (Wasool) | Remaining + Pay / Details actions.
// Sirf admin/cashier (finance:read / ledger:read) view mein mount hota hai.
// §W51: Pay = request (user accept kare tab paid); pending request remaining
// ke neeche. Summary parent (useDeptSummary) se aati hai.
export default function DeptCommissions({
  users,
  onToast,
}: {
  users: DeptCommissionSummaryUser[] | null;
  onToast: (message: string, kind: ToastKind) => void;
}) {
  const [payTarget, setPayTarget] = useState<DeptCommissionSummaryUser | null>(null);
  const [detailTarget, setDetailTarget] = useState<DeptCommissionSummaryUser | null>(null);

  return (
    <section className="space-y-2">
      <SectionHeader
        icon={<Printer className="h-4 w-4 text-primary-600" />}
        title="Department commissions (Printing / Attestation / Courier)"
        count={users?.length}
      />
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {users === null ? (
          <TableSkeleton rows={3} />
        ) : users.length === 0 ? (
          <EmptyState>
            Abhi koi department commission rule/entry nahi — Setup se user ka commission set karein
          </EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">Earned</th>
                  <th className="px-3 py-2 text-right">Paid (Wasool)</th>
                  <th className="px-3 py-2 text-right">Remaining</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((user) => (
                  <tr key={user.adminId}>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-slate-800">{user.name}</span>{" "}
                      <span className="ml-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-emerald-700">
                      {formatMoney(user.earned)}
                    </td>
                    <td className="px-3 py-2.5 text-right font-semibold text-sky-700">
                      {formatMoney(user.paid)}
                    </td>
                    <td className={`px-3 py-2.5 text-right font-bold ${dueToneClass(user.remaining)}`}>
                      {formatMoney(user.remaining)}
                      {user.pending > 0 && (
                        <span className="block text-[11px] font-semibold text-sky-600">
                          {formatMoney(user.pending)} request pending
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setPayTarget(user)}
                          disabled={deptPayable(user, "COMMISSION") <= 0}
                          className="inline-flex items-center gap-1 rounded-xl bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
                        >
                          <HandCoins className="h-3.5 w-3.5" /> Pay
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetailTarget(user)}
                          className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                        >
                          Details
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {payTarget && (
        <DeptPayModal user={payTarget} kind="COMMISSION" onClose={() => setPayTarget(null)} onToast={onToast} />
      )}
      {detailTarget && (
        <DeptDetailsDrawer user={detailTarget} onClose={() => setDetailTarget(null)} />
      )}
    </section>
  );
}
