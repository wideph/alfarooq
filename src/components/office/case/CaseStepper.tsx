"use client";

import { Check, CreditCard, FileUp, PackageCheck, Printer, Sparkles, Stamp, Truck, XCircle } from "lucide-react";

// Workflow stepper — case.status se current step derive hota hai. Ek nazar mein
// poora pipeline samajh aa jata hai: kahan tak pohncha, kya baqi hai.
const STEPS = [
  { key: "NEW", label: "New", icon: Sparkles },
  { key: "PAYMENT", label: "Payment", icon: CreditCard },
  { key: "FILE", label: "File", icon: FileUp },
  { key: "PRINTING", label: "Printing", icon: Printer },
  { key: "ATTESTATION", label: "Attestation", icon: Stamp },
  { key: "COMPLETED", label: "Completed", icon: PackageCheck },
  { key: "DELIVERED", label: "Delivered", icon: Truck },
] as const;

const STATUS_STEP_INDEX: Record<string, number> = {
  NEW: 0,
  PAYMENT_PENDING: 1,
  WAITING_FOR_FILE: 2,
  WAITING_FOR_PRINTING: 3,
  IN_PROCESS: 3,
  PRINTED: 4,
  ATTESTATION: 4,
  COMPLETED: 5,
  DELIVERED: 6,
};

export default function CaseStepper({ status }: { status: string }) {
  if (status === "CANCELLED") {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
        <XCircle className="h-4 w-4" /> Ye case cancel ho chuka hai — workflow band hai.
      </div>
    );
  }

  const current = STATUS_STEP_INDEX[status] ?? 0;

  return (
    <ol className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:gap-0 sm:px-2 sm:py-4">
      {STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        const Icon = step.icon;
        return (
          <li key={step.key} className="flex flex-1 flex-col sm:flex-row sm:items-center">
            <div className="flex items-center gap-2 sm:flex-col sm:gap-1 sm:self-start">
              <span
                className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                  done
                    ? "border-emerald-500 bg-emerald-500 text-white"
                    : active
                      ? "border-primary-600 bg-primary-600 text-white ring-4 ring-primary-100"
                      : "border-slate-200 bg-slate-50 text-slate-400"
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
              </span>
              <span
                className={`whitespace-nowrap text-[11px] font-semibold ${
                  active ? "text-primary-700" : done ? "text-emerald-700" : "text-slate-400"
                }`}
              >
                {step.label}
              </span>
            </div>
            {index < STEPS.length - 1 && (
              <>
                {/* mobile: vertical connector under the circle */}
                <span className={`my-0.5 ms-4 h-3 w-0.5 rounded sm:hidden ${done ? "bg-emerald-300" : "bg-slate-200"}`} />
                {/* desktop: horizontal connector aligned with the circles */}
                <span className={`mx-1 mt-4 hidden h-0.5 min-w-2 flex-1 self-start rounded sm:block ${done ? "bg-emerald-300" : "bg-slate-200"}`} />
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}
