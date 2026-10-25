"use client";

import type { Dispatch, SetStateAction } from "react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import type { ToastKind } from "@/components/Toast";
import CaseOverviewTab from "@/components/office/case/CaseOverviewTab";
import CaseAttestationsTab from "@/components/office/case/CaseAttestationsTab";
import CaseFilesTab from "@/components/office/case/CaseFilesTab";
import CaseRemarksTab from "@/components/office/case/CaseRemarksTab";
import DeptCommissionsAttached from "@/components/office/case/DeptCommissionsAttached";
import type { CaseDetail } from "@/lib/office/types";

// §W36 — printing / attestation / courier worker ka case detail: tabs ki
// bajaye EK hi page par sections (us ke liye zaroori maloomat thori hai).
// Koi raqam nahi (API bhi strip karta hai): Payments tab nahi, Overview ka
// money summary nahi, History/Finance mein se sirf is case par apna commission.
// `case-section-<tab>` ids — warning strip ke "tab kholo" links yahin scroll
// karte hain (scroll-mt: sticky header ke neeche na chhupe).
export default function DeptWorkerCaseSections({
  detail,
  admin,
  onUpdated,
  onReload,
  onMessage,
  pendingReasons,
  setPendingReasons,
}: {
  detail: CaseDetail;
  admin: AdminNavUser;
  onUpdated: (next: CaseDetail) => void;
  onReload: () => Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
  pendingReasons: string[];
  setPendingReasons: Dispatch<SetStateAction<string[]>>;
}) {
  return (
    <div className="space-y-4">
      <section id="case-section-overview" className="scroll-mt-40">
        <CaseOverviewTab
          variant="dept"
          detail={detail}
          admin={admin}
          onUpdated={onUpdated}
          onReload={onReload}
          onMessage={onMessage}
        />
      </section>
      <section id="case-section-attestations" className="scroll-mt-40">
        <CaseAttestationsTab
          detail={detail}
          admin={admin}
          onUpdated={onUpdated}
          onReload={onReload}
          onMessage={onMessage}
          pendingReasons={pendingReasons}
          setPendingReasons={setPendingReasons}
        />
      </section>
      <section id="case-section-files" className="scroll-mt-40">
        <CaseFilesTab detail={detail} admin={admin} onReload={onReload} onMessage={onMessage} />
      </section>
      <section id="case-section-remarks" className="scroll-mt-40">
        <CaseRemarksTab caseId={detail.id} admin={admin} onMessage={onMessage} onChanged={onReload} />
      </section>
      <section id="case-section-history" className="scroll-mt-40">
        <DeptCommissionsAttached detail={detail} variant="own" />
      </section>
    </div>
  );
}
