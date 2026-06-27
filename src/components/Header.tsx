"use client";

import Link from "next/link";
import { BookOpen, GraduationCap } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Header() {
  const { settings } = useSiteSettings();

  return (
    <header className="sticky top-0 z-50 glass border-b border-white/50 shadow-[0_2px_16px_-10px_rgba(37,99,235,0.4)]">
      {/* top accent line */}
      <div className="h-0.5 w-full bg-gradient-to-r from-primary-500 via-accent-500 to-emerald-400" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 group">
            {settings.logoFilename ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${encodeURIComponent(settings.logoFilename)}?direct=1`}
                alt={settings.siteName}
                width={40}
                height={40}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="w-10 h-10 rounded-xl object-cover shadow-md ring-2 ring-white group-hover:scale-105 transition-transform"
              />
            ) : (
              <span className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-md ring-2 ring-white group-hover:scale-105 transition-transform">
                <GraduationCap className="w-5 h-5 text-white" />
              </span>
            )}
            <h1 className="text-lg sm:text-xl font-extrabold text-gradient urdu-text">
              {settings.siteName}
            </h1>
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className="group flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold text-slate-700 bg-white/60 ring-1 ring-slate-200/70 hover:text-white hover:bg-gradient-to-r hover:from-primary-600 hover:to-accent-600 hover:ring-transparent hover:shadow-lg hover:shadow-primary-500/30 transition-all"
            >
              <BookOpen className="w-4 h-4" />
              <span className="hidden sm:inline">Home</span>
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
