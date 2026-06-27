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
        <div className="flex h-16 items-center gap-2 overflow-x-auto whitespace-nowrap">
          <div className="mr-1 hidden min-w-0 shrink-0 sm:block">
            <h1 className="text-base font-bold text-slate-900">Admin</h1>
            {admin && <p className="max-w-28 truncate text-xs text-slate-500">{admin.name}</p>}
          </div>

          <nav className="flex min-w-0 flex-1 items-center justify-center gap-1.5">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const active = pathname === item.href;
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
