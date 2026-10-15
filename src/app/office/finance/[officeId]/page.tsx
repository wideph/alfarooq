"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import { adminCanAny } from "@/components/admin/AdminNav";
import OfficeLedgerDetail from "@/components/office/finance/OfficeLedgerDetail";

// /office/finance/[officeId] — ADMIN-only office ledger detail. Booking-office
// users apna hisaab /office/finance par dekhte hain — unhe redirect.
export default function OfficeFinanceLedgerPage() {
  const params = useParams<{ officeId: string }>();
  const officeId = typeof params?.officeId === "string" ? params.officeId : "";

  return (
    <OfficePageFrame requiredAny={["office:finance:read", "office:ledger:read", "office:cases:read"]}>
      {(admin) =>
        admin.role === "booking_office" ? (
          <RedirectToFinance />
        ) : adminCanAny(admin, ["office:finance:read", "office:ledger:read"]) ? (
          officeId ? (
            <OfficeLedgerDetail officeId={officeId} />
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
              Office nahi mila
            </div>
          )
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
            Is page ke liye permission zaroori hai
          </div>
        )
      }
    </OfficePageFrame>
  );
}

function RedirectToFinance() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/office/finance");
  }, [router]);
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-slate-500">
      Finance page par le ja rahe hain…
    </div>
  );
}
