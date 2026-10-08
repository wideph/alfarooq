"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  BookOpenCheck,
  Briefcase,
  ExternalLink,
  Home,
  LayoutDashboard,
  Link2,
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

  // §N9 — department access links, kisi bhi office user ke liye. Lazy: sirf
  // pehli dafa dropdown khulne par fetch hota hai (har page load par nahi).
  const [linksOpen, setLinksOpen] = useState(false);
  const [departmentLinks, setDepartmentLinks] = useState<Array<{ id: string; label: string; url: string }> | null>(null);

  useEffect(() => {
    if (!linksOpen || departmentLinks !== null) return;
    let cancelled = false;
    fetch("/api/office/setup/department-links")
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setDepartmentLinks(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setDepartmentLinks([]);
      });
    return () => {
      cancelled = true;
    };
  }, [linksOpen, departmentLinks]);

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

            <div className="relative shrink-0">
              <button
                type="button"
                title="Links"
                onClick={() => setLinksOpen((open) => !open)}
                className={`inline-flex h-10 items-center justify-center gap-1.5 rounded-xl px-2.5 md:px-3 text-xs md:text-sm font-semibold transition-colors ${
                  linksOpen
                    ? "bg-primary-600 text-white"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
              >
                <Link2 className="h-4 w-4" />
                <span className="hidden md:inline">Links</span>
              </button>
              {linksOpen && (
                <>
                  <button
                    type="button"
                    aria-label="Close links menu"
                    className="fixed inset-0 z-40 cursor-default"
                    onClick={() => setLinksOpen(false)}
                  />
                  <div className="absolute right-0 z-50 mt-2 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
                    <p className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Department Links
                    </p>
                    {departmentLinks === null ? (
                      <p className="px-3 py-3 text-sm text-slate-400">Load ho raha hai...</p>
                    ) : departmentLinks.length === 0 ? (
                      <p className="px-3 py-3 text-sm text-slate-400">
                        Koi active link nahi — admin se hasil karein
                      </p>
                    ) : (
                      departmentLinks.map((link) => (
                        <a
                          key={link.id}
                          href={link.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => setLinksOpen(false)}
                          className="flex items-center justify-between gap-2 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50"
                        >
                          <span className="truncate">{link.label}</span>
                          <ExternalLink className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        </a>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>
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
