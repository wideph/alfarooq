"use client";

import { useState } from "react";
import { Download, X, ZoomIn, ZoomOut } from "lucide-react";

// In-app viewer for office case files (R2 signed URLs) — image / pdf / video.
// Same look & feel as the public ImageViewer / PdfViewer, lekin ye directly
// signed URL se load karta hai (/api/media ke bajaye). Courier department
// printing + atta files isi mein dekhta hai (docs 06 §N7).
//
// §W21: PDF body ab pdf.js canvas ke bajaye browser ke NATIVE renderer
// (iframe) se khulti hai — pdf.js build is stack mein reliably load nahi
// hota tha ("pdf in-app view nahi hoti"). Header mein Download button har
// file type ke liye (downloadUrl signed/forced-download, fallback url).

export type ViewableFile = {
  url: string;
  // §W21: signed URL jo download force karta hai — na mile to url fallback.
  downloadUrl?: string | null;
  fileType: "pdf" | "image" | "video";
  title: string;
};

export default function CaseFileViewer({ file, onClose }: { file: ViewableFile; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-3 sm:p-6" onClick={onClose}>
      <div
        className="max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-4 py-3">
          <p className="truncate text-sm font-semibold text-slate-800">{file.title}</p>
          <div className="flex shrink-0 items-center gap-1">
            <a
              href={file.downloadUrl || file.url}
              download={file.title || true}
              title={`Download — ${file.title}`}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-primary-700"
            >
              <Download className="w-4 h-4" /> Download
            </a>
            <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Band karein">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <div className="p-3 sm:p-4">
          {file.fileType === "image" && <ImageBody url={file.url} title={file.title} />}
          {file.fileType === "pdf" && <PdfBody url={file.url} downloadUrl={file.downloadUrl} title={file.title} />}
          {file.fileType === "video" && (
            <video controls className="mx-auto max-h-[70vh] w-full rounded-xl bg-black" src={file.url} />
          )}
        </div>
      </div>
    </div>
  );
}

function ImageBody({ url, title }: { url: string; title: string }) {
  const [scale, setScale] = useState(1);
  return (
    <div>
      <div className="mb-2 flex items-center justify-center gap-1">
        <button onClick={() => setScale((s) => Math.max(0.5, s - 0.25))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Zoom out">
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="min-w-[3rem] text-center text-xs text-slate-500">{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(3, s + 0.25))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>
      <div className="flex max-h-[70vh] justify-center overflow-auto rounded-xl bg-slate-50 p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={title}
          style={{ transform: `scale(${scale})`, transformOrigin: "center top" }}
          className="h-auto max-w-full rounded-lg shadow-md transition-transform duration-200"
        />
      </div>
    </div>
  );
}

function PdfBody({ url, downloadUrl, title }: { url: string; downloadUrl?: string | null; title: string }) {
  // Browser ka built-in PDF viewer — koi worker/bundle dependency nahi.
  // Mobile browsers jahan inline PDF support na ho, wahan download link fallback hai.
  return (
    <div>
      <iframe src={url} title={title} className="h-[75vh] w-full rounded-lg border border-slate-200 bg-white" />
      <p className="mt-2 text-center text-xs text-slate-400">
        PDF nazar nahi aa rahi?{" "}
        <a
          href={downloadUrl || url}
          download={title || true}
          className="font-semibold text-primary-700 underline"
        >
          Download karein
        </a>
      </p>
    </div>
  );
}
