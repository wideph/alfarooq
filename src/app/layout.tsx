import type { Metadata, Viewport } from "next";
import { Inter, Noto_Nastaliq_Urdu, Noto_Sans_Arabic } from "next/font/google";
import { SiteSettingsProvider } from "@/components/SiteSettingsProvider";
import PreloadAssets from "@/components/PreloadAssets";
import FloatingHomeButton from "@/components/FloatingHomeButton";
import VisitorTracker from "@/components/VisitorTracker";
import VisitorBlockGate from "@/components/VisitorBlockGate";
import BotChatWidget from "@/components/BotChatWidget";
import { getSiteSettings } from "@/lib/get-site-settings";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
  preload: true,
});

const urduNastaliq = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400"],
  variable: "--font-urdu-nastaliq",
  display: "swap",
  preload: false,
});

const urduSans = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "600"],
  variable: "--font-urdu-sans",
  display: "swap",
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();

  return {
    title: settings.siteName,
    description: "Types of Diploma and services platform",
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
  const logoUrl = settings.logoFilename
    ? `/api/media/${encodeURIComponent(settings.logoFilename)}?direct=1`
    : null;

  return (
    <html
      lang="ur"
      dir="ltr"
      className={`${inter.variable} ${urduNastaliq.variable} ${urduSans.variable}`}
      suppressHydrationWarning
    >
      <head>
        {logoUrl ? <link rel="preload" href={logoUrl} as="image" /> : null}
      </head>
      <body className="antialiased text-slate-800">
        <PreloadAssets logoUrl={logoUrl} />
        <SiteSettingsProvider initialSettings={settings}>{children}</SiteSettingsProvider>
        <VisitorTracker />
        <VisitorBlockGate />
        <BotChatWidget />
        <FloatingHomeButton />
      </body>
    </html>
  );
}
