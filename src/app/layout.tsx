import type { Metadata, Viewport } from "next";
import { Noto_Nastaliq_Urdu, Noto_Sans_Arabic } from "next/font/google";
import SiteHead from "@/components/SiteHead";
import "./globals.css";

const urduNastaliq = Noto_Nastaliq_Urdu({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-urdu-nastaliq",
  display: "swap",
});

const urduSans = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-urdu-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Alfarooq Services",
  description: "Courses and Services platform",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ur" dir="ltr" className={`${urduNastaliq.variable} ${urduSans.variable}`} suppressHydrationWarning><body className="antialiased text-slate-800 font-urdu">
        <SiteHead />
        {children}
      </body></html>
  );
}
