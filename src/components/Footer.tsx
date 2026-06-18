"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Footer() {
  const { settings } = useSiteSettings();

  return (
    <footer className="mt-auto relative glass border-t border-white/40">
      <div className="h-0.5 w-full bg-gradient-to-r from-primary-500 via-accent-500 to-emerald-400 bg-[length:200%_100%] animate-[gradientShift_8s_ease_infinite]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2.5 text-slate-700">
            {settings.logoFilename ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${encodeURIComponent(settings.logoFilename)}`}
                alt=""
                className="w-7 h-7 rounded-lg object-cover ring-2 ring-white shadow"
              />
            ) : (
              <span className="grid place-items-center w-7 h-7 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 text-white shadow">
                <GraduationCap className="w-4 h-4" />
              </span>
            )}
            <span className="font-bold urdu-text text-gradient">{settings.siteName}</span>
          </div>
          <p className="text-sm text-slate-500 text-center">
            © {new Date().getFullYear()} {settings.siteName}
          </p>
          <Link
            href="/admin/login"
            className="text-sm font-medium text-slate-400 hover:text-primary-600 transition-colors"
          >
            Admin Panel
          </Link>
        </div>
      </div>
    </footer>
  );
}
