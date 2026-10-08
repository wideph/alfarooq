"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { officeFetch } from "@/lib/office/client";
import { useToast } from "@/hooks/useToast";
import type { ToastKind } from "@/components/Toast";

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
  // Caller toast na de to apna toast render karte hain.
  const { showToast: localToast, ToastElement } = useToast();
  const notify = onMessage ?? localToast;

  async function doDelete() {
    setDeleting(true);
    const res = await officeFetch(`/api/office/cases/${caseId}`, { method: "DELETE" });
    setDeleting(false);
    if (!res.ok) {
      setOpen(false);
      notify(res.error, "error");
      return;
    }
    setOpen(false);
    notify("Case delete ho gaya", "success");
    onDeleted?.();
    // Toast dikhne ka thora waqt de kar navigate karte hain.
    if (redirectTo) setTimeout(() => router.push(redirectTo), 800);
  }

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
            if (!deleting) setOpen(false);
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
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
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                disabled={deleting}
                onClick={() => setOpen(false)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={deleting}
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
