export const SITE_SETTINGS_ID = "site";

export const DEFAULT_SITE_SETTINGS = {
  siteName: "Alfarooq Services",
  logoFilename: null as string | null,
  heroText: "",
  whatsappNumber: "",
};

export type SiteSettingsData = typeof DEFAULT_SITE_SETTINGS;
