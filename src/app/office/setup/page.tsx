"use client";

import { useState } from "react";
import { X } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import {
  AttestationTypesPanel,
  BookingOfficesPanel,
  CategoriesPanel,
} from "@/components/office/SetupPanels";
import WorkingDayPanel from "@/components/office/WorkingDayPanel";

export default function OfficeSetupPage() {
  const [message, setMessage] = useState("");

  return (
    <OfficePageFrame requiredAny={["office:setup:write"]}>
      <div className="space-y-6">
        {message && (
          <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
            {message}
            <button onClick={() => setMessage("")}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <BookingOfficesPanel onMessage={setMessage} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CategoriesPanel onMessage={setMessage} />
          <AttestationTypesPanel onMessage={setMessage} />
        </div>
        <WorkingDayPanel onMessage={setMessage} />
      </div>
    </OfficePageFrame>
  );
}
