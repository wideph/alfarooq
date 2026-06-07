"use client";

import Link from "next/link";
import { GraduationCap } from "lucide-react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function Footer() {
  const { settings } = useSiteSettings();

  return (
    <footer className="app-footer mt-auto">
      <div className="h-px bg-gradient-to-r from-transparent via-app-primary/30 to-transparent" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-app-text-secondary">
            {settings.logoFilename ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/media/${encodeURIComponent(settings.logoFilename)}`}
                alt=""
                className="w-5 h-5 rounded object-cover ring-1 ring-app-border"
              />
            ) : (
              <GraduationCap className="w-5 h-5 text-app-primary" />
            )}
            <span className="font-medium urdu-text">{settings.siteName}</span>
          </div>
          <p className="text-sm text-app-text-muted text-center">
            © {new Date().getFullYear()} {settings.siteName}
          </p>
          <Link
            href="/admin/login"
            className="text-sm text-app-text-muted hover:text-app-primary transition-colors"
          >
            Admin Panel
          </Link>
        </div>
      </div>
    </footer>
  );
}
