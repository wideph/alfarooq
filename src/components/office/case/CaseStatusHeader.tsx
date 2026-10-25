"use client";

import { ArrowRight } from "lucide-react";
import type { AdminNavUser, AdminPermission } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import CaseStatusSelect from "@/components/office/case/CaseStatusSelect";
import CompleteAttestationButton from "@/components/office/case/CompleteAttestationButton";
import type { ToastKind } from "@/components/Toast";
import { caseStatusLabel, caseStatusStyle } from "@/lib/office/labels";
import { CASE_STATUSES } from "@/lib/office/permissions";
import type { CaseDetail } from "@/lib/office/types";

// §W11.3 — slim status header (bulky CaseStepper ka replacement): ek saaf row
// mein bara current-status chip (ATTESTATION par dynamic step name), "Step X
// of N" progress aur aglay step ka hint. Admin ko yahin CaseStatusSelect
// milta hai — doosra koi status UI nahi (CaseAttestationsTab se hata diya).
// §W32: printing, attestation-dept YA courier department ke user ko (super
// admin nahi) PRINTED / ATTESTATION par "Attestation complete karein" —
// printed proof ke baad, WAJAH lazmi (server check karta hai). Payment poori
// ho to case khud courier stage par chala jata hai.

// Fixed flow steps (CANCELLED flow ka hissa nahi).
const FLOW = CASE_STATUSES.filter((s) => s !== "CANCELLED");

const NEXT_STEP_HINTS: Record<string, string> = {
  FIRST_PAYMENT_PENDING: "Payment receive karein",
  WAITING_FOR_FILE: "Filing dept file upload kare",
  WAITING_FOR_PRINTING: "Printing ka intezar",
  PRINTED: "Attestations shuru karein",
  ATTESTATION_COMPLETE: "Final payment receive karein",
  WAITING_FOR_COURIER_ADDRESS: "Courier (delivery) address add karein",
  WAITING_FOR_COURIER: "Courier slip upload karein",
  DELIVERED: "Case delivered",
  MUSADIQA_APPLIED: "Musadiqa follow-up",
  MUSADIQA_FEES_PAID: "Musadiqa follow-up",
  MUSADIQA_SENT_BY_BOARD: "Musadiqa follow-up",
  MUSADIQA_VERIFIED: "Musadiqa follow-up",
};

const ATTESTATION_DEPT_PERMISSION = "office:attestation-dept:write" as AdminPermission;

export default function CaseStatusHeader({
  detail,
  admin,
  onChanged,
  onMessage,
}: {
  detail: CaseDetail;
  admin: AdminNavUser;
  onChanged: () => void;
  onMessage?: (message: string, kind?: ToastKind) => void;
}) {
  const isAdmin = admin.role === "admin";
  const label = caseStatusLabel(detail.status, detail.currentAttestation?.attestationTypeName);
  const stepIndex = FLOW.indexOf(detail.status as (typeof FLOW)[number]);
  const hint =
    detail.status === "ATTESTATION"
      ? detail.currentAttestation
        ? `Current: ${detail.currentAttestation.attestationTypeName}`
        : "Attestations jari hain"
      : NEXT_STEP_HINTS[detail.status] || "";

  const deptUser =
    !isAdmin && adminCanAny(admin, ["office:printing:write", ATTESTATION_DEPT_PERMISSION, "office:courier:write"]);
  const showComplete = deptUser && (detail.status === "PRINTED" || detail.status === "ATTESTATION");

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      {isAdmin ? (
        <span onClick={(e) => e.stopPropagation()}>
          <CaseStatusSelect
            caseId={detail.id}
            status={detail.status}
            currentAttestationId={detail.currentAttestationId}
            attestations={detail.attestations}
            onChanged={onChanged}
            size="md"
          />
        </span>
      ) : (
        <span
          className={`inline-flex max-w-full items-center rounded-full px-3.5 py-2 text-sm font-bold ${caseStatusStyle(detail.status)}`}
        >
          <span className="truncate">{label}</span>
        </span>
      )}

      {detail.status !== "CANCELLED" && stepIndex >= 0 && (
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
          Step {stepIndex + 1} of {FLOW.length}
        </span>
      )}

      {hint && (
        <span className="inline-flex min-w-0 items-center gap-1 text-xs text-slate-500">
          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-400" />
          <span className="truncate">{hint}</span>
        </span>
      )}

      {showComplete && (
        <span className="ml-auto">
          <CompleteAttestationButton
            caseId={detail.id}
            reasonRequired
            onDone={onChanged}
            onMessage={onMessage}
          />
        </span>
      )}
    </div>
  );
}
