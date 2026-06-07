import Link from "next/link";
import type { SiteSettingsData } from "@/lib/site-settings";
import { ArrowRight, Sparkles } from "lucide-react";

function getHeroPadding(text: string) {
  const len = text.length;
  if (len > 150) return "py-12 sm:py-14";
  if (len > 80) return "py-10 sm:py-12";
  return "py-9 sm:py-11";
}

function getHeroTextSize(text: string) {
  const len = text.length;
  if (len > 150) return "text-base sm:text-lg md:text-xl";
  if (len > 80) return "text-lg sm:text-xl md:text-2xl";
  return "text-xl sm:text-2xl md:text-3xl";
}

export default function HeroSection({ settings }: { settings: SiteSettingsData }) {
  if (!settings.heroText) return null;

  const logoSrc = settings.logoFilename
    ? `/api/media/${encodeURIComponent(settings.logoFilename)}`
    : null;

  return (
    <section
      className={`relative overflow-hidden border-b border-app-border ${getHeroPadding(settings.heroText)}`}
    >
      <div className="absolute inset-0 bg-gradient-to-b from-app-main via-app-secondary to-app-main" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(79,124,255,0.12),transparent_62%)]" />

      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[calc(100%-2rem)] max-h-36 w-auto -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.04] select-none sm:max-h-40"
        />
      ) : null}

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full border border-app-border bg-app-surface/60 text-xs font-medium text-app-teal">
          <Sparkles className="w-3.5 h-3.5" />
          Premium Learning Experience
        </div>
        <p
          className={`font-semibold leading-relaxed text-app-text urdu-text whitespace-pre-line ${getHeroTextSize(settings.heroText)}`}
        >
          {settings.heroText}
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link href="#courses" className="btn-primary min-w-[180px]">
            Browse Courses
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link href="/admin/login" className="btn-outline min-w-[180px]">
            Admin Access
          </Link>
        </div>
      </div>
    </section>
  );
}
