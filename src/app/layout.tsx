import type { Metadata, Viewport } from "next";
import { Noto_Nastaliq_Urdu, Noto_Sans_Arabic } from "next/font/google";
import { SiteSettingsProvider } from "@/components/SiteSettingsProvider";
import { getSiteSettings } from "@/lib/get-site-settings";
import "./globals.css";

const urduNastaliq = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400"],
  variable: "--font-urdu-nastaliq",
  display: "swap",
  preload: true,
});

const urduSans = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600"],
  variable: "--font-urdu-sans",
  display: "swap",
  preload: true,
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

  return {
    title: settings.siteName,
    description: "Courses and Services platform",
    ...(settings.logoFilename
      ? {
          icons: {
            icon: `/api/media/${encodeURIComponent(settings.logoFilename)}`,
            apple: `/api/media/${encodeURIComponent(settings.logoFilename)}`,
          },
        }
      : {}),
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const settings = await getSiteSettings();

  return (
    <html
      lang="ur"
      dir="ltr"
      className={`${urduNastaliq.variable} ${urduSans.variable}`}
      suppressHydrationWarning
    >
      <body className="antialiased text-slate-800 font-urdu">
        <SiteSettingsProvider initialSettings={settings}>{children}</SiteSettingsProvider>
      </body>
    </html>
  );
}
