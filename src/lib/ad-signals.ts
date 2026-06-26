import crypto from "crypto";
import type { SiteSettings, Visitor } from "@prisma/client";
import { fetchPrivateSiteSettingsFromDb } from "@/lib/get-site-settings";

export const VISITOR_STATUS_OPTIONS = [
  { value: "visitor", label: "Visitor", eventName: "PageView" },
  { value: "new_order", label: "New Order", eventName: "Lead" },
  { value: "payment_pending", label: "Payment Pending", eventName: "InitiateCheckout" },
  { value: "order_complete", label: "Order Complete", eventName: "Purchase" },
  { value: "repeat_order", label: "Repeat Ordered", eventName: "RepeatOrdered" },
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

function eventSourceUrl(visitor: Visitor) {
  return visitor.currentPath || visitor.landingPage || undefined;
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
          external_id: sha256(visitor.visitorKey),
          client_user_agent: visitor.userAgent || undefined,
        },
        custom_data: {
          visitor_id: visitor.visitorKey,
          visitor_status: visitor.status,
          source: visitor.source,
          medium: visitor.medium,
          campaign: visitor.campaign,
          time_spent_seconds: visitor.timeSpentSeconds,
          ...payload,
        },
      },
    ],
  };

  const response = await fetch(
    `https://graph.facebook.com/v20.0/${settings.metaPixelId}/events?access_token=${encodeURIComponent(
      settings.metaAccessToken
    )}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }
  );

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
