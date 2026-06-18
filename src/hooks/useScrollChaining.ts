"use client";

import { useEffect, type RefObject } from "react";

/**
 * Touch devices par nested scroll ka classic "do baar swipe" masla theek karta hai.
 *
 * Jab tak andar wala element scroll ho sakta hai, browser ko natively scroll karne
 * dete hain (momentum barqarar rehta hai). Jaise hi andar ka scroll apni had (top/
 * bottom) par pahunchta hai, USI swipe mein page (window) scroll hona shuru ho jata
 * hai — dobara swipe karne ki zaroorat nahi.
 */
export function useScrollChaining(ref: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    let lastY = 0;

    const onTouchStart = (e: TouchEvent) => {
      lastY = e.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      const dy = lastY - y; // > 0 => neeche ki taraf scroll (content upar)
      lastY = y;
      if (dy === 0) return;

      const { scrollTop, scrollHeight, clientHeight } = el;
      const canScroll = scrollHeight > clientHeight + 1;
      const atTop = scrollTop <= 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;

      const pushingPastTop = dy < 0 && atTop;
      const pushingPastBottom = dy > 0 && atBottom;

      if (!canScroll || pushingPastTop || pushingPastBottom) {
        // Boundary par aa gaye — baaqi gesture page ko de do (same swipe).
        e.preventDefault();
        window.scrollBy(0, dy);
      }
      // warna: browser khud andar ka element scroll karega (momentum ke sath).
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
    };
  }, [ref]);
}
