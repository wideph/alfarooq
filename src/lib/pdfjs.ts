import { installPdfPolyfills } from "@/lib/pdf-polyfills";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsPromise: Promise<PdfJsModule> | null = null;

export async function getPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      installPdfPolyfills();
      const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
      pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      return pdfjs;
    })();
  }
  return pdfjsPromise;
}
