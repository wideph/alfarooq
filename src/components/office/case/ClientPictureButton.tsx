"use client";

import { useState } from "react";
import { Download, Eye, FileText } from "lucide-react";
import CaseFileViewer from "@/components/office/case/CaseFileViewer";

// §W58 — client info ki tasveer: chhota thumbnail + "Dekhein" (viewer, zoom +
// Download) + "Download". Stable same-origin link (/client-picture) — har
// click par taaza signed URL, is liye kabhi expire nahi hoti. Filing queue,
// filing view, department view aur case overview sab yahi use karte hain.
export function clientPictureHref(caseId: string, download = false, version?: string | null) {
  const query = new URLSearchParams();
  if (download) query.set("download", "1");
  // Tasveer badle to naya link — browser ki purani cached tasveer nahi.
  if (version) query.set("v", version);
  const text = query.toString();
  return `/api/office/cases/${caseId}/client-picture${text ? `?${text}` : ""}`;
}

export default function ClientPictureButton({
  caseId,
  caseNumber,
  fileType,
  version,
  size = "md",
}: {
  caseId: string;
  caseNumber: string;
  // "image" | "pdf" (Case.clientPictureType); null → image samjho.
  fileType?: string | null;
  // Server ka clientPictureVersion (tasveer badalne par badalta hai).
  version?: string | null;
  // sm: queue row (chhota); md: detail card.
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  // Tasveer load na ho (HEIC waghera) → icon; naya version aaye to dobara koshish.
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const isPdf = fileType === "pdf";
  const url = clientPictureHref(caseId, false, version);
  const downloadUrl = clientPictureHref(caseId, true, version);
  const broken = brokenUrl === url;
  const box = size === "sm" ? "h-12 w-12" : "h-24 w-24";
  const button =
    "inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:border-primary-300 hover:text-primary-700";

  return (
    <div
      className={`flex ${size === "sm" ? "items-center gap-2" : "flex-col gap-1.5"}`}
      // Queue row ka click (case kholna) yahan se trigger na ho.
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Client picture bari dekhein"
        className={`${box} shrink-0 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition hover:opacity-80`}
      >
        {isPdf || broken ? (
          <span className="flex h-full w-full flex-col items-center justify-center gap-0.5 text-slate-400">
            <FileText className={size === "sm" ? "h-5 w-5" : "h-8 w-8"} />
            <span className="text-[9px] font-bold">{isPdf ? "PDF" : "Tasveer"}</span>
          </span>
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={`Client picture — ${caseNumber}`}
            loading="lazy"
            onError={() => setBrokenUrl(url)}
            className="h-full w-full object-cover"
          />
        )}
      </button>
      <div className={`flex ${size === "sm" ? "flex-col" : "flex-wrap"} gap-1`}>
        {size === "sm" && <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Client picture</span>}
        <div className="flex flex-wrap gap-1">
          <button type="button" onClick={() => setOpen(true)} className={button}>
            <Eye className="h-3.5 w-3.5" /> Dekhein
          </button>
          <a href={downloadUrl} download className={button} title={`Client picture download — ${caseNumber}`}>
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        </div>
      </div>
      {open && (
        <CaseFileViewer
          file={{ url, downloadUrl, fileType: isPdf ? "pdf" : "image", title: `Client picture — ${caseNumber}` }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
