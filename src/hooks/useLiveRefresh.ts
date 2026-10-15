"use client";

import { useEffect, useRef } from "react";
import { OFFICE_CHANGED_EVENT } from "@/lib/office/live";

// §W11.5 — live refresh hook (websockets serverless par viable nahi, is liye
// polling + events):
//   - interval (default 15s) sirf jab tab visible ho,
//   - window "focus" par foran refresh,
//   - "office:changed" custom event (officeFetch mutations ke baad) par
//     300ms debounce ke saath refresh.
// §W20 (P2):
//   - immediate: mount par refresh ek dafa foran bhi chalao (default FALSE —
//     zyada tar pages apna initial load khud karti hain, double-fetch na ho).
//     Nav badges jaise hook-only data ke liye zaroori (warna count bina
//     click/focus ke khali rehta tha).
//   - in-flight dedup: refresh promise return kare to pichla trigger abhi
//     chal raha ho to naya trigger skip — mutation ke baad interval/focus/
//     office:changed ke overlapping bursts se same endpoint par double
//     fetch nahi hota.
export function useLiveRefresh(
  refresh: () => void | Promise<unknown>,
  opts?: { intervalMs?: number; immediate?: boolean }
) {
  const intervalMs = opts?.intervalMs ?? 15000;
  const immediate = opts?.immediate ?? false;

  // refresh ko ref mein rakhte hain taake listeners stale closure na pakrein
  // aur interval har render par reset na ho.
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  }, [refresh]);

  // Per-hook-instance in-flight fetch (promise jab tak resolve na ho).
  const inFlightRef = useRef<Promise<unknown> | null>(null);
  // StrictMode dev mein mount effect setup→cleanup→setup chalta hai; ref
  // persist rehta hai, is liye immediate har mount par sirf ek dafa fire hota
  // hai (genuine remount par naya ref → dobara fire, wahi chahte hain).
  const immediateFiredRef = useRef(false);

  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    // §W20-R5 (review #1/#2): hung fetch na to in-flight ref hamesha ke liye
    // band ho jata hai, na hi mutation ke doran in-flight trigger kho jata hai.
    // Is liye: (a) 45s timeout baad ref force-clear, (b) in-flight ke doran aya
    // trigger "queued" mark hota hai aur fetch khatam hote hi ek dafa dobara
    // chalta hai (pre-mutation stale data render hone se bachao).
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    let queued = false;

    const clearWatchdog = () => {
      if (watchdog) {
        clearTimeout(watchdog);
        watchdog = null;
      }
    };

    const run = () => {
      if (inFlightRef.current) {
        // Fetch chal raha hai — is trigger ko yaad rakho, finally mein chalayenge.
        queued = true;
        return;
      }
      const result = refreshRef.current();
      if (result && typeof (result as Promise<unknown>).then === "function") {
        const pending = Promise.resolve(result)
          .catch(() => {})
          .finally(() => {
            if (inFlightRef.current !== pending) return;
            inFlightRef.current = null;
            clearWatchdog();
            if (queued) {
              queued = false;
              run();
            }
          });
        inFlightRef.current = pending;
        clearWatchdog();
        watchdog = setTimeout(() => {
          // Hung request (stalled connection) — hook ko zinda rakho.
          if (inFlightRef.current === pending) inFlightRef.current = null;
        }, 45_000);
      }
    };

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

    if (immediate && !immediateFiredRef.current) {
      immediateFiredRef.current = true;
      run();
    }
    start();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("focus", onFocus);
    window.addEventListener(OFFICE_CHANGED_EVENT, onChanged);

    return () => {
      stop();
      clearWatchdog();
      if (debounce) clearTimeout(debounce);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener(OFFICE_CHANGED_EVENT, onChanged);
    };
  }, [intervalMs, immediate]);
}
