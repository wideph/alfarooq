"use client";

import Link from "next/link";
import { BookOpen, GraduationCap } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Header() {
  const { settings } = useSiteSettings();

  return (
    <header className="sticky top-0 z-50 backdrop-blur-xl bg-white/80 border-b border-slate-200/60 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 group">
            {settings.logoFilename ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${encodeURIComponent(settings.logoFilename)}`}
                alt={settings.siteName}
                width={40}
                height={40}
                loading="eager"
                decoding="async"
                fetchPriority="high"
                className="w-10 h-10 rounded-xl object-cover shadow-lg group-hover:scale-105 transition-transform"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center shadow-lg shadow-primary-500/25 group-hover:scale-105 transition-transform">
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
            )}
            <h1 className="text-lg sm:text-xl font-bold bg-gradient-to-r from-primary-700 to-accent-600 bg-clip-text text-transparent urdu-text">
              {settings.siteName}
            </h1>
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 hover:text-primary-600 hover:bg-primary-50 transition-colors"
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
