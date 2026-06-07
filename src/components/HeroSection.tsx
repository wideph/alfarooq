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

  const logoClass =
    "pointer-events-none absolute top-1/2 z-0 h-[calc(100%-1.5rem)] max-h-28 sm:max-h-32 w-auto -translate-y-1/2 object-contain opacity-[0.08] select-none sm:h-[calc(100%-2rem)] sm:max-h-36";

  return (
    <section className={`relative overflow-hidden ${getHeroPadding(settings.heroText)}`}>
      <div className="absolute inset-0 bg-gradient-to-br from-primary-100/80 via-white to-accent-100/60" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_20%_20%,rgba(59,130,246,0.18),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_80%_80%,rgba(139,92,246,0.14),transparent_55%)]" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary-300/40 to-transparent" />

      {logoSrc ? (
        <>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="" aria-hidden className={`${logoClass} left-2 sm:left-6`} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logoSrc} alt="" aria-hidden className={`${logoClass} right-2 sm:right-6`} />
        </>
      ) : null}

      <div className="relative z-10 mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <p
          className={`text-center font-semibold leading-relaxed text-slate-900 urdu-text whitespace-pre-line ${getHeroTextSize(settings.heroText)}`}
        >
          {settings.heroText}
        </p>
      </div>
    </section>
  );
}
