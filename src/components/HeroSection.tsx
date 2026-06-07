import type { SiteSettingsData } from "@/lib/site-settings";

function getHeroPadding(text: string) {
  const len = text.length;
  if (len > 150) return "py-8 sm:py-10";
  if (len > 80) return "py-6 sm:py-8";
  return "py-5 sm:py-6";
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
    <section className={`relative overflow-hidden ${getHeroPadding(settings.heroText)}`}>
      <div className="absolute inset-0 bg-gradient-to-b from-slate-700/90 via-slate-600/75 to-slate-800/90" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(139,92,246,0.22),transparent_65%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.15),transparent_50%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-violet-400/30 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-blue-400/20 to-transparent" />

      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logoSrc}
          alt=""
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[calc(100%-1.5rem)] max-h-36 w-auto -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.035] select-none sm:max-h-40"
        />
      ) : null}

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <p
          className={`text-center font-semibold leading-relaxed text-slate-50 urdu-text whitespace-pre-line drop-shadow-sm ${getHeroTextSize(settings.heroText)}`}
        >
          {settings.heroText}
        </p>
      </div>
    </section>
  );
}
