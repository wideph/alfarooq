import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import {
  DEFAULT_SITE_SETTINGS,
  SITE_SETTINGS_ID,
  type SiteSettingsData,
} from "@/lib/site-settings";

export async function fetchPrivateSiteSettingsFromDb() {
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
        metaPixelId: DEFAULT_SITE_SETTINGS.metaPixelId,
        googleAdsTagId: DEFAULT_SITE_SETTINGS.googleAdsTagId,
        tiktokPixelId: DEFAULT_SITE_SETTINGS.tiktokPixelId,
        botEnabled: DEFAULT_SITE_SETTINGS.botEnabled,
        botProvider: DEFAULT_SITE_SETTINGS.botProvider,
        botModel: DEFAULT_SITE_SETTINGS.botModel,
        botSystemNote: DEFAULT_SITE_SETTINGS.botSystemNote,
      },
    });
  }

  return settings;
}

export async function fetchSiteSettingsFromDb(): Promise<SiteSettingsData> {
  const settings = await fetchPrivateSiteSettingsFromDb();

  return {
    siteName: settings.siteName,
    logoFilename: settings.logoFilename,
    heroText: settings.heroText,
    whatsappNumber: settings.whatsappNumber,
    metaPixelId: settings.metaPixelId,
    googleAdsTagId: settings.googleAdsTagId,
    tiktokPixelId: settings.tiktokPixelId,
    botEnabled: settings.botEnabled && Boolean(settings.botApiKey && settings.botModel),
    botProvider: settings.botProvider,
    botModel: settings.botModel,
    botSystemNote: settings.botSystemNote,
    botApiKeySet: Boolean(settings.botApiKey),
  };
}

const getCachedSiteSettings = unstable_cache(
  fetchSiteSettingsFromDb,
  ["site-settings"],
  { revalidate: 120, tags: ["site-settings"] }
);

export const getSiteSettings = cache(getCachedSiteSettings);
