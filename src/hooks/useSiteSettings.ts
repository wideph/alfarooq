"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SITE_SETTINGS, type SiteSettingsData } from "@/lib/site-settings";

export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettingsData>(DEFAULT_SITE_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/settings")
      .then(async (r) => {
        if (!r.ok) throw new Error("Settings load failed");
        const text = await r.text();
        if (!text) return DEFAULT_SITE_SETTINGS;
        return JSON.parse(text) as SiteSettingsData & { siteName?: string };
      })
      .then((data) => {
        setSettings({
          siteName: data.siteName || DEFAULT_SITE_SETTINGS.siteName,
          logoFilename: data.logoFilename || null,
          heroText: data.heroText || "",
          whatsappNumber: data.whatsappNumber || "",
        });
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  return { settings, loading };
}
