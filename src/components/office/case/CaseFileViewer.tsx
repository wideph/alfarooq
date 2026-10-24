"use client";

import { useState } from "react";
import { Download, FileText, X, ZoomIn, ZoomOut } from "lucide-react";

// In-app viewer for office case files (R2) — image / pdf / video (+ word /
// unknown → download card). Same look & feel as the public ImageViewer /
// PdfViewer. Courier department printing + atta files isi mein dekhta hai
// (docs 06 §N7).
//
// §W21: PDF body browser ke NATIVE renderer (iframe) se khulti hai — pdf.js
// build is stack mein reliably load nahi hota tha. Header mein Download button
// har file type ke liye (downloadUrl forced-download, fallback url).
// §W26: file urls ab stable same-origin links hain (taaza signed URL par
// redirect) — tab der tak khula rahe to bhi file expire/"kharab" nahi hoti.
// Image/video browser na chala sake (HEIC, .mov/HEVC, .mkv) to blank/toota
// player ke bajaye saaf paigham + Download.

export type ViewableFile = {
  url: string;
  // §W21: URL jo download force karta hai — na mile to url fallback.
  downloadUrl?: string | null;
  fileType: "pdf" | "image" | "video" | "word" | string;
  title: string;
  // Original file name (download ke liye) — title kabhi filename nahi (§W23).
  fileName?: string | null;
};

export default function CaseFileViewer({ file, onClose }: { file: ViewableFile; onClose: () => void }) {
  const downloadHref = file.downloadUrl || file.url;
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
              href={downloadHref}
              download={file.fileName || ""}
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
          {file.fileType === "image" ? (
            <ImageBody url={file.url} title={file.title} downloadHref={downloadHref} fileName={file.fileName} />
          ) : file.fileType === "pdf" ? (
            <PdfBody url={file.url} downloadHref={downloadHref} title={file.title} fileName={file.fileName} />
          ) : file.fileType === "video" ? (
            <VideoBody url={file.url} downloadHref={downloadHref} fileName={file.fileName} />
          ) : (
            <NoPreview
              downloadHref={downloadHref}
              fileName={file.fileName}
              message="Is file ka preview yahan nahi khulta — download kar ke dekhein."
            />
          )}
        </div>
      </div>
    </div>
  );
}

function NoPreview({ downloadHref, fileName, message }: { downloadHref: string; fileName?: string | null; message: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl bg-slate-50 px-4 py-10 text-center">
      <FileText className="h-10 w-10 text-slate-300" />
      <p className="text-sm text-slate-600">{message}</p>
      {fileName && <p className="break-all text-xs text-slate-400">{fileName}</p>}
      <a
        href={downloadHref}
        download={fileName || ""}
        className="inline-flex items-center gap-1.5 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-primary-700"
      >
        <Download className="h-4 w-4" /> Download karein
      </a>
    </div>
  );
}

function ImageBody({
  url,
  title,
  downloadHref,
  fileName,
}: {
  url: string;
  title: string;
  downloadHref: string;
  fileName?: string | null;
}) {
  const [scale, setScale] = useState(1);
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <NoPreview
        downloadHref={downloadHref}
        fileName={fileName}
        message="Browser ye image yahan nahi dikha saka (maslan HEIC format) — download kar ke dekhein."
      />
    );
  }
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
          onError={() => setFailed(true)}
          style={{ transform: `scale(${scale})`, transformOrigin: "center top" }}
          className="h-auto max-w-full rounded-lg shadow-md transition-transform duration-200"
        />
      </div>
    </div>
  );
}

function VideoBody({ url, downloadHref, fileName }: { url: string; downloadHref: string; fileName?: string | null }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <NoPreview
        downloadHref={downloadHref}
        fileName={fileName}
        message="Browser ye video format yahan play nahi kar saka — download kar ke dekhein (file theek hai)."
      />
    );
  }
  return (
    <video
      controls
      playsInline
      preload="metadata"
      onError={() => setFailed(true)}
      className="mx-auto max-h-[70vh] w-full rounded-xl bg-black"
      src={url}
    />
  );
}

function PdfBody({
  url,
  downloadHref,
  title,
  fileName,
}: {
  url: string;
  downloadHref: string;
  title: string;
  fileName?: string | null;
}) {
  // Browser ka built-in PDF viewer — koi worker/bundle dependency nahi.
  // Mobile browsers jahan inline PDF support na ho, wahan download link fallback hai.
  return (
    <div>
      <iframe src={url} title={title} className="h-[75vh] w-full rounded-lg border border-slate-200 bg-white" />
      <p className="mt-2 text-center text-xs text-slate-400">
        PDF nazar nahi aa rahi?{" "}
        <a href={downloadHref} download={fileName || ""} className="font-semibold text-primary-700 underline">
          Download karein
        </a>
      </p>
    </div>
  );
}
