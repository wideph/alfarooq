"use client";

import { Users } from "lucide-react";
import { formatMoney } from "@/lib/office/client";
import { EmptyState, OfficeTypeChip, SectionHeader, TableSkeleton, dueToneClass } from "./ui";
import { groupUsersByOffice, type FinanceUserRow } from "./types";

// Users' accounts — grouped BY OFFICE. Row click → drawer; Pay → payout modal.
// SALARY members render normally with a small "Salary" chip (usually zeros).
export default function UsersAccounts({
  rows,
  loading,
  onSelect,
  onPay,
}: {
  rows: FinanceUserRow[] | null;
  loading: boolean;
  onSelect: (row: FinanceUserRow) => void;
  onPay: (row: FinanceUserRow) => void;
}) {
  const groups = rows ? groupUsersByOffice(rows) : [];

  return (
    <section className="space-y-2">
      <SectionHeader
        icon={<Users className="h-4 w-4 text-primary-600" />}
        title="Users' accounts"
        count={rows?.length}
      />

      {loading && !rows ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <TableSkeleton rows={5} />
        </div>
      ) : !rows || rows.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
          <EmptyState>Koi active member nahi</EmptyState>
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.officeId} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2">
                <p className="text-sm font-bold text-slate-800">{group.officeName}</p>
                <OfficeTypeChip type={group.officeType} />
              </div>

              {/* Mobile cards */}
              <ul className="divide-y divide-slate-100 md:hidden">
                {group.rows.map((row) => (
                  <li
                    key={row.memberId}
                    onClick={() => onSelect(row)}
                    className="cursor-pointer space-y-1.5 p-3 text-sm active:bg-slate-50"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5 font-semibold text-slate-800">
                        <span className="truncate">{row.memberName}</span>
                        {row.officeType === "SALARY" && <OfficeTypeChip type="SALARY" short />}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onPay(row);
                        }}
                        className="min-h-[32px] shrink-0 rounded-lg bg-primary-600 px-3 py-1 text-[11px] font-bold text-white"
                      >
                        Pay
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                      <MobileStat label="Earning" value={row.earning} cls="text-emerald-700" />
                      <MobileStat label="Expense share" value={row.expenseShare} cls="text-red-600" prefix="− " />
                      <MobileStat label="Wasool" value={row.wasool} cls="text-sky-700" />
                      <MobileStat label="Due" value={row.due} cls={`font-bold ${dueToneClass(row.due)}`} />
                    </div>
                  </li>
                ))}
              </ul>

              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full text-sm">
                  <thead className="bg-white text-left text-xs uppercase text-slate-500">
                    <tr className="border-b border-slate-100">
                      <th className="px-3 py-2">User</th>
                      <th className="px-3 py-2 text-right">Earning</th>
                      <th className="px-3 py-2 text-right">Expense share</th>
                      <th className="px-3 py-2 text-right">Wasool</th>
                      <th className="px-3 py-2 text-right">Due</th>
                      <th className="px-3 py-2 text-right">Pay</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {group.rows.map((row) => (
                      <tr
                        key={row.memberId}
                        onClick={() => onSelect(row)}
                        className="cursor-pointer transition-colors hover:bg-slate-50"
                      >
                        <td className="px-3 py-2.5 font-semibold text-slate-800">
                          <span className="flex items-center gap-1.5">
                            {row.memberName}
                            {row.officeType === "SALARY" && <OfficeTypeChip type="SALARY" short />}
                          </span>
                          {row.userName && <span className="block text-xs font-normal text-slate-400">{row.userName}</span>}
                          {row.officeType === "PROFIT_SHARE" && row.percent > 0 && (
                            <span className="block text-xs font-normal text-slate-400">{row.percent}% share</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-emerald-700">
                          {formatMoney(row.earning)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-red-600">
                          {row.expenseShare > 0 ? `− ${formatMoney(row.expenseShare)}` : "—"}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right text-sky-700">
                          {formatMoney(row.wasool)}
                        </td>
                        <td
                          className={`whitespace-nowrap px-3 py-2.5 text-right font-bold ${dueToneClass(row.due)}`}
                        >
                          {formatMoney(row.due)}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2.5 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onPay(row);
                            }}
                            className="min-h-[32px] rounded-lg bg-primary-600 px-3 py-1 text-[11px] font-bold text-white hover:bg-primary-700"
                          >
                            Pay
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function MobileStat({ label, value, cls, prefix = "" }: { label: string; value: number; cls: string; prefix?: string }) {
  return (
    <p className="flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1">
      <span className="text-slate-500">{label}</span>
      <span className={cls}>
        {prefix}
        {formatMoney(value)}
      </span>
    </p>
  );
}
