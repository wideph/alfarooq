"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Banknote,
  Bot,
  BookOpen,
  Briefcase,
  Home,
  LayoutDashboard,
  LogOut,
  PieChart,
  Settings,
  Settings2,
  ShieldCheck,
  Signal,
} from "lucide-react";
import type { AdminPermission } from "@/lib/auth";
import NotificationBell, { NavCountBubble, useOfficeNavCounts } from "@/components/office/NotificationBell";

export type { AdminPermission };

export type AdminNavUser = {
  name: string;
  email: string;
  role?: string;
  permissions?: AdminPermission[];
  bookingOfficeId?: string | null;
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
  // §W11.7: office nav-counts se amber bubble (sirf office destinations).
  countKey?: "cases" | "payments";
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
  // Office destinations show directly in the admin nav (N1), permission-filtered
  // the same way OfficeNav does. Super admin (role "admin") sees all.
  {
    href: "/office",
    label: "Office",
    icon: LayoutDashboard,
    permissions: ["office:cases:read"],
  },
  {
    href: "/office/cases",
    label: "Cases",
    icon: Briefcase,
    permissions: ["office:cases:read"],
    countKey: "cases",
  },
  {
    href: "/office/payments",
    label: "Payments",
    icon: Banknote,
    permissions: ["office:payments:verify", "office:payments:submit"],
    countKey: "payments",
  },
  // §W12.3: Ledger merge ho gaya Finance mein — /office/ledger redirect karta hai.
  {
    href: "/office/finance",
    label: "Finance",
    icon: PieChart,
    permissions: ["office:finance:read", "office:ledger:read"],
  },
  {
    href: "/office/setup",
    label: "Setup",
    icon: Settings2,
    permissions: ["office:setup:write"],
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
  // §W11.7/W11.8: office badges + bell sirf un users ke liye jo office
  // dekh sakte hain (warna nav-counts/notifications 403 dete).
  const officeUser = adminCanAny(admin, ["office:cases:read"]);
  const counts = useOfficeNavCounts(officeUser);

  // §W12.2 — 3-zone header: LEFT brand (shrink-0) | CENTER nav links (min-w-0
  // flex-1, hidden-scrollbar horizontal scroll) | RIGHT actions (shrink-0).
  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-2">
          {/* LEFT — brand */}
          <div className="mr-1 hidden min-w-0 shrink-0 sm:block">
            <h1 className="text-base font-bold text-slate-900">Admin</h1>
            {admin && <p className="max-w-28 truncate text-xs text-slate-500">{admin.name}</p>}
          </div>

          {/* CENTER — nav links (khud scroll karte hain, scrollbar hidden) */}
          <nav className="min-w-0 flex-1 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex items-center justify-start gap-1.5 md:justify-center">
              {visibleItems.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    prefetch
                    title={item.label}
                    className={`relative inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-xl px-2.5 md:px-3 text-xs md:text-sm font-semibold transition-colors ${
                      active
                        ? "bg-primary-600 text-white"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="hidden md:inline">{item.label}</span>
                    {officeUser && <NavCountBubble count={item.countKey ? counts?.[item.countKey] : null} />}
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* RIGHT — actions cluster */}
          <div className="ml-1 flex shrink-0 items-center gap-1">
            {officeUser && <NotificationBell />}
            <Link
              href="/"
              title="Website"
              className="grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100 transition-colors"
            >
              <Home className="w-4 h-4" />
            </Link>
            <button
              type="button"
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
