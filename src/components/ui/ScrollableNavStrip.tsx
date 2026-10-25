"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

// §W33 — navbar ki links ki patti jo HAMESHA poori scroll hoti hai.
// Pehle andar wali flex patti `justify-center` thi: jab links jagah se zyada
// hon to wo dono taraf se bahar nikalti thi aur BAAYEN wala hissa scroll se
// kabhi nahi pohnchta tha (shuru aur aakhir ke options chhup jate the), upar se
// scrollbar bhi hidden tha. Ab:
//   - `mx-auto w-max` safe centering: jagah ho to beech mein, na ho to baayen
//     se shuru aur poora scroll;
//   - jis taraf aur links hon wahan ‹ › button + halka fade;
//   - mouse wheel (upar/neeche) se bhi side scroll;
//   - khula hua page (aria-current="page") khud nazar mein aa jata hai.
export default function ScrollableNavStrip({ children, label = "Navigation" }: { children: ReactNode; label?: string }) {
  const ref = useRef<HTMLElement | null>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const update = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 2);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    update();
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(update) : null;
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);

    // Mouse wheel (vertical) → side scroll, sirf jab nav scroll ho sakta ho.
    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
      const max = el.scrollWidth - el.clientWidth;
      if (max <= 0) return;
      const next = Math.min(Math.max(el.scrollLeft + event.deltaY, 0), max);
      if (next === el.scrollLeft) return;
      event.preventDefault();
      el.scrollLeft = next;
    };
    el.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      el.removeEventListener("scroll", update);
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", update);
      observer?.disconnect();
    };
  }, [update]);

  // Khula hua page nazar mein — SIRF jab active link badle (badge refresh
  // waghera ke re-render par user ka scroll wapas na kheenche).
  const lastActiveRef = useRef<string | null>(null);
  useEffect(() => {
    const el = ref.current;
    const active = el?.querySelector<HTMLElement>('[aria-current="page"]');
    const key = active?.getAttribute("href") ?? null;
    if (!el || !active || key === lastActiveRef.current) return;
    lastActiveRef.current = key;
    const left = active.offsetLeft - el.clientWidth / 2 + active.offsetWidth / 2;
    el.scrollTo({ left: Math.max(left, 0) });
    update();
  });

  const scrollByPage = (direction: 1 | -1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.7, 160), behavior: "smooth" });
  };

  return (
    <div className="relative min-w-0 flex-1">
      {canLeft && (
        <>
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-10 bg-gradient-to-r from-white to-transparent" />
          <button
            type="button"
            aria-label="Peeche ke options"
            onClick={() => scrollByPage(-1)}
            className="absolute left-0 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-200 hover:text-primary-700"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        </>
      )}
      <nav
        ref={ref}
        aria-label={label}
        className="overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* py-1.5: count bubbles (-top-1) clip na hon */}
        <div className="mx-auto flex w-max items-center gap-1.5 px-1 py-1.5">{children}</div>
      </nav>
      {canRight && (
        <>
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-10 bg-gradient-to-l from-white to-transparent" />
          <button
            type="button"
            aria-label="Aage ke options"
            onClick={() => scrollByPage(1)}
            className="absolute right-0 top-1/2 z-20 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full bg-white text-slate-600 shadow ring-1 ring-slate-200 hover:text-primary-700"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </>
      )}
    </div>
  );
}
