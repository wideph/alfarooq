import type { SiteSettingsData } from "@/lib/site-settings";

function getHeroPadding(text: string) {
  const len = text.length;
  if (len > 150) return "py-10 sm:py-12";
  if (len > 80) return "py-8 sm:py-10";
  return "py-7 sm:py-9";
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

  const logoClass =
    "pointer-events-none absolute left-1/2 top-1/2 z-0 h-[calc(100%-1.5rem)] max-h-28 sm:max-h-32 w-auto -translate-x-1/2 -translate-y-1/2 object-contain opacity-[0.035] select-none sm:h-[calc(100%-2rem)] sm:max-h-36";

  return (
    <section className={`relative overflow-hidden ${getHeroPadding(settings.heroText)}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-sky-100/90 via-indigo-50/70 to-emerald-50/80" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_15%_0%,rgba(56,189,248,0.22),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_85%_100%,rgba(139,92,246,0.16),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_50%,rgba(255,255,255,0.55),transparent_70%)]" />
      <div className="absolute -top-24 left-1/4 h-48 w-48 rounded-full bg-sky-300/20 blur-3xl" />
      <div className="absolute -bottom-16 right-1/4 h-56 w-56 rounded-full bg-violet-300/15 blur-3xl" />
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#f0f9ff]/90 to-transparent" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-sky-300/50 to-transparent" />
      <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-indigo-200/40 to-transparent" />

      {logoSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={logoSrc} alt="" aria-hidden className={logoClass} />
      ) : null}

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <p
          className={`text-center font-semibold leading-relaxed text-slate-800 urdu-text whitespace-pre-line drop-shadow-sm ${getHeroTextSize(settings.heroText)}`}
        >
          {settings.heroText}
        </p>
      </div>
    </section>
  );
}
