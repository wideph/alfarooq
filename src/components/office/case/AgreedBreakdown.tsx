"use client";

import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/lib/office/client";

// §W56 — kul agreed amount: hover (title) ya click par upar chhota hisaab —
// asal (initial) agreed + har extra service ke charges. Services na hon to
// sirf raqam (pehle jaisa).
export default function AgreedBreakdown({
  total,
  servicesAmount,
  services,
  className = "",
}: {
  total: number;
  servicesAmount: number;
  services: Array<{ id: string; name: string; amount: number; status?: string }>;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);
  const active = services.filter((service) => !service.status || service.status === "ACTIVE");
  const initial = Math.round((total - servicesAmount) * 100) / 100;

  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (servicesAmount <= 0 || active.length === 0) return <span className={className}>{formatMoney(total)}</span>;

  const title = [
    `Initial agreed: ${formatMoney(initial)}`,
    ...active.map((service) => `${service.name}: ${formatMoney(service.amount)}`),
    `Kul: ${formatMoney(total)}`,
  ].join("\n");

  return (
    <span ref={ref} className="relative inline-block">
      <button
        type="button"
        title={title}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={`underline decoration-dotted underline-offset-2 ${className}`}
      >
        {formatMoney(total)}
      </button>
      {open && (
        <span
          role="tooltip"
          onClick={(event) => event.stopPropagation()}
          className="absolute bottom-full left-0 z-40 mb-1 block w-60 rounded-xl border border-slate-200 bg-white p-3 text-left text-xs font-normal text-slate-700 shadow-xl"
        >
          <span className="flex justify-between gap-2">
            <span>Initial agreed</span>
            <b>{formatMoney(initial)}</b>
          </span>
          {active.map((service) => (
            <span key={service.id} className="mt-1 flex justify-between gap-2">
              <span className="truncate">+ {service.name}</span>
              <b>{formatMoney(service.amount)}</b>
            </span>
          ))}
          <span className="mt-1.5 flex justify-between gap-2 border-t border-slate-100 pt-1.5">
            <span>Kul agreed</span>
            <b>{formatMoney(total)}</b>
          </span>
        </span>
      )}
    </span>
  );
}
