"use client";

import Link from "next/link";
import { BookOpen, GraduationCap } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Header() {
  const { settings } = useSiteSettings();

  return (
    <header className="app-navbar sticky top-0 z-50 shadow-lg shadow-black/20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 group">
            {settings.logoFilename ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${encodeURIComponent(settings.logoFilename)}`}
                alt={settings.siteName}
                className="w-10 h-10 rounded-xl object-cover ring-1 ring-app-border group-hover:ring-app-primary/50 transition-all"
              />
            ) : (
              <div className="w-10 h-10 rounded-xl bg-app-primary flex items-center justify-center shadow-[0_8px_24px_rgba(79,124,255,0.18)] group-hover:scale-105 transition-transform">
                <GraduationCap className="w-5 h-5 text-app-text" />
              </div>
            )}
            <h1 className="text-lg sm:text-xl font-semibold text-app-text urdu-text tracking-tight">
              {settings.siteName}
            </h1>
          </Link>

          <nav>
            <Link
              href="/"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-app-text-secondary hover:text-app-primary hover:bg-app-primary/10 transition-colors"
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
