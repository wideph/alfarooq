"use client";

import { useState } from "react";
import AdminPageFrame from "@/components/admin/AdminPageFrame";
import { adminCanAny } from "@/components/admin/AdminNav";
import SiteSettingsPanel from "@/components/admin/SiteSettingsPanel";

export default function AdminSettingsPage() {
  const [message, setMessage] = useState("");

  return (
    <AdminPageFrame requiredAny={["settings:read", "settings:write"]}>
      {(admin) => (
        <>
          {message && (
            <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">
              {message}
            </div>
          )}
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
