"use client";

import Link from "next/link";
import { BookOpen, GraduationCap } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import type { PageTheme } from "@/lib/theme";

const styles = {
  home: {
    shell: "bg-slate-950/80 border-violet-500/20",
    title: "from-violet-300 via-blue-300 to-indigo-300",
    nav: "text-slate-300 hover:text-violet-200 hover:bg-violet-500/10",
    icon: "from-violet-500 to-indigo-600 shadow-violet-500/30",
  },
  course: {
    shell: "bg-[#060a09]/85 border-emerald-500/20",
    title: "from-emerald-300 via-teal-300 to-cyan-300",
    nav: "text-slate-300 hover:text-emerald-200 hover:bg-emerald-500/10",
    icon: "from-emerald-500 to-teal-600 shadow-emerald-500/30",
  },
} as const;

export default function Header({ theme = "home" }: { theme?: PageTheme }) {
  const { settings } = useSiteSettings();
  const t = styles[theme];

  return (
    <header
      className={`sticky top-0 z-50 border-b backdrop-blur-xl shadow-lg shadow-black/20 ${t.shell}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <Link href="/" className="flex items-center gap-3 group">
            {settings.logoFilename ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${encodeURIComponent(settings.logoFilename)}`}
                alt={settings.siteName}
                className="w-10 h-10 rounded-xl object-cover ring-1 ring-white/10 shadow-lg group-hover:scale-105 transition-transform"
              />
            ) : (
              <div
                className={`w-10 h-10 rounded-xl bg-gradient-to-br ${t.icon} flex items-center justify-center shadow-lg group-hover:scale-105 transition-transform`}
              >
                <GraduationCap className="w-5 h-5 text-white" />
              </div>
            )}
            <h1
              className={`text-lg sm:text-xl font-bold bg-gradient-to-r ${t.title} bg-clip-text text-transparent urdu-text`}
            >
              {settings.siteName}
            </h1>
          </Link>

          <nav className="flex items-center gap-2">
            <Link
              href="/"
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${t.nav}`}
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
