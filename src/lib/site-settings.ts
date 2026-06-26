export const SITE_SETTINGS_ID = "site";

export const DEFAULT_SITE_SETTINGS = {
  siteName: "Alfarooq Services",
  logoFilename: null as string | null,
  heroText: "",
  whatsappNumber: "",
  metaPixelId: "",
  googleAdsTagId: "",
  tiktokPixelId: "",
  botEnabled: false,
  botProvider: "openai",
  botModel: "",
  botSystemNote: "",
  botApiKeySet: false,
};

export type SiteSettingsData = typeof DEFAULT_SITE_SETTINGS;
