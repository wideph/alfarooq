import type { MetadataRoute } from "next";

const CANONICAL_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL || "https://alfarooq-services.vercel.app";

// Keep the data and admin surfaces out of crawlers (Meta's included) so the
// course / Q&A JSON is not fetched or indexed off-site. Media stays allowed so
// logos and link-preview images still work.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/api/media/"],
        disallow: ["/api/", "/admin/"],
      },
    ],
    host: CANONICAL_SITE_URL,
  };
}
