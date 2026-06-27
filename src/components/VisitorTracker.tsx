"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import {
  canonicalizeVisitorUrl,
  consumePreviousVisitorKey,
  getOrCreateVisitorKey,
  peekPreviousVisitorKey,
} from "@/lib/visitor-client";

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

function inferSource(url: URL, referrer: string, userAgent: string) {
  const explicitSource =
    url.searchParams.get("utm_source") ||
    url.searchParams.get("source") ||
    url.searchParams.get("ref") ||
    url.searchParams.get("from") ||
    url.searchParams.get("via");
  if (explicitSource) return explicitSource.toLowerCase();

  if (url.searchParams.has("fbclid")) return "facebook";
  if (url.searchParams.has("gclid")) return "google";
  if (url.searchParams.has("gbraid") || url.searchParams.has("wbraid")) return "google";
  if (url.searchParams.has("msclkid")) return "microsoft";
  if (url.searchParams.has("ttclid")) return "tiktok";
  if (url.searchParams.has("igshid")) return "instagram";

  const ua = userAgent.toLowerCase();
  if (ua.includes("whatsapp")) return "whatsapp";
  if (ua.includes("fbav") || ua.includes("fban") || ua.includes("facebook")) return "facebook";
  if (ua.includes("instagram")) return "instagram";
  if (ua.includes("tiktok")) return "tiktok";
  if (ua.includes("youtube")) return "youtube";

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
  const isAdminPath = pathname.startsWith("/admin");
  const [settings, setSettings] = useState<PublicTrackingSettings | null>(null);
  const visitorKeyRef = useRef<string | null>(null);
  const previousVisitorKeyRef = useRef<string>("");
  const lastActiveAtRef = useRef<number>(Date.now());
  const landingPageRef = useRef<string | null>(null);
  const referrerRef = useRef<string>("");
  const sendPingRef = useRef<((includeDelta?: boolean, useBeacon?: boolean) => void) | null>(null);

  useEffect(() => {
    if (isAdminPath) return;

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
  }, [isAdminPath]);

  useEffect(() => {
    if (isAdminPath) return;

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
  }, [isAdminPath, pathname, settings]);

  useEffect(() => {
    if (isAdminPath) return;

    visitorKeyRef.current = getOrCreateVisitorKey();
    previousVisitorKeyRef.current = consumePreviousVisitorKey();
    landingPageRef.current = canonicalizeVisitorUrl(window.location.href);
    referrerRef.current = canonicalizeVisitorUrl(document.referrer);

    function buildPayload(includeDelta = false) {
      const visitorKey = visitorKeyRef.current;
      if (!visitorKey) return null;

      const now = Date.now();
      const delta = includeDelta
        ? Math.max(0, Math.round((now - lastActiveAtRef.current) / 1000))
        : 0;
      lastActiveAtRef.current = now;

      const url = new URL(window.location.href);
      const source = inferSource(url, referrerRef.current, navigator.userAgent);
      const previousVisitorKey =
        previousVisitorKeyRef.current || peekPreviousVisitorKey();
      const derivedReferrer =
        referrerRef.current ||
        (source && source !== "direct" && source !== "unknown" ? source : "");

      return {
        visitorKey,
        previousVisitorKey,
        source,
        medium: url.searchParams.get("utm_medium") || "",
        campaign: url.searchParams.get("utm_campaign") || "",
        referrer: derivedReferrer,
        landingPage: landingPageRef.current,
        currentPath: canonicalizeVisitorUrl(window.location.href),
        timeDeltaSeconds: delta,
      };
    }

    function sendPing(includeDelta = false, useBeacon = false) {
      const payload = buildPayload(includeDelta);
      if (!payload) return;

      if (useBeacon && navigator.sendBeacon) {
        const blob = new Blob([JSON.stringify(payload)], {
          type: "application/json",
        });
        navigator.sendBeacon("/api/visitors/track", blob);
        previousVisitorKeyRef.current = "";
        return;
      }

      fetch("/api/visitors/track", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        keepalive: true,
        body: JSON.stringify(payload),
      })
        .then((response) => response.json().catch(() => null))
        .then((data) => {
          if (data?.status === "blocked") {
            localStorage.setItem("bbte_visitor_blocked", "true");
            window.dispatchEvent(new Event("bbte-visitor-blocked"));
          } else if (data?.status) {
            localStorage.removeItem("bbte_visitor_blocked");
            window.dispatchEvent(new Event("bbte-visitor-unblocked"));
          }
        })
        .catch(() => {});

      previousVisitorKeyRef.current = "";
    }

    sendPing(false);
    sendPingRef.current = sendPing;

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") sendPing(true);
    }, 5000);

    const handleVisibility = () => {
      if (document.visibilityState === "hidden") sendPing(true, true);
      if (document.visibilityState === "visible") lastActiveAtRef.current = Date.now();
    };

    const handleUnload = () => sendPing(true, true);

    window.addEventListener("beforeunload", handleUnload);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", handleUnload);
      document.removeEventListener("visibilitychange", handleVisibility);
      sendPing(true, true);
      sendPingRef.current = null;
    };
  }, [isAdminPath]);

  useEffect(() => {
    if (isAdminPath) return;
    sendPingRef.current?.(true);
  }, [isAdminPath, pathname]);

  if (isAdminPath) return null;

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
            // Privacy hardening: turn OFF automatic configuration BEFORE init.
            // This stops fbevents.js from auto-collecting page "microdata"
            // (course/Q&A text, headings, prices), automatic button/link click
            // text, and Automatic Advanced Matching (scraping form fields).
            // Only the explicit events we fire below are ever sent to Meta.
            fbq('set', 'autoConfig', false, '${settings.metaPixelId}');
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
