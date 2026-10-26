"use client";

import { useEffect } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";

// §W38 — admin / office page crash par khali "Application error" ki bajaye
// saaf paigham + dobara load. Naya deploy ho chuka ho (purani tab ke JS
// chunks ab nahi) to ek dafa khud reload. Wajah server par record
// (/api/office/client-errors → audit log) — page translate hua tha ya nahi bhi.
const CHUNK_ERROR = /ChunkLoadError|Loading chunk|dynamically imported module|Failed to fetch dynamically/i;
const RELOAD_KEY = "office:chunk-reload-at";

export default function SegmentError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    const html = document.documentElement;
    const translated =
      html.classList.contains("translated-ltr") ||
      html.classList.contains("translated-rtl") ||
      Boolean(document.querySelector("font[style*='vertical-align: inherit']"));
    try {
      void fetch("/api/office/client-errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: window.location.pathname + window.location.search,
          name: error?.name || "",
          message: error?.message || "",
          digest: error?.digest || "",
          translated,
        }),
        keepalive: true,
      }).catch(() => undefined);
    } catch {
      // report sirf tashkhees ke liye
    }

    if (!CHUNK_ERROR.test(`${error?.name} ${error?.message}`)) return;
    try {
      const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0);
      if (Date.now() - last < 30_000) return;
      sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    } catch {
      // storage band ho to bhi ek reload theek hai
    }
    window.location.reload();
  }, [error]);

  return (
    <div translate="no" className="notranslate flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-amber-100 text-amber-600">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Page mein masla aa gaya</h1>
        <p className="text-sm text-slate-600">
          Aap ka save hua kaam mehfooz hai. Page dobara load karein. Agar Chrome is page ka tarjuma (Translate) kar
          raha ho to us ko band rakhein.
        </p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-primary-700"
        >
          <RotateCw className="h-4 w-4" /> Dobara load karein
        </button>
      </div>
    </div>
  );
}
