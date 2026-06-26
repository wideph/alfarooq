"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type PublicTrackingSettings = {
  metaPixelId?: string;
  googleAdsTagId?: string;
  tiktokPixelId?: string;
};

type TrackingWindow = Window & {
  fbq?: (...args: unknown[]) => void;
  dataLayer?: unknown[];
  gtag?: (...args: unknown[]) => void;
  ttq?: {
    page?: () => void;
  };
};

const VISITOR_STORAGE_KEY = "bbte_visitor_id";

function makeVisitorKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `vis_${crypto.randomUUID()}`;
  }
  return `vis_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getVisitorKey() {
  const existing = localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;
  const next = makeVisitorKey();
  localStorage.setItem(VISITOR_STORAGE_KEY, next);
  return next;
}

function inferSource(url: URL, referrer: string) {
  const utmSource = url.searchParams.get("utm_source");
  if (utmSource) return utmSource;
  if (url.searchParams.has("fbclid")) return "facebook";
  if (url.searchParams.has("gclid")) return "google";
  if (url.searchParams.has("ttclid")) return "tiktok";

  if (!referrer) return "direct";

  try {
    const host = new URL(referrer).hostname.toLowerCase();
    if (host.includes("whatsapp")) return "whatsapp";
    if (host.includes("facebook") || host.includes("fb.")) return "facebook";
    if (host.includes("youtube") || host.includes("youtu.be")) return "youtube";
    if (host.includes("tiktok")) return "tiktok";
    if (host.includes("instagram")) return "instagram";
    if (host.includes("google")) return "google";
    return host.replace(/^www\./, "");
  } catch {
    return "unknown";
  }
}

export default function VisitorTracker() {
  const pathname = usePathname();
  const [settings, setSettings] = useState<PublicTrackingSettings | null>(null);
  const visitorKeyRef = useRef<string | null>(null);
  const lastPingRef = useRef<number>(Date.now());
  const landingPageRef = useRef<string | null>(null);
  const referrerRef = useRef<string>("");

  useEffect(() => {
    fetch("/api/settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings({
          metaPixelId: data.metaPixelId || "",
          googleAdsTagId: data.googleAdsTagId || "",
          tiktokPixelId: data.tiktokPixelId || "",
        });
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const trackingWindow = window as TrackingWindow;
    if (settings?.metaPixelId && trackingWindow.fbq) {
      trackingWindow.fbq("track", "PageView");
    }
    if (settings?.googleAdsTagId && trackingWindow.gtag) {
      trackingWindow.gtag("event", "page_view", {
        page_path: window.location.pathname + window.location.search,
      });
    }
    if (settings?.tiktokPixelId && trackingWindow.ttq?.page) {
      trackingWindow.ttq.page();
    }
  }, [pathname, settings]);

  useEffect(() => {
    visitorKeyRef.current = getVisitorKey();
    landingPageRef.current = window.location.href;
    referrerRef.current = document.referrer;

    async function sendPing(forceDelta = false) {
      const visitorKey = visitorKeyRef.current;
      if (!visitorKey) return;

      const now = Date.now();
      const delta = forceDelta ? Math.round((now - lastPingRef.current) / 1000) : 0;
      lastPingRef.current = now;

      const url = new URL(window.location.href);
      const source = inferSource(url, referrerRef.current);

      await fetch("/api/visitors/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          visitorKey,
          source,
          medium: url.searchParams.get("utm_medium") || "",
          campaign: url.searchParams.get("utm_campaign") || "",
          referrer: referrerRef.current,
          landingPage: landingPageRef.current,
          currentPath: window.location.href,
          timeDeltaSeconds: Math.max(0, delta),
        }),
      }).catch(() => {});
    }

    void sendPing(false);

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") void sendPing(true);
    }, 15000);

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") void sendPing(true);
    };

    window.addEventListener("beforeunload", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
      void sendPing(true);
    };
  }, []);

  useEffect(() => {
    if (!visitorKeyRef.current) return;
    fetch("/api/visitors/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        visitorKey: visitorKeyRef.current,
        currentPath: window.location.href,
        landingPage: landingPageRef.current,
        referrer: referrerRef.current,
      }),
    }).catch(() => {});
  }, [pathname]);

  return (
    <>
      {settings?.metaPixelId ? (
        <Script id="meta-pixel" strategy="afterInteractive">
          {`
            !function(f,b,e,v,n,t,s)
            {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
            n.callMethod.apply(n,arguments):n.queue.push(arguments)};
            if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
            n.queue=[];t=b.createElement(e);t.async=!0;
            t.src=v;s=b.getElementsByTagName(e)[0];
            s.parentNode.insertBefore(t,s)}(window, document,'script',
            'https://connect.facebook.net/en_US/fbevents.js');
            fbq('init', '${settings.metaPixelId}');
            fbq('track', 'PageView');
          `}
        </Script>
      ) : null}

      {settings?.googleAdsTagId ? (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${settings.googleAdsTagId}`}
            strategy="afterInteractive"
          />
          <Script id="google-ads-tag" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', '${settings.googleAdsTagId}');
            `}
          </Script>
        </>
      ) : null}

      {settings?.tiktokPixelId ? (
        <Script id="tiktok-pixel" strategy="afterInteractive">
          {`
            !function (w, d, t) {
              w.TiktokAnalyticsObject=t;var ttq=w[t]=w[t]||[];
              ttq.methods=["page","track","identify","instances","debug","on","off","once","ready","alias","group","enableCookie","disableCookie"];
              ttq.setAndDefer=function(t,e){t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}};
              for(var i=0;i<ttq.methods.length;i++)ttq.setAndDefer(ttq,ttq.methods[i]);
              ttq.load=function(e,n){var i="https://analytics.tiktok.com/i18n/pixel/events.js";
              ttq._i=ttq._i||{},ttq._i[e]=[],ttq._i[e]._u=i,ttq._t=ttq._t||{},ttq._t[e]=+new Date,
              ttq._o=ttq._o||{},ttq._o[e]=n||{};var o=d.createElement("script");
              o.type="text/javascript",o.async=!0,o.src=i+"?sdkid="+e+"&lib="+t;
              var a=d.getElementsByTagName("script")[0];a.parentNode.insertBefore(o,a)};
              ttq.load('${settings.tiktokPixelId}');
              ttq.page();
            }(window, document, 'ttq');
          `}
        </Script>
      ) : null}
    </>
  );
}
