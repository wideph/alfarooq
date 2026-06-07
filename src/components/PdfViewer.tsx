"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ZoomIn, ZoomOut, Loader2 } from "lucide-react";

interface PdfViewerProps {
  filename: string;
  title: string;
  compact?: boolean;
}

type PdfDocument = {
  numPages: number;
  getPage: (n: number) => Promise<PdfPage>;
};

type PdfPage = {
  getViewport: (opts: { scale: number }) => { width: number; height: number };
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};

export default function PdfViewer({ filename, title, compact = false }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);

  const renderPageToCanvas = useCallback(
    async (pdf: PdfDocument, pageNum: number, zoom: number, canvas: HTMLCanvasElement) => {
      const page = await pdf.getPage(pageNum);
      const context = canvas.getContext("2d");
      if (!context) return;

      const viewport = page.getViewport({ scale: zoom });
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;

      await page.render({ canvasContext: context, viewport }).promise;
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    canvasRefs.current = [];

    async function loadPdf() {
      try {
        setLoading(true);
        setError("");
        setPdfDoc(null);
        setNumPages(0);

        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

        const response = await fetch(`/api/media/${encodeURIComponent(filename)}`);
        if (!response.ok) throw new Error("PDF load nahi ho saki");

        const arrayBuffer = await response.arrayBuffer();
        const pdf = (await pdfjs.getDocument({ data: arrayBuffer }).promise) as unknown as PdfDocument;

        if (cancelled) return;

        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "PDF load fail");
          setLoading(false);
        }
      }
    }

    loadPdf();
    return () => {
      cancelled = true;
    };
  }, [filename]);

  useEffect(() => {
    if (!pdfDoc || loading || numPages === 0) return;

    let cancelled = false;

    async function renderAllPages() {
      if (!pdfDoc) return;
      const doc = pdfDoc;
      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (cancelled) return;

        let canvas = canvasRefs.current[pageNum - 1];
        let attempts = 0;

        while (!canvas && attempts < 20) {
          await new Promise((r) => requestAnimationFrame(r));
          canvas = canvasRefs.current[pageNum - 1];
          attempts++;
        }

        if (!canvas) continue;
        await renderPageToCanvas(doc, pageNum, scale, canvas);
      }
    }

    renderAllPages();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, numPages, scale, loading, renderPageToCanvas]);

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();
  const maxHeight = compact ? "max-h-[50vh]" : "max-h-[70vh] sm:max-h-[75vh]";

  return (
    <div
      className="no-select no-download rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-xl"
      onContextMenu={handleContextMenu}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-slate-800 text-white">
        <p className="text-sm font-medium truncate flex-1">{title}</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs px-2 min-w-[3rem] text-center">{Math.round(scale * 100)}%</span>
          <button
            onClick={() => setScale((s) => Math.min(3, s + 0.25))}
            className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          {numPages > 0 && (
            <span className="text-xs px-2 ml-2 text-slate-300 whitespace-nowrap">
              {numPages} page{numPages !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className={`overflow-auto ${maxHeight} p-4 bg-slate-950`}
        onContextMenu={handleContextMenu}
      >
        {loading && (
          <div className="flex flex-col items-center justify-center py-16 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">PDF load ho rahi hai...</p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-16 text-red-400 px-4 text-center">
            <p className="text-sm">{error}</p>
          </div>
        )}

        {!loading && !error && numPages > 0 && (
          <div className="flex flex-col items-center gap-6">
            {Array.from({ length: numPages }, (_, index) => {
              const pageNum = index + 1;
              return (
                <div key={pageNum} className="w-full flex flex-col items-center">
                  {numPages > 1 && (
                    <span className="text-xs text-slate-400 mb-2">
                      Page {pageNum} / {numPages}
                    </span>
                  )}
                  <canvas
                    ref={(el) => {
                      canvasRefs.current[index] = el;
                    }}
                    className="shadow-2xl max-w-full h-auto"
                    onContextMenu={handleContextMenu}
                  />
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="px-4 py-2 bg-slate-800 text-slate-400 text-xs text-center">
        View-only mode — Download disabled for content protection
      </div>
    </div>
  );
}
