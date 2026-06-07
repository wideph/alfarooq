import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SITE_SETTINGS,
  SITE_SETTINGS_ID,
  type SiteSettingsData,
} from "@/lib/site-settings";

export async function fetchSiteSettingsFromDb(): Promise<SiteSettingsData> {
  let settings = await prisma.siteSettings.findUnique({
    where: { id: SITE_SETTINGS_ID },
  });

  if (!settings) {
    settings = await prisma.siteSettings.create({
      data: {
        id: SITE_SETTINGS_ID,
        siteName: DEFAULT_SITE_SETTINGS.siteName,
        heroText: DEFAULT_SITE_SETTINGS.heroText,
        whatsappNumber: DEFAULT_SITE_SETTINGS.whatsappNumber,
      },
    });
  }

  return {
    siteName: settings.siteName,
    logoFilename: settings.logoFilename,
    heroText: settings.heroText,
    whatsappNumber: settings.whatsappNumber,
  };
}

const getCachedSiteSettings = unstable_cache(
  fetchSiteSettingsFromDb,
  ["site-settings"],
  { revalidate: 120, tags: ["site-settings"] }
);

export const getSiteSettings = cache(getCachedSiteSettings);
