import type { Metadata } from "next";
import NoTranslate from "@/components/NoTranslate";

// §W38 — is hisse par browser ka auto-translate band (Google Translate ka DOM
// badlaav React page ko "Application error" kar deta tha). components/NoTranslate.
export const metadata: Metadata = {
  other: { google: "notranslate" },
};

export default function SegmentLayout({ children }: { children: React.ReactNode }) {
  return <NoTranslate>{children}</NoTranslate>;
}
