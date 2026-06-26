"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminNav, {
  adminCanAny,
  type AdminNavUser,
  type AdminPermission,
} from "@/components/admin/AdminNav";

export default function AdminPageFrame({
  children,
  requiredAny = [],
}: {
  children: ReactNode | ((admin: AdminNavUser | null) => ReactNode);
  requiredAny?: AdminPermission[];
}) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminNavUser | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me");
      if (!res.ok) {
        router.push("/admin/login");
        return;
      }
      const data = await res.json();
      setAdmin(data.admin);
    } catch {
      router.push("/admin/login");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/admin/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  const allowed = requiredAny.length === 0 || adminCanAny(admin, requiredAny);

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav admin={admin} onLogout={handleLogout} />
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {allowed ? (
          typeof children === "function" ? children(admin) : children
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
            Is page ke liye permission zaroori hai
          </div>
        )}
      </main>
    </div>
  );
}
