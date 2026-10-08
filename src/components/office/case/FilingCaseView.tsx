"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Image as ImageIcon, Loader2, X } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import CaseFileViewer from "@/components/office/case/CaseFileViewer";
import CaseFilesCard from "@/components/office/case/CaseFilesCard";
import CaseRemarksCard from "@/components/office/case/CaseRemarksCard";
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
  const [message, setMessage] = useState("");
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
      <Link href="/office/cases?dept=filing" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-slate-800">
        <ArrowLeft className="w-4 h-4" /> Filing queue
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
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{detail.caseNumber}</p>
                <h2 className="text-xl font-bold text-slate-900">{detail.category?.name || "Case"}</h2>
                <p className="text-xs text-slate-400">Filing department view (limited)</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${STATUS_STYLES[detail.status] || "bg-slate-100 text-slate-700"}`}>
                {STATUS_LABELS[detail.status] || detail.status}
              </span>
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-[11px] font-semibold uppercase text-slate-400">R-number (roll)</dt>
                <dd className="text-slate-800">{detail.rollNumber || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase text-slate-400">Reg-number</dt>
                <dd className="text-slate-800">{detail.registrationNumber || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase text-slate-400">Category</dt>
                <dd className="text-slate-800">{detail.category?.name || "—"}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase text-slate-400">Set</dt>
                <dd className="text-slate-800">{detail.setName || "—"}</dd>
              </div>
              <div className="col-span-2">
                <dt className="text-[11px] font-semibold uppercase text-slate-400">Remarks</dt>
                <dd className="whitespace-pre-wrap text-slate-700">{detail.notes || "—"}</dd>
              </div>
              {detail.clientPictureUrl && (
                <div className="col-span-2">
                  <dt className="text-[11px] font-semibold uppercase text-slate-400">Client picture</dt>
                  <button onClick={() => setViewPicture(true)} className="mt-1 inline-flex items-center gap-2">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={detail.clientPictureUrl}
                      alt="Client"
                      className="h-24 w-24 rounded-xl border border-slate-200 object-cover hover:opacity-80"
                    />
                    <span className="inline-flex items-center gap-1 text-xs text-primary-700">
                      <ImageIcon className="w-3.5 h-3.5" /> Bari tasveer dekhein
                    </span>
                  </button>
                </div>
              )}
            </dl>
          </div>

          <CaseFilesCard
            detail={{ id: detail.id, category: detail.category, rollNumber: detail.rollNumber, setId: null, setName: detail.setName }}
            admin={admin}
            onReload={reload}
            onMessage={setMessage}
            departments={["FILING"]}
          />

          <CaseRemarksCard caseId={detail.id} admin={admin} onMessage={setMessage} onChanged={reload} />

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
