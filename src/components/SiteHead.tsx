"use client";

import { useEffect } from "react";
import { useSiteSettings } from "@/hooks/useSiteSettings";

export default function SiteHead() {
  const { settings } = useSiteSettings();

  useEffect(() => {
    document.title = settings.siteName || "Alfarooq Services";

    let iconLink = document.querySelector('link[rel="icon"]') as HTMLLinkElement | null;
    if (!iconLink) {
      iconLink = document.createElement("link");
      iconLink.rel = "icon";
      document.head.appendChild(iconLink);
    }

    if (settings.logoFilename) {
      iconLink.href = `/api/media/${encodeURIComponent(settings.logoFilename)}`;
      iconLink.type = "image/png";
    } else {
      iconLink.href = "/favicon.ico";
    }

    let appleLink = document.querySelector('link[rel="apple-touch-icon"]') as HTMLLinkElement | null;
    if (settings.logoFilename) {
      if (!appleLink) {
        appleLink = document.createElement("link");
        appleLink.rel = "apple-touch-icon";
        document.head.appendChild(appleLink);
      }
      appleLink.href = `/api/media/${encodeURIComponent(settings.logoFilename)}`;
    }
  }, [settings.siteName, settings.logoFilename]);

  return null;
}
