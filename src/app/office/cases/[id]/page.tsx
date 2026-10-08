"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, X } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import CaseHeader from "@/components/office/case/CaseHeader";
import CaseInfoCard from "@/components/office/case/CaseInfoCard";
import CaseMoneyCard from "@/components/office/case/CaseMoneyCard";
import CaseSetCard from "@/components/office/case/CaseSetCard";
import CaseFilesCard from "@/components/office/case/CaseFilesCard";
import CasePayments from "@/components/office/case/CasePayments";
import CaseAttestations from "@/components/office/case/CaseAttestations";
import CaseRemarksCard from "@/components/office/case/CaseRemarksCard";
import CaseDiscountCard from "@/components/office/case/CaseDiscountCard";
import CaseBonusCard from "@/components/office/case/CaseBonusCard";
import CaseContacts from "@/components/office/case/CaseContacts";
import CaseExpensesLedger from "@/components/office/case/CaseExpensesLedger";
import FilingCaseView from "@/components/office/case/FilingCaseView";
import { officeFetch } from "@/lib/office/client";
import type { CaseDetail } from "@/lib/office/types";

export default function CaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [detail, setDetail] = useState<CaseDetail | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const reload = useCallback(async () => {
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${id}`);
    if (res.ok) setDetail(res.data);
    else setError(res.error);
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <OfficePageFrame>
      {(admin) =>
        // §N7: filing department ko sirf limited card set milta hai (API ka
        // payload bhi stripped hai) — koi payment/money card nahi.
        admin.role === "filing" ? (
          <FilingCaseView id={id} admin={admin} />
        ) : (
          <div className="space-y-4">
            <Link href="/office/cases" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
              <ArrowLeft className="w-4 h-4" /> All cases
            </Link>

            {message && (
              <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
                {message}
                <button onClick={() => setMessage("")}>
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}
            {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

            {!detail ? (
              !error && (
                <div className="flex justify-center py-16">
                  <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
                </div>
              )
            ) : (
              <>
                <CaseHeader detail={detail} admin={admin} onUpdated={setDetail} onMessage={setMessage} />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <CaseInfoCard
                    key={detail.id + detail.clientName + detail.agreedAmount + (detail.courierNumber || "")}
                    detail={detail}
                    admin={admin}
                    onUpdated={setDetail}
                    onMessage={setMessage}
                  />
                  <CaseMoneyCard
                    key={`${detail.commissionAmount}-${detail.extraSharePercent}-${detail.claimedRemaining}-${detail.agreedAmountRemarks || ""}`}
                    detail={detail}
                    admin={admin}
                    onUpdated={setDetail}
                    onMessage={setMessage}
                  />
                </div>
                <CaseSetCard detail={detail} admin={admin} onReload={reload} onMessage={setMessage} />
                <CaseFilesCard detail={detail} admin={admin} onReload={reload} onMessage={setMessage} />
                <CasePayments detail={detail} admin={admin} onReload={reload} onUpdated={setDetail} onMessage={setMessage} />
                <CaseAttestations detail={detail} admin={admin} onUpdated={setDetail} onMessage={setMessage} />
                <CaseRemarksCard caseId={detail.id} admin={admin} onMessage={setMessage} onChanged={reload} />
                <CaseDiscountCard caseId={detail.id} admin={admin} onReload={reload} onMessage={setMessage} />
                <CaseBonusCard caseId={detail.id} admin={admin} onReload={reload} onMessage={setMessage} />
                <CaseContacts detail={detail} admin={admin} onReload={reload} onMessage={setMessage} />
                <CaseExpensesLedger detail={detail} admin={admin} onUpdated={setDetail} onMessage={setMessage} />
              </>
            )}
          </div>
        )
      }
    </OfficePageFrame>
  );
}
