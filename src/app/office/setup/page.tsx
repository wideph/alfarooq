"use client";

import { useState } from "react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";
import {
  AttestationTypesPanel,
  BookingOfficesPanel,
  CategoriesPanel,
  DatePoolPanel,
  HolidayPanel,
} from "@/components/office/SetupPanels";
import WorkingDayPanel from "@/components/office/WorkingDayPanel";
import DepartmentLinksPanel from "@/components/office/DepartmentLinksPanel";

export default function OfficeSetupPage() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const setMessage = (m: string, kind: ToastKind = "success") =>
    setToast(m ? { message: m, kind } : null);

  return (
    <OfficePageFrame requiredAny={["office:setup:write"]}>
      <div className="space-y-6">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Office Setup</h1>
          <p className="text-sm text-slate-500">
            Booking offices, un ke users / roles, categories aur attestation types yahan manage karein.
          </p>
        </div>
        <Toast toast={toast} onClose={() => setToast(null)} />
        <BookingOfficesPanel onMessage={setMessage} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CategoriesPanel onMessage={setMessage} />
          <AttestationTypesPanel onMessage={setMessage} />
        </div>
        <WorkingDayPanel onMessage={setMessage} />
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <HolidayPanel onMessage={setMessage} />
          <DatePoolPanel onMessage={setMessage} />
        </div>
        <DepartmentLinksPanel onMessage={setMessage} />
      </div>
    </OfficePageFrame>
  );
}
