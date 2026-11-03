"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { formatMoney, officeFetch } from "@/lib/office/client";
import { useToast } from "@/hooks/useToast";
import type { ToastKind } from "@/components/Toast";

// §W54: case par department user ka manzoor shuda kharcha ho to server 409
// `needsDeptExpenseDecision` deta hai — dialog admin se poochta hai kharche ka
// kya karna hai, phir ?deptExpenses=OTHER|OFFICE|REVERSE ke saath dobara.
type ExpenseChoice = "OTHER" | "OFFICE" | "REVERSE";
type ExpenseDecision = {
  caseNumber: string;
  officeName: string;
  officeType: string;
  pendingReviews: number;
  total: number;
  expenses: Array<{ id: string; amount: number; description: string; userName: string | null; commissionDeducted: number }>;
};

function officeEffect(decision: ExpenseDecision) {
  if (decision.officeType === "PROFIT_SHARE") return "shareholders pehle jaisa apne % ke mutabiq, baqi admin";
  if (decision.officeType === "FIXED_COMMISSION") {
    const deducted = decision.expenses.reduce((acc, expense) => acc + expense.commissionDeducted, 0);
    return deducted > 0
      ? `jitna commission se minus tha (${formatMoney(deducted)}) utna hi member par, baqi admin`
      : "commission se kuch minus nahi tha — poora admin ka (office ke naam)";
  }
  return "admin ka kharcha (office ke naam)";
}

// §W13.3: Case delete (sirf admin ke liye render hota hai — caller check karta
// hai; API bhi admin-only hai). Trigger + confirm modal yahin hain taake list
// row aur command bar dono reuse kar sakein. Row ke andar click bubble na ho
// is liye har interactive element stopPropagation karta hai.
export default function DeleteCaseButton({
  caseId,
  caseNumber,
  size = "md",
  redirectTo,
  onDeleted,
  onMessage,
}: {
  caseId: string;
  caseNumber: string;
  size?: "sm" | "md";
  // Agar diya ho to delete ke baad is route par navigate (detail page use).
  redirectTo?: string;
  onDeleted?: () => void;
  onMessage?: (message: string, kind?: ToastKind) => void;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [decision, setDecision] = useState<ExpenseDecision | null>(null);
  const [choice, setChoice] = useState<ExpenseChoice | null>(null);
  // Caller toast na de to apna toast render karte hain.
  const { showToast: localToast, ToastElement } = useToast();
  const notify = onMessage ?? localToast;

  function close() {
    setOpen(false);
    setDecision(null);
    setChoice(null);
  }

  async function doDelete() {
    if (decision && !choice) {
      notify("Pehle kharche ka faisla chunein", "error");
      return;
    }
    setDeleting(true);
    const query = decision && choice ? `?deptExpenses=${choice}` : "";
    const res = await officeFetch(`/api/office/cases/${caseId}${query}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      const needs = (res.data as { needsDeptExpenseDecision?: ExpenseDecision } | undefined)?.needsDeptExpenseDecision;
      if (res.status === 409 && needs) {
        // Modal khula rahe — ab kharche ka sawal.
        setDecision(needs);
        return;
      }
      close();
      notify(res.error, "error");
      return;
    }
    close();
    notify("Case delete ho gaya", "success");
    onDeleted?.();
    // Toast dikhne ka thora waqt de kar navigate karte hain.
    if (redirectTo) setTimeout(() => router.push(redirectTo), 800);
  }

  const users = decision
    ? [...new Set(decision.expenses.map((expense) => expense.userName || "User"))].join(", ")
    : "";
  const options: Array<{ key: ExpenseChoice; title: string; text: string }> = decision
    ? [
        {
          key: "OTHER",
          title: "Other expenses mein daal dein",
          text: `Sirf admin ka kharcha — kisi office / shareholder par nahi. ${users} ki wapsi (admin se wasooli) baqi rahegi.`,
        },
        {
          key: "OFFICE",
          title: `Usi office (${decision.officeName}) par rahe`,
          text: `Office ka kharcha ban jayega: ${officeEffect(decision)}. ${users} ki wapsi baqi rahegi.`,
        },
        {
          key: "REVERSE",
          title: "Har jagah se reverse karein",
          text: `Kharcha poori tarah khatam aur ${users} ka wapsi ka haq bhi khatam. Agar wapsi de chuke hain to us ka hisaab minus (advance) mein chala jayega.`,
        },
      ]
    : [];

  return (
    <>
      <button
        type="button"
        title="Case delete karein"
        aria-label={`Case ${caseNumber} delete karein`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={
          size === "sm"
            ? "inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-red-200 bg-white text-red-500 hover:border-red-300 hover:bg-red-50 hover:text-red-600"
            : "inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50"
        }
      >
        <Trash2 className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
        {size !== "sm" && "Delete"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4"
          onClick={(e) => {
            e.stopPropagation();
            if (!deleting) close();
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className={`max-h-[90vh] w-full overflow-y-auto rounded-2xl bg-white p-5 shadow-xl ${decision ? "max-w-lg" : "max-w-sm"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100">
                <AlertTriangle className="h-5 w-5 text-red-600" />
              </span>
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">Case delete karein?</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-600">
                  Case {caseNumber} aur us ka sara record — payments, ledger entries, files, remarks — hamesha ke liye
                  delete ho jayega. Ye wapas nahi aa sakta.
                </p>
              </div>
            </div>

            {decision && (
              <div className="mt-4 space-y-3">
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-bold">
                    Is case par department ka kharcha hai — {formatMoney(decision.total)}. Is ka kya karna hai?
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs">
                    {decision.expenses.map((expense) => (
                      <li key={expense.id}>
                        {expense.userName || "User"}: {expense.description} — <b>{formatMoney(expense.amount)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="space-y-2" role="radiogroup" aria-label="Kharche ka faisla">
                  {options.map((option) => (
                    <label
                      key={option.key}
                      className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${
                        choice === option.key ? "border-primary-400 bg-primary-50 ring-2 ring-primary-100" : "border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="radio"
                        name={`dept-expense-${caseId}`}
                        checked={choice === option.key}
                        onChange={() => setChoice(option.key)}
                        className="mt-1"
                      />
                      <span>
                        <span className="block font-bold text-slate-900">{option.title}</span>
                        <span className="text-xs text-slate-600">{option.text}</span>
                      </span>
                    </label>
                  ))}
                </div>
                {decision.pendingReviews > 0 && (
                  <p className="text-xs text-slate-500">
                    Is case ke {decision.pendingReviews} kharche abhi aap ke review mein hain — wo Payments → Department
                    kharche mein rahenge (wahan Manzoor / Wapas karein).
                  </p>
                )}
              </div>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={close}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting || Boolean(decision && !choice)}
                onClick={doDelete}
                className="inline-flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                {deleting ? "Delete ho raha hai..." : "Hamesha delete karein"}
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastElement}
    </>
  );
}
