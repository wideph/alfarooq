"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home } from "lucide-react";

export default function FloatingHomeButton() {
  const pathname = usePathname();

  // Home page aur admin area par floating button nahi dikhana
  if (pathname === "/" || pathname.startsWith("/admin")) return null;

  return (
    <Link
      href="/"
      aria-label="Home Page"
      className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[90] flex items-center gap-2 rounded-full bg-gradient-to-r from-primary-600 to-accent-600 px-4 py-3 sm:px-5 sm:py-3.5 text-white font-semibold shadow-xl shadow-primary-500/30 ring-1 ring-white/30 hover:from-primary-700 hover:to-accent-700 hover:scale-105 active:scale-95 transition-all"
    >
      <Home className="w-5 h-5" />
      <span className="urdu-text text-sm sm:text-base">ہوم پیج</span>
    </Link>
  );
}
