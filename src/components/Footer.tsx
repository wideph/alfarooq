"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";
import type { PageTheme } from "@/lib/theme";

const styles = {
  home: {
    shell: "border-violet-500/15 bg-slate-950/70",
    brand: "text-slate-300",
    copy: "text-slate-500",
    link: "text-slate-500 hover:text-violet-300",
    icon: "text-violet-400",
  },
  course: {
    shell: "border-emerald-500/15 bg-[#060a09]/70",
    brand: "text-slate-300",
    copy: "text-slate-500",
    link: "text-slate-500 hover:text-emerald-300",
    icon: "text-emerald-400",
  },
} as const;

export default function Footer({ theme = "home" }: { theme?: PageTheme }) {
  const { settings } = useSiteSettings();
  const t = styles[theme];

  return (
    <footer className={`mt-auto border-t backdrop-blur-sm ${t.shell}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className={`flex items-center gap-2 ${t.brand}`}>
            {settings.logoFilename ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${encodeURIComponent(settings.logoFilename)}`}
                alt=""
                className="w-5 h-5 rounded object-cover ring-1 ring-white/10"
              />
            ) : (
              <GraduationCap className={`w-5 h-5 ${t.icon}`} />
            )}
            <span className="font-semibold urdu-text">{settings.siteName}</span>
          </div>
          <p className={`text-sm text-center ${t.copy}`}>
            © {new Date().getFullYear()} {settings.siteName}
          </p>
          <Link href="/admin/login" className={`text-sm transition-colors ${t.link}`}>
            Admin Panel
          </Link>
        </div>
      </div>
    </footer>
  );
}
