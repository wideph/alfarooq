"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BookOpenCheck,
  Briefcase,
  Home,
  LayoutDashboard,
  LogOut,
  PieChart,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import type { AdminNavUser, AdminPermission } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import { ROLE_LABELS } from "@/lib/office/permissions";

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof Home;
  permissions: AdminPermission[];
}> = [
  { href: "/office", label: "Dashboard", icon: LayoutDashboard, permissions: ["office:cases:read"] },
  { href: "/office/cases", label: "Cases", icon: Briefcase, permissions: ["office:cases:read"] },
  {
    href: "/office/payments",
    label: "Payments",
    icon: Banknote,
    permissions: ["office:payments:verify", "office:payments:submit"],
  },
  {
    href: "/office/ledger",
    label: "Ledger",
    icon: BookOpenCheck,
    permissions: ["office:ledger:read", "office:ledger:write", "office:expenses:write"],
  },
  { href: "/office/finance", label: "Finance", icon: PieChart, permissions: ["office:finance:read"] },
  { href: "/office/setup", label: "Setup", icon: Settings2, permissions: ["office:setup:write"] },
];

export default function OfficeNav({
  admin,
  onLogout,
}: {
  admin: AdminNavUser | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) => adminCanAny(admin, item.permissions));
  const isSuperAdmin = admin?.role === "admin";

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <div className="mr-1 hidden min-w-0 shrink-0 sm:block">
            <h1 className="text-base font-bold text-slate-900">Office</h1>
            {admin && (
              <p className="max-w-36 truncate text-xs text-slate-500">
                {admin.name} · {ROLE_LABELS[admin.role || ""] || admin.role}
              </p>
            )}
          </div>

          <nav className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active =
                item.href === "/office" ? pathname === item.href : pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  title={item.label}
                  className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 md:px-3 text-xs md:text-sm font-semibold transition-colors ${
                    active
                      ? "bg-primary-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="ml-1 flex shrink-0 items-center gap-1">
            {isSuperAdmin && (
              <Link
                href="/admin"
                title="Admin panel"
                className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <ShieldCheck className="w-4 h-4" />
              </Link>
            )}
            <Link
              href="/"
              title="Website"
              className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Home className="w-4 h-4" />
            </Link>
            <button
              onClick={onLogout}
              title="Logout"
              className="grid h-10 w-10 place-items-center rounded-xl text-red-600 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
