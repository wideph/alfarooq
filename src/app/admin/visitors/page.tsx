"use client";

import AdminPageFrame from "@/components/admin/AdminPageFrame";
import { adminCanAny } from "@/components/admin/AdminNav";
import VisitorTrackingPanel from "@/components/admin/VisitorTrackingPanel";

export default function AdminVisitorsPage() {
  return (
    <AdminPageFrame requiredAny={["visitors:read", "visitors:write"]}>
      {(admin) => (
        <VisitorTrackingPanel
          defaultOpen
          canWrite={adminCanAny(admin, ["visitors:write"])}
        />
      )}
    </AdminPageFrame>
  );
}
