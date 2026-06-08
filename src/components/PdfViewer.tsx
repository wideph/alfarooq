"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { ZoomIn, ZoomOut, Loader2 } from "lucide-react";
import { getPdfJs } from "@/lib/pdfjs";

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
    transform?: number[];
  }) => { promise: Promise<void> };
};

function getContainerWidth(el: HTMLElement | null, compact: boolean) {
  if (el?.clientWidth) return Math.max(el.clientWidth - 32, 240);
  if (typeof window !== "undefined") {
    return Math.max((compact ? window.innerWidth - 48 : window.innerWidth) - 64, 240);
  }
  return 320;
}

export default function PdfViewer({ filename, title, compact = false }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const [loading, setLoading] = useState(true);
  const [renderingMore, setRenderingMore] = useState(false);
  const [error, setError] = useState("");
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<PdfDocument | null>(null);
  const [containerWidth, setContainerWidth] = useState(320);

  useEffect(() => {
    void getPdfJs();
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;

    const update = () => setContainerWidth(getContainerWidth(el, compact));
    update();

    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact, loading]);

  const renderPageToCanvas = useCallback(
    async (
      pdf: PdfDocument,
      pageNum: number,
      canvas: HTMLCanvasElement,
      width: number,
      zoomMultiplier: number
    ) => {
      const page = await pdf.getPage(pageNum);
      const context = canvas.getContext("2d");
      if (!context) return;

      const baseViewport = page.getViewport({ scale: 1 });
      const fitScale = width / baseViewport.width;
      const scale = fitScale * zoomMultiplier;
      const viewport = page.getViewport({ scale });
      const outputScale = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
      const displayWidth = Math.min(viewport.width, width);
      const displayHeight = (displayWidth / viewport.width) * viewport.height;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(displayWidth)}px`;
      canvas.style.height = `${Math.floor(displayHeight)}px`;
      canvas.style.maxWidth = "100%";

      const transform =
        outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

      context.setTransform(1, 0, 0, 1, 0, 0);
      await page.render({ canvasContext: context, viewport, transform }).promise;
    },
    []
  );

  useEffect(() => {
    let cancelled = false;
    canvasRefs.current = [];

    async function loadPdf() {
      try {
        setLoading(true);
        setRenderingMore(false);
        setError("");
        setPdfDoc(null);
        setNumPages(0);

        const pdfjs = await getPdfJs();
        const response = await fetch(`/api/media/${encodeURIComponent(filename)}`);
        if (!response.ok) throw new Error("PDF load nahi ho saki");

        const buffer = await response.arrayBuffer();
        const pdf = (await pdfjs
          .getDocument({ data: new Uint8Array(buffer), disableAutoFetch: true })
          .promise) as unknown as PdfDocument;

        if (cancelled) return;

        setPdfDoc(pdf);
        setNumPages(pdf.numPages);
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
    if (!pdfDoc || numPages === 0) return;

    let cancelled = false;

    async function renderPages() {
      const width = containerWidth || getContainerWidth(containerRef.current, compact);
      const doc = pdfDoc!;

      for (let pageNum = 1; pageNum <= numPages; pageNum++) {
        if (cancelled) return;

        let canvas = canvasRefs.current[pageNum - 1];
        let attempts = 0;
        while (!canvas && attempts < 30) {
          await new Promise((r) => requestAnimationFrame(r));
          canvas = canvasRefs.current[pageNum - 1];
          attempts++;
        }
        if (!canvas) continue;

        await renderPageToCanvas(doc, pageNum, canvas, width, zoom);

        if (pageNum === 1) {
          setLoading(false);
          if (numPages > 1) setRenderingMore(true);
        }
      }

      if (!cancelled) setRenderingMore(false);
    }

    renderPages();
    return () => {
      cancelled = true;
    };
  }, [pdfDoc, numPages, zoom, containerWidth, compact, renderPageToCanvas]);

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();
  const maxHeight = compact ? "max-h-[45vh] sm:max-h-[50vh]" : "max-h-[65vh] sm:max-h-[75vh]";

  return (
    <div
      className="no-select no-download w-full max-w-full rounded-2xl overflow-hidden border border-slate-200 bg-slate-900 shadow-xl"
      onContextMenu={handleContextMenu}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 sm:py-3 bg-slate-800 text-white">
        <p className="text-xs sm:text-sm font-medium truncate flex-1 min-w-0">{title}</p>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setZoom((z) => Math.max(0.75, z - 0.25))}
            className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs px-1.5 min-w-[2.5rem] text-center">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => setZoom((z) => Math.min(2.5, z + 0.25))}
            className="p-2 rounded-lg hover:bg-slate-700 transition-colors"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          {numPages > 0 && (
            <span className="text-xs px-2 text-slate-300 whitespace-nowrap hidden sm:inline">
              {numPages} page{numPages !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className={`overflow-x-hidden overflow-y-auto ${maxHeight} p-2 sm:p-4 bg-slate-950`}
        onContextMenu={handleContextMenu}
      >
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 sm:py-16 text-slate-400">
            <Loader2 className="w-7 h-7 sm:w-8 sm:h-8 animate-spin mb-3" />
            <p className="text-sm">PDF load ho rahi hai...</p>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-center py-12 sm:py-16 text-red-400 px-4 text-center">
            <p className="text-sm break-words">{error}</p>
          </div>
        )}

        {!error && numPages > 0 && (
          <div className={`flex flex-col items-center gap-4 sm:gap-6 ${loading ? "hidden" : ""}`}>
            {Array.from({ length: numPages }, (_, index) => {
              const pageNum = index + 1;
              return (
                <div key={pageNum} className="w-full max-w-full flex flex-col items-center">
                  {numPages > 1 && (
                    <span className="text-xs text-slate-400 mb-2">
                      Page {pageNum} / {numPages}
                    </span>
                  )}
                  <canvas
                    ref={(el) => {
                      canvasRefs.current[index] = el;
                    }}
                    className="shadow-2xl max-w-full h-auto block"
                    onContextMenu={handleContextMenu}
                  />
                </div>
              );
            })}
          </div>
        )}

        {renderingMore && !loading && (
          <div className="flex items-center justify-center gap-2 py-3 text-slate-400 text-xs">
            <Loader2 className="w-4 h-4 animate-spin" />
            Baqi pages load ho rahi hain...
          </div>
        )}
      </div>

      <div className="px-3 sm:px-4 py-2 bg-slate-800 text-slate-400 text-[10px] sm:text-xs text-center">
        View-only mode — Download disabled
      </div>
    </div>
  );
}
