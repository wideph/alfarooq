"use client";

import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";

export type ToastKind = "success" | "error" | "info";

export type ToastData = {
  message: string;
  kind: ToastKind;
};

const AUTO_DISMISS_MS = 4000;

const KIND_STYLES: Record<ToastKind, { box: string; icon: typeof Info }> = {
  success: {
    box: "border-emerald-200 bg-emerald-50 text-emerald-800",
    icon: CheckCircle2,
  },
  error: {
    box: "border-red-200 bg-red-50 text-red-700",
    icon: XCircle,
  },
  info: {
    box: "border-slate-200 bg-white text-slate-700",
    icon: Info,
  },
};

// Single toast: 4s auto-dismiss; hover par timer pause, hover hatne par
// bacha hua time se resume. Close button hamesha mojood.
function ToastItem({
  toast,
  onClose,
}: {
  toast: ToastData;
  onClose: () => void;
}) {
  const [progress, setProgress] = useState(100);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const endAtRef = useRef<number>(Date.now() + AUTO_DISMISS_MS);
  const remainingRef = useRef<number>(AUTO_DISMISS_MS);

  useEffect(() => {
    endAtRef.current = Date.now() + remainingRef.current;
    timerRef.current = setTimeout(onClose, remainingRef.current);
    const tick = setInterval(() => {
      const left = Math.max(0, endAtRef.current - Date.now());
      setProgress((left / AUTO_DISMISS_MS) * 100);
    }, 100);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      clearInterval(tick);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pause() {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    remainingRef.current = Math.max(0, endAtRef.current - Date.now());
  }

  function resume() {
    if (timerRef.current || remainingRef.current <= 0) return;
    endAtRef.current = Date.now() + remainingRef.current;
    timerRef.current = setTimeout(onClose, remainingRef.current);
  }

  const style = KIND_STYLES[toast.kind];
  const Icon = style.icon;

  return (
    <div
      role="status"
      onMouseEnter={pause}
      onMouseLeave={resume}
      className={`pointer-events-auto relative w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border shadow-lg ${style.box}`}
    >
      <div className="flex items-start gap-2.5 px-4 py-3">
        <Icon className="mt-0.5 h-5 w-5 shrink-0" />
        <p className="flex-1 text-sm font-medium leading-snug">{toast.message}</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Band karein"
          className="shrink-0 rounded-md p-0.5 opacity-60 transition-opacity hover:opacity-100"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        className="h-0.5 bg-current opacity-30 transition-[width] duration-100 ease-linear"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

// Popup toast — fixed top-right stack. Usage: <Toast toast={toast} onClose={clear} />
export default function Toast({
  toast,
  onClose,
}: {
  toast: ToastData | null;
  onClose: () => void;
}) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed right-4 top-4 z-[100] flex flex-col items-end gap-2">
      <ToastItem key={`${toast.kind}:${toast.message}`} toast={toast} onClose={onClose} />
    </div>
  );
}
