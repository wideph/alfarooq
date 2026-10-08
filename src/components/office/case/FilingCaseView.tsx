"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Image as ImageIcon, Info } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";
import SectionCard from "@/components/ui/SectionCard";
import { SkeletonRows } from "@/components/ui/Skeleton";
import CaseFileViewer from "@/components/office/case/CaseFileViewer";
import CaseFilesTab from "@/components/office/case/CaseFilesTab";
import CaseRemarksTab from "@/components/office/case/CaseRemarksTab";
import { officeFetch } from "@/lib/office/client";
import { STATUS_LABELS, STATUS_STYLES } from "@/lib/office/labels";
import type { FilingCaseDetail } from "@/lib/office/types";

// docs 06 §N7 — filing department ka limited view: SIRF category, r-number,
// reg-number, remarks, client picture, status, filing files aur department
// remarks. Payments / agreed amount / commission / ledger kabhi nahi (API
// payload bhi stripped hai — serializeFilingCase).
export default function FilingCaseView({ id, admin }: { id: string; admin: AdminNavUser }) {
  const [detail, setDetail] = useState<FilingCaseDetail | null>(null);
  const [error, setError] = useState("");
  const [toast, setToast] = useState<ToastData | null>(null);
  const setMessage = (m: string, kind: ToastKind = "success") =>
    setToast(m ? { message: m, kind } : null);
  const [viewPicture, setViewPicture] = useState(false);

  const reload = useCallback(async () => {
    const res = await officeFetch<FilingCaseDetail>(`/api/office/cases/${id}`);
    if (res.ok) setDetail(res.data);
    else setError(res.error);
  }, [id]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-4">
      <Toast toast={toast} onClose={() => setToast(null)} />

      {detail && (
        <div className="sticky top-16 z-30 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <Link
              href="/office/cases?dept=filing"
              aria-label="Filing queue"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-primary-300 hover:text-primary-700"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{detail.caseNumber}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[detail.status] || "bg-slate-100 text-slate-700"}`}>
                  {STATUS_LABELS[detail.status] || detail.status}
                </span>
              </div>
              <h1 className="truncate text-base font-bold leading-tight text-slate-900">
                {detail.category?.name || "Case"}
                <span className="ml-2 text-[11px] font-normal text-slate-400">Filing department view (limited)</span>
              </h1>
            </div>
          </div>
        </div>
      )}

      {!detail && <Link href="/office/cases?dept=filing" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800"><ArrowLeft className="h-4 w-4" /> Filing queue</Link>}

      {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

      {!detail ? (
        !error && <SkeletonRows rows={5} />
      ) : (
        <>
          <SectionCard icon={Info} title="Case details">
            <div className="flex flex-col gap-4 sm:flex-row">
              {detail.clientPictureUrl && (
                <button onClick={() => setViewPicture(true)} className="shrink-0 self-start" title="Bari tasveer dekhein">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={detail.clientPictureUrl}
                    alt="Client"
                    className="h-24 w-24 rounded-xl border border-slate-200 object-cover transition hover:opacity-80"
                  />
                  <span className="mt-1 inline-flex items-center gap-1 text-xs text-primary-700">
                    <ImageIcon className="h-3.5 w-3.5" /> Bari tasveer dekhein
                  </span>
                </button>
              )}
              <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">R-number (roll)</dt>
                  <dd className="truncate text-slate-800">{detail.rollNumber || "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Reg-number</dt>
                  <dd className="truncate text-slate-800">{detail.registrationNumber || "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Category</dt>
                  <dd className="truncate text-slate-800">{detail.category?.name || "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Set</dt>
                  <dd className="truncate text-slate-800">{detail.setName || "—"}</dd>
                </div>
                <div className="col-span-2">
                  <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Remarks</dt>
                  <dd className="whitespace-pre-wrap text-slate-700">{detail.notes || "—"}</dd>
                </div>
              </dl>
            </div>
          </SectionCard>

          <CaseFilesTab
            detail={{ id: detail.id, caseNumber: detail.caseNumber, category: detail.category, rollNumber: detail.rollNumber, setId: null, setName: detail.setName }}
            admin={admin}
            onReload={reload}
            onMessage={setMessage}
            departments={["FILING"]}
          />

          <CaseRemarksTab caseId={detail.id} admin={admin} onMessage={setMessage} onChanged={reload} />

          {viewPicture && detail.clientPictureUrl && (
            <CaseFileViewer
              file={{ url: detail.clientPictureUrl, fileType: "image", title: `Client picture — ${detail.caseNumber}` }}
              onClose={() => setViewPicture(false)}
            />
          )}
        </>
      )}
    </div>
  );
}
