"use client";

import { useEffect, useState } from "react";
import AdminPageFrame from "@/components/admin/AdminPageFrame";
import { adminCanAny } from "@/components/admin/AdminNav";
import BotAdminPanel from "@/components/admin/BotAdminPanel";

type CourseOption = { id: string; title: string };

export default function AdminBotPage() {
  const [courses, setCourses] = useState<CourseOption[]>([]);

  useEffect(() => {
    fetch("/api/courses?admin=true")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) =>
        setCourses(
          Array.isArray(data)
            ? data.map((course) => ({ id: course.id, title: course.title }))
            : []
        )
      )
      .catch(() => {});
  }, []);

  return (
    <AdminPageFrame
      requiredAny={[
        "botTraining:read",
        "botTraining:write",
        "botChats:read",
        "botChats:write",
      ]}
    >
      {(admin) => (
        <BotAdminPanel
          courses={courses}
          defaultOpen
          canTrainingRead={adminCanAny(admin, ["botTraining:read", "botTraining:write"])}
          canTrainingWrite={adminCanAny(admin, ["botTraining:write"])}
          canChatsRead={adminCanAny(admin, ["botChats:read", "botChats:write"])}
          canChatsWrite={adminCanAny(admin, ["botChats:write"])}
        />
      )}
    </AdminPageFrame>
  );
}
