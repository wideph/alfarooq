"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { HandCoins, Receipt } from "lucide-react";
import { formatMoney, officeFetch } from "@/lib/office/client";
import { ROLE_LABELS } from "@/lib/office/permissions";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import type { ToastKind } from "@/components/Toast";
import { EmptyState, SectionHeader, TableSkeleton, dueToneClass } from "./ui";
import DeptPayModal, { deptPayable } from "./DeptPayModal";
import DeptExpensesDrawer from "./DeptExpensesDrawer";
import { DeptRequestList } from "./DeptExpenseLists";
import {
  normalizeDeptPayouts,
  type DeptCommissionSummaryUser,
  type DeptMoney,
  type DeptPayoutKind,
  type DeptPayoutRequestRow,
} from "./types";

// §W51 — Department kharche (admin / cashier): courier kharcha (slip ke saath,
// case ka expense) aur other kharcha (comment ke saath, sirf admin profit se
// minus) — har user ne apni jeb se diya, admin ne wapas dena hai. Pay =
// request (user accept kare tab paid), courier aur other alag alag. Neeche
// tamam pending payment requests (commission bhi) — cancel ho sakti hain.
function MoneyCell({ money }: { money: DeptMoney }) {
  return (
    <div className="text-right">
      <p className={`font-bold ${dueToneClass(money.remaining)}`}>{formatMoney(money.remaining)}</p>
      <p className="text-[11px] text-slate-400">
        kul {formatMoney(money.total)} · wapas {formatMoney(money.paid)}
      </p>
      {money.pending > 0 && (
        <p className="text-[11px] font-semibold text-sky-600">{formatMoney(money.pending)} request pending</p>
      )}
    </div>
  );
}

export default function DeptExpenses({
  users,
  onToast,
}: {
  users: DeptCommissionSummaryUser[] | null;
  onToast: (message: string, kind: ToastKind) => void;
}) {
  const [pay, setPay] = useState<{ user: DeptCommissionSummaryUser; kind: DeptPayoutKind } | null>(null);
  const [detailTarget, setDetailTarget] = useState<DeptCommissionSummaryUser | null>(null);
  const [pending, setPending] = useState<DeptPayoutRequestRow[] | null>(null);

  // §W52: kharche jo abhi admin ke review mein hain (yahan ke totals mein nahi).
  const [reviewCount, setReviewCount] = useState(0);

  const loadPending = useCallback(async () => {
    const [payouts, reviews] = await Promise.all([
      officeFetch("/api/office/dept-payouts?status=PENDING"),
      officeFetch<{ counts: { PENDING: number } }>("/api/office/dept-expense-requests?countOnly=1"),
    ]);
    if (payouts.ok) setPending(normalizeDeptPayouts(payouts.data));
    setReviewCount(reviews.ok ? reviews.data.counts.PENDING : 0);
  }, []);
  useLiveRefresh(loadPending, { immediate: true });

  const rows = (users ?? []).filter(
    (user) => user.courier.total > 0 || user.other.total > 0 || user.courier.paid > 0 || user.other.paid > 0
  );
  const payButton = (user: DeptCommissionSummaryUser, kind: DeptPayoutKind) => (
    <button
      type="button"
      onClick={() => setPay({ user, kind })}
      disabled={deptPayable(user, kind) <= 0}
      className="inline-flex items-center gap-1 rounded-xl bg-primary-600 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-40"
    >
      <HandCoins className="h-3.5 w-3.5" /> Pay
    </button>
  );

  return (
    <section id="dept-expenses" className="scroll-mt-24 space-y-2">
      <SectionHeader
        icon={<Receipt className="h-4 w-4 text-primary-600" />}
        title="Department kharche (Courier / Other) — admin se wasooli"
        count={users ? rows.length : undefined}
      />
      {reviewCount > 0 && (
        <Link
          href="/office/payments?view=expenses"
          className="flex items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-sm font-semibold text-amber-900 hover:bg-amber-100"
        >
          <span>
            {reviewCount} naye kharche aap ke review ke intezar mein — manzoori ke baad hi yahan judte hain
          </span>
          <span className="shrink-0 underline">Review karein →</span>
        </Link>
      )}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {users === null ? (
          <TableSkeleton rows={2} />
        ) : rows.length === 0 ? (
          <EmptyState>Abhi kisi department user ka koi kharcha nahi</EmptyState>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-bold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Name</th>
                  <th className="px-3 py-2 text-right">Courier kharcha (baqi)</th>
                  <th className="px-3 py-2 text-right">Other expenses (baqi)</th>
                  <th className="px-3 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((user) => (
                  <tr key={user.adminId}>
                    <td className="px-3 py-2.5">
                      <span className="font-semibold text-slate-800">{user.name}</span>{" "}
                      <span className="ml-1 inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                        {ROLE_LABELS[user.role] || user.role}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-start justify-end gap-2">
                        <MoneyCell money={user.courier} />
                        {payButton(user, "COURIER_EXPENSE")}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-start justify-end gap-2">
                        <MoneyCell money={user.other} />
                        {payButton(user, "OTHER_EXPENSE")}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => setDetailTarget(user)}
                        className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                      >
                        Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {pending && pending.length > 0 && (
        <div className="space-y-1.5 pt-1">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            Department payment requests — user ki tasdeeq baqi ({pending.length})
          </p>
          <DeptRequestList
            rows={pending}
            mode="admin"
            showUser
            empty=""
            onChanged={loadPending}
            onToast={onToast}
          />
        </div>
      )}

      {pay && (
        <DeptPayModal user={pay.user} kind={pay.kind} onClose={() => setPay(null)} onToast={onToast} />
      )}
      {detailTarget && (
        <DeptExpensesDrawer user={detailTarget} onClose={() => setDetailTarget(null)} onToast={onToast} />
      )}
    </section>
  );
}
