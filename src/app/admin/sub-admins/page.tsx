"use client";

import AdminPageFrame from "@/components/admin/AdminPageFrame";
import { adminCanAny } from "@/components/admin/AdminNav";
import SubAdminPanel from "@/components/admin/SubAdminPanel";

export default function AdminSubAdminsPage() {
  return (
    <AdminPageFrame requiredAny={["admins:read", "admins:write"]}>
      {(admin) => (
        <SubAdminPanel
          defaultOpen
          canWrite={adminCanAny(admin, ["admins:write"])}
        />
      )}
    </AdminPageFrame>
  );
}
