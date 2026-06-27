"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  BookOpen,
  Home,
  LogOut,
  Settings,
  ShieldCheck,
  Signal,
} from "lucide-react";

export type AdminPermission =
  | "settings:read"
  | "settings:write"
  | "courses:read"
  | "courses:write"
  | "samples:read"
  | "samples:write"
  | "qa:read"
  | "qa:write"
  | "userQuestions:read"
  | "userQuestions:write"
  | "visitors:read"
  | "visitors:write"
  | "botTraining:read"
  | "botTraining:write"
  | "botChats:read"
  | "botChats:write"
  | "admins:read"
  | "admins:write";

export type AdminNavUser = {
  name: string;
  email: string;
  role?: string;
  permissions?: AdminPermission[];
};

export function adminCanAny(admin: AdminNavUser | null, permissions: AdminPermission[]) {
  if (!admin) return false;
  if (admin.role === "admin") return true;
  return permissions.some((permission) => admin.permissions?.includes(permission));
}

const navItems: Array<{
  href: string;
  label: string;
  icon: typeof Home;
  permissions: AdminPermission[];
}> = [
  {
    href: "/admin",
    label: "Courses",
    icon: BookOpen,
    permissions: [
      "courses:read",
      "courses:write",
      "samples:read",
      "samples:write",
      "qa:read",
      "qa:write",
      "userQuestions:read",
      "userQuestions:write",
    ],
  },
  {
    href: "/admin/settings",
    label: "Settings",
    icon: Settings,
    permissions: ["settings:read", "settings:write"],
  },
  {
    href: "/admin/visitors",
    label: "Visitors",
    icon: Signal,
    permissions: ["visitors:read", "visitors:write"],
  },
  {
    href: "/admin/bot",
    label: "Bot",
    icon: Bot,
    permissions: [
      "botTraining:read",
      "botTraining:write",
      "botChats:read",
      "botChats:write",
    ],
  },
  {
    href: "/admin/sub-admins",
    label: "Admins",
    icon: ShieldCheck,
    permissions: ["admins:read", "admins:write"],
  },
];

export default function AdminNav({
  admin,
  onLogout,
}: {
  admin: AdminNavUser | null;
  onLogout: () => void;
}) {
  const pathname = usePathname();
  const visibleItems = navItems.filter((item) => adminCanAny(admin, item.permissions));

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 py-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold text-slate-900">Admin Dashboard</h1>
              {admin && <p className="text-xs text-slate-500">Welcome, {admin.name}</p>}
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/"
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <Home className="w-4 h-4" />
                <span className="hidden sm:inline">Website</span>
              </Link>
              <button
                onClick={onLogout}
                className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>

          <nav className="flex flex-wrap gap-1.5 pb-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl px-2.5 sm:px-3 py-2 text-xs sm:text-sm font-semibold transition-colors ${
                    active
                      ? "bg-primary-600 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </div>
      </div>
    </header>
  );
}
