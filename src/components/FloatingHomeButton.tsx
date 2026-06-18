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
      className="group animate-pulse-glow fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[90] flex items-center gap-2 rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 px-5 py-3 sm:px-6 sm:py-3.5 text-white font-bold ring-2 ring-white/70 hover:scale-110 active:scale-95 transition-transform duration-300"
    >
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/25 group-hover:rotate-[-8deg] transition-transform">
        <Home className="w-4 h-4" />
      </span>
      <span className="urdu-text text-sm sm:text-base drop-shadow-sm">ہوم پیج</span>
    </Link>
  );
}
