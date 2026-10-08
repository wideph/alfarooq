"use client";

import { useState } from "react";
import AdminPageFrame from "@/components/admin/AdminPageFrame";
import { adminCanAny } from "@/components/admin/AdminNav";
import SiteSettingsPanel from "@/components/admin/SiteSettingsPanel";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";

export default function AdminSettingsPage() {
  const [toast, setToast] = useState<ToastData | null>(null);
  const setMessage = (m: string, kind: ToastKind = "success") =>
    setToast(m ? { message: m, kind } : null);

  return (
    <AdminPageFrame requiredAny={["settings:read", "settings:write"]}>
      {(admin) => (
        <>
          <Toast toast={toast} onClose={() => setToast(null)} />
          <SiteSettingsPanel
            defaultOpen
            canWrite={adminCanAny(admin, ["settings:write"])}
            onMessage={setMessage}
          />
        </>
      )}
    </AdminPageFrame>
  );
}
