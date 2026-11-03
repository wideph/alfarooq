"use client";

import { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import { officeFetch } from "@/lib/office/client";
import { ROLE_LABELS } from "@/lib/office/permissions";
import type { ToastKind } from "@/components/Toast";
import { DeptExpenseList, DeptMoneyEquation, DeptRequestList } from "./DeptExpenseLists";
import { normalizeDeptExpenses, type DeptCommissionSummaryUser, type DeptExpensesPayload } from "./types";

// §W51 — admin / cashier: ek department user ke kharche (courier: case-wise,
// other: comment ke saath) + payment requests ki history.
export default function DeptExpensesDrawer({
  user,
  onClose,
  onToast,
}: {
  user: DeptCommissionSummaryUser;
  onClose: () => void;
  onToast: (message: string, kind: ToastKind) => void;
}) {
  const [data, setData] = useState<DeptExpensesPayload | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const res = await officeFetch(`/api/office/dept-expenses?adminId=${encodeURIComponent(user.adminId)}`);
    if (res.ok) {
      setData(normalizeDeptExpenses(res.data));
      setError("");
    } else setError(res.error);
  }, [user.adminId]);

  useEffect(() => {
    setData(null);
    void load();
  }, [load]);

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
            <p className="truncate text-base font-bold text-slate-900">{user.name}</p>
            <p className="mt-0.5 text-xs text-slate-500">
              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                {ROLE_LABELS[user.role] || user.role}
              </span>{" "}
              Department kharche aur wapsi
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
          {!data && !error ? (
            <div className="animate-pulse space-y-3" aria-label="Detail load ho raha hai">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 rounded-xl bg-slate-100" />
              ))}
            </div>
          ) : data ? (
            <>
              <section className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Courier kharcha</p>
                <DeptMoneyEquation money={data.totals.courier} title="Kul courier kharcha" />
                <DeptExpenseList
                  kind="COURIER"
                  rows={data.courier}
                  empty="Koi courier kharcha nahi"
                  onChanged={load}
                  onToast={onToast}
                />
              </section>
              <section className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Other kharcha</p>
                <DeptMoneyEquation money={data.totals.other} title="Kul other kharcha" />
                <DeptExpenseList
                  kind="OTHER"
                  rows={data.other}
                  empty="Koi other kharcha nahi"
                  onChanged={load}
                  onToast={onToast}
                />
              </section>
              <section className="space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Payment requests</p>
                <DeptRequestList
                  rows={data.requests}
                  mode="admin"
                  empty="Abhi koi payment request nahi"
                  onChanged={load}
                  onToast={onToast}
                />
              </section>
            </>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
