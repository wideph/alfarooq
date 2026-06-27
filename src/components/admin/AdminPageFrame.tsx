"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminNav, {
  adminCanAny,
  type AdminNavUser,
  type AdminPermission,
} from "@/components/admin/AdminNav";
import {
  clearCachedAdminSession,
  getCachedAdminSession,
  loadAdminSession,
} from "@/lib/admin-session-client";

export default function AdminPageFrame({
  children,
  requiredAny = [],
}: {
  children: ReactNode | ((admin: AdminNavUser | null) => ReactNode);
  requiredAny?: AdminPermission[];
}) {
  const router = useRouter();
  const [admin, setAdmin] = useState<AdminNavUser | null>(() => getCachedAdminSession());
  const [loading, setLoading] = useState(() => !getCachedAdminSession());

  const checkAuth = useCallback(async () => {
    try {
      const nextAdmin = await loadAdminSession();
      if (!nextAdmin) {
        router.push("/admin/login");
        return;
      }
      setAdmin(nextAdmin);
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
    clearCachedAdminSession();
    router.push("/admin/login");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50">
        <div className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 overflow-hidden px-4 sm:px-6 lg:px-8">
            <div className="hidden h-9 w-24 shrink-0 rounded bg-slate-200 animate-pulse sm:block" />
            <div className="flex flex-1 justify-center gap-2">
              {Array.from({ length: 5 }).map((_, index) => (
                <div key={index} className="h-10 w-10 rounded-xl bg-slate-100 animate-pulse md:w-24" />
              ))}
            </div>
            <div className="h-10 w-20 shrink-0 rounded-xl bg-slate-100 animate-pulse" />
          </div>
        </div>
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
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
