"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";

// §W34 — department tab se khole gaye case par user ke action se us
// department ka kaam mukammal ho gaya: chand second mein khud wapas usi tab
// par (Cases par nahi). "Yahin rahein" se ruk sakte hain (masalan aur proof
// add karna ho).
const SECONDS = 4;

export default function ReturnToOriginBanner({
  href,
  label,
  onStay,
}: {
  href: string;
  label: string;
  onStay: () => void;
}) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(SECONDS);
  const goneRef = useRef(false);

  const go = useCallback(() => {
    if (goneRef.current) return;
    goneRef.current = true;
    router.push(href);
  }, [href, router]);

  useEffect(() => {
    router.prefetch(href);
    const timer = setInterval(() => setSecondsLeft((value) => value - 1), 1000);
    return () => clearInterval(timer);
  }, [href, router]);

  useEffect(() => {
    if (secondsLeft <= 0) go();
  }, [secondsLeft, go]);

  return (
    <div role="status" className="fixed inset-x-0 bottom-4 z-[80] flex justify-center px-4">
      <div className="flex w-full max-w-xl flex-wrap items-center gap-2 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
        <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
        <span className="min-w-0 flex-1">
          Kaam mukammal — {Math.max(secondsLeft, 0)} second mein wapas <b>{label}</b> par
        </span>
        <button
          type="button"
          onClick={onStay}
          className="rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/10"
        >
          Yahin rahein
        </button>
        <button
          type="button"
          onClick={go}
          className="inline-flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900 hover:bg-slate-100"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Abhi jayen
        </button>
      </div>
    </div>
  );
}
