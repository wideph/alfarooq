import crypto from "crypto";
import type { SiteSettings, Visitor } from "@prisma/client";
import { fetchPrivateSiteSettingsFromDb } from "@/lib/get-site-settings";

export const VISITOR_STATUS_OPTIONS = [
  { value: "visitor", label: "Visitor", eventName: "PageView" },
  { value: "new_order", label: "New Order", eventName: "Lead" },
  { value: "payment_pending", label: "Payment Pending", eventName: "InitiateCheckout" },
  { value: "order_complete", label: "Order Complete", eventName: "Purchase" },
  { value: "repeat_order", label: "Repeat Ordered", eventName: "RepeatOrdered" },
  { value: "blocked", label: "IP Blocked", eventName: "Blocked" },
] as const;

export function eventNameForVisitorStatus(status: string) {
  return (
    VISITOR_STATUS_OPTIONS.find((option) => option.value === status)?.eventName ||
    "CustomEvent"
  );
}

function sha256(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// Send Meta only the origin + path of the page — never the query string or
// fragment, which can carry utm/user parameters or content anchors (#qa-...).
function eventSourceUrl(visitor: Visitor) {
  const raw = visitor.currentPath || visitor.landingPage;
  if (!raw) return undefined;
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname}`;
  } catch {
    return undefined;
  }
}

// Whitelist what may go into custom_data. Only short scalars survive, so no
// caller can ever push course text, Q&A answers, or other content to Meta.
const CUSTOM_DATA_MAX = 180;
function sanitizeCustomData(payload: Record<string, unknown>) {
  const safe: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value === null || value === undefined) continue;
    if (typeof value === "number" || typeof value === "boolean") {
      safe[key] = value;
    } else if (typeof value === "string") {
      safe[key] = value.slice(0, CUSTOM_DATA_MAX);
    }
    // objects / arrays / free-form content are intentionally dropped
  }
  return safe;
}

async function sendMetaEvent(
  settings: SiteSettings,
  visitor: Visitor,
  eventName: string,
  payload: Record<string, unknown>
) {
  if (!settings.metaPixelId || !settings.metaAccessToken) {
    return false;
  }

  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(Date.now() / 1000),
        action_source: "website",
        event_source_url: eventSourceUrl(visitor),
        user_data: {
          // Identity only as a salted-by-Meta hash; never raw.
          external_id: sha256(visitor.visitorKey),
          client_user_agent: visitor.userAgent || undefined,
        },
        custom_data: sanitizeCustomData({
          visitor_status: visitor.status,
          source: visitor.source,
          medium: visitor.medium,
          campaign: visitor.campaign,
          time_spent_seconds: visitor.timeSpentSeconds,
          ...payload,
        }),
      },
    ],
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${settings.metaPixelId}/events?access_token=${encodeURIComponent(
      settings.metaAccessToken
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    }
  ).finally(() => clearTimeout(timeout));

  return response.ok;
}

export async function sendVisitorSignal(
  visitor: Visitor,
  eventName: string,
  payload: Record<string, unknown> = {}
) {
  const settings = await fetchPrivateSiteSettingsFromDb();
  const result = {
    sentToMeta: false,
    sentToGoogle: Boolean(settings.googleAdsTagId),
    sentToTikTok: Boolean(settings.tiktokPixelId),
    error: null as string | null,
  };

  try {
    result.sentToMeta = await sendMetaEvent(settings, visitor, eventName, payload);
  } catch (error) {
    result.error = error instanceof Error ? error.message : "Meta signal failed";
  }

  return result;
}
