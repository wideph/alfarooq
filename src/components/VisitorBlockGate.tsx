"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const BLOCKED_KEY = "bbte_visitor_blocked";

export default function VisitorBlockGate() {
  const pathname = usePathname();
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;

    const syncBlockedState = () => {
      setBlocked(localStorage.getItem(BLOCKED_KEY) === "true");
    };

    syncBlockedState();
    window.addEventListener("bbte-visitor-blocked", syncBlockedState);
    window.addEventListener("bbte-visitor-unblocked", syncBlockedState);
    window.addEventListener("storage", syncBlockedState);

    return () => {
      window.removeEventListener("bbte-visitor-blocked", syncBlockedState);
      window.removeEventListener("bbte-visitor-unblocked", syncBlockedState);
      window.removeEventListener("storage", syncBlockedState);
    };
  }, [pathname]);

  if (!blocked || pathname.startsWith("/admin")) return null;

  return (
    <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-950 px-4 text-white">
      <div className="max-w-md rounded-2xl border border-white/10 bg-white/10 p-6 text-center shadow-2xl">
        <h2 className="text-xl font-bold">Access blocked</h2>
        <p className="mt-3 text-sm leading-loose text-slate-200 urdu-text">
          Aap ka IP block hai. Admin unblock kare to website dobara use ho sakti hai.
        </p>
      </div>
    </div>
  );
}
