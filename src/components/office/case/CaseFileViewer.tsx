"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, X, ZoomIn, ZoomOut } from "lucide-react";
import { getPdfJs } from "@/lib/pdfjs";

// In-app viewer for office case files (R2 signed URLs) — image / pdf / video.
// Same look & feel as the public ImageViewer / PdfViewer, lekin ye directly
// signed URL se load karta hai (/api/media ke bajaye). Courier department
// printing + atta files isi mein dekhta hai (docs 06 §N7).

type PdfRenderTask = { promise: Promise<void>; cancel: () => void };
type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<{
    getViewport: (opts: { scale: number }) => { width: number; height: number };
    render: (opts: {
      canvasContext: CanvasRenderingContext2D;
      viewport: { width: number; height: number };
      transform?: number[];
    }) => PdfRenderTask;
  }>;
};

export type ViewableFile = {
  url: string;
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
          <button onClick={onClose} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Band karein">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-3 sm:p-4">
          {file.fileType === "image" && <ImageBody url={file.url} title={file.title} />}
          {file.fileType === "pdf" && <PdfBody url={file.url} />}
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

function PdfBody({ url }: { url: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const generationRef = useRef(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);

  useEffect(() => {
    let cancelled = false;
    canvasRefs.current = [];
    (async () => {
      try {
        setLoading(true);
        setError("");
        setPdfDoc(null);
        setNumPages(0);
        const pdfjs = await getPdfJs();
        let pdf: PdfDocument;
        try {
          pdf = (await pdfjs.getDocument({ url }).promise) as unknown as PdfDocument;
        } catch {
          const response = await fetch(url);
          if (!response.ok) throw new Error("PDF load nahi ho saki");
          const buffer = await response.arrayBuffer();
          pdf = (await pdfjs.getDocument({ data: new Uint8Array(buffer) }).promise) as unknown as PdfDocument;
        }
        if (cancelled) return;
        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "PDF load fail");
          setLoading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);

  const renderPages = useCallback(async () => {
    if (!pdfDoc || numPages === 0) return;
    const generation = ++generationRef.current;
    const width = Math.max((containerRef.current?.clientWidth || 360) - 16, 240);
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (generation !== generationRef.current) return;
      let canvas = canvasRefs.current[pageNum - 1];
      let attempts = 0;
      while (!canvas && attempts < 40) {
        await new Promise((r) => requestAnimationFrame(r));
        canvas = canvasRefs.current[pageNum - 1];
        attempts++;
      }
      if (!canvas) continue;
      try {
        const page = await pdfDoc.getPage(pageNum);
        const context = canvas.getContext("2d");
        if (!context) continue;
        const baseViewport = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: (width / baseViewport.width) * zoom });
        const outputScale = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        canvas.style.maxWidth = "100%";
        context.setTransform(1, 0, 0, 1, 0, 0);
        context.clearRect(0, 0, canvas.width, canvas.height);
        await page.render({
          canvasContext: context,
          viewport,
          transform: outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined,
        }).promise;
      } catch {
        // cancelled / failed page — baqi pages render hote rahein
      }
      if (pageNum === 1) setLoading(false);
    }
    setLoading(false);
  }, [pdfDoc, numPages, zoom]);

  useEffect(() => {
    void renderPages();
  }, [renderPages]);

  return (
    <div>
      <div className="mb-2 flex items-center justify-center gap-1">
        <button onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Zoom out">
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="min-w-[3rem] text-center text-xs text-slate-500">{Math.round(zoom * 100)}%</span>
        <button onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))} className="rounded-lg p-2 text-slate-600 hover:bg-slate-100" aria-label="Zoom in">
          <ZoomIn className="w-4 h-4" />
        </button>
        {numPages > 0 && <span className="px-2 text-xs text-slate-400">{numPages} page{numPages !== 1 ? "s" : ""}</span>}
      </div>
      <div ref={containerRef} className="max-h-[70vh] overflow-y-auto rounded-xl bg-slate-100 p-2">
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 text-slate-400">
            <Loader2 className="mb-2 w-7 h-7 animate-spin" />
            <p className="text-sm">PDF load ho rahi hai...</p>
          </div>
        )}
        {error && <p className="py-12 text-center text-sm text-red-500">{error}</p>}
        {!error && numPages > 0 && (
          <div className={`flex flex-col items-center gap-4 ${loading ? "hidden" : ""}`}>
            {Array.from({ length: numPages }, (_, index) => (
              <canvas
                key={index + 1}
                ref={(el) => {
                  canvasRefs.current[index] = el;
                }}
                className="rounded-lg shadow-md"
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
