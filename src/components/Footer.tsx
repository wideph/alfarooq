"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Footer() {
  const { settings } = useSiteSettings();

  return (
    <footer className="mt-auto border-t border-slate-200/60 bg-white/60 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-slate-600">
            {settings.logoFilename ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${encodeURIComponent(settings.logoFilename)}`}
                alt=""
                className="w-5 h-5 rounded object-cover"
              />
            ) : (
              <GraduationCap className="w-5 h-5 text-primary-500" />
            )}
            <span className="font-semibold urdu-text">{settings.siteName}</span>
          </div>
          <p className="text-sm text-slate-500 text-center">
            © {new Date().getFullYear()} {settings.siteName}
          </p>
          <Link
            href="/admin/login"
            className="text-sm text-slate-400 hover:text-primary-600 transition-colors"
          >
            Admin Panel
          </Link>
        </div>
      </div>
    </footer>
  );
}
