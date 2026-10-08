"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

// §W12.3 — Ledger aur Finance merge ho gaye. Ye route sirf purane links ke
// liye hai: client-side redirect to /office/finance (404 nahi).
export default function OfficeLedgerRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/office/finance");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-primary-500" />
        Finance page par le ja rahe hain...
      </div>
    </div>
  );
}
