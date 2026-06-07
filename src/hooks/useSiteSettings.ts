"use client";

import { useContext } from "react";
import { SiteSettingsContext } from "@/components/SiteSettingsProvider";
import { DEFAULT_SITE_SETTINGS } from "@/lib/site-settings";

export function useSiteSettings() {
  const settings = useContext(SiteSettingsContext);

  return {
    settings: settings ?? DEFAULT_SITE_SETTINGS,
    loading: false,
  };
}
