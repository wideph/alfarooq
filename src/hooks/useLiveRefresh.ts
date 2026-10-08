"use client";

import { useEffect, useRef } from "react";
import { OFFICE_CHANGED_EVENT } from "@/lib/office/live";

// §W11.5 — live refresh hook (websockets serverless par viable nahi, is liye
// polling + events):
//   - interval (default 15s) sirf jab tab visible ho,
//   - window "focus" par foran refresh,
//   - "office:changed" custom event (officeFetch mutations ke baad) par
//     300ms debounce ke saath refresh.
export function useLiveRefresh(
  refresh: () => void,
  opts?: { intervalMs?: number }
) {
  const intervalMs = opts?.intervalMs ?? 15000;

  // refresh ko ref mein rakhte hain taake listeners stale closure na pakrein
  // aur interval har render par reset na ho.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const run = () => refreshRef.current();

    const start = () => {
      if (interval || document.visibilityState !== "visible") return;
      interval = setInterval(run, intervalMs);
    };
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        start();
      } else {
        stop();
      }
    };
    const onFocus = () => run();
    const onChanged = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(run, 300);
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener(OFFICE_CHANGED_EVENT, onChanged);

    return () => {
      stop();
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(OFFICE_CHANGED_EVENT, onChanged);
    };
  }, [intervalMs]);
}
