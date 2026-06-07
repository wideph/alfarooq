"use client";

import { createContext } from "react";
import {
  DEFAULT_SITE_SETTINGS,
  type SiteSettingsData,
} from "@/lib/site-settings";

export const SiteSettingsContext =
  createContext<SiteSettingsData>(DEFAULT_SITE_SETTINGS);

export function SiteSettingsProvider({
  initialSettings,
  children,
}: {
  initialSettings: SiteSettingsData;
  children: React.ReactNode;
}) {
  return (
    <SiteSettingsContext.Provider value={initialSettings}>
      {children}
    </SiteSettingsContext.Provider>
  );
}
