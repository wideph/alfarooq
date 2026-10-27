"use client";

import { announceOfficeChange } from "@/lib/office/live";

type RawResult = { ok: boolean; status: number; text: string };

// §W28 perf: ek hi waqt mein chal rahi BILKUL same GET requests (maslan do
// panels ek sath categories maangein, ya page + strip same finance report)
// ek hi network call share karti hain. Sirf in-flight dedup — jawab aane ke
// baad kuch cache nahi hota (agli call hamesha taaza). Har caller apna JSON
// khud parse karta hai, is liye objects alag alag rehte hain.
const inflightGets = new Map<string, Promise<RawResult>>();

async function rawFetch(url: string, init: RequestInit): Promise<RawResult> {
  try {
    const res = await fetch(url, init);
    const text = await res.text().catch(() => "");
    return { ok: res.ok, status: res.status, text };
  } catch {
    // Network error — pehle officeFetch throw karta tha (callers ka busy /
    // loading state atak jata tha); ab saaf error result.
    return { ok: false, status: 0, text: JSON.stringify({ error: "Internet / server se rabta nahi ho saka" }) };
  }
}

// Small fetch helpers shared by office pages. Every API returns { error } on
// failure, so callers get a single string to show. Kabhi throw nahi karta.
export async function officeFetch<T>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number; data?: unknown }> {
  const { json, ...rest } = init || {};
  const method = (rest.method || (json !== undefined ? "POST" : "GET")).toUpperCase();
  const requestInit: RequestInit = {
    ...rest,
    ...(json !== undefined
      ? { headers: { "Content-Type": "application/json", ...(rest.headers || {}) }, body: JSON.stringify(json) }
      : {}),
  };

  let raw: RawResult;
  const dedupable = method === "GET" && !rest.body && !rest.signal && !rest.headers && !rest.cache;
  if (dedupable) {
    let pending = inflightGets.get(url);
    if (!pending) {
      pending = rawFetch(url, requestInit).finally(() => inflightGets.delete(url));
      inflightGets.set(url, pending);
    }
    raw = await pending;
  } else {
    raw = await rawFetch(url, requestInit);
  }

  let data: unknown = {};
  try {
    data = raw.text ? JSON.parse(raw.text) : {};
  } catch {
    data = {};
  }
  if (!raw.ok) {
    const error = (data as { error?: unknown } | null)?.error;
    return {
      ok: false,
      error: typeof error === "string" && error ? error : `Request fail (${raw.status})`,
      status: raw.status,
      data,
    };
  }
  // §W11.5: successful non-GET mutation ke baad baqi live-refresh listeners
  // ko signal (300ms debounce ke saath refresh hota hai).
  if (method !== "GET") announceOfficeChange();
  return { ok: true, data: data as T };
}

export function formatMoney(value: number | string | null | undefined) {
  const amount = Number(value || 0);
  return `Rs ${amount.toLocaleString("en-PK", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

export function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

export function formatDateTime(value: string | Date | null | undefined) {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

// <input type="date"> value for a stored date-only (UTC midnight) value.
export function toInputDate(value: string | Date | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function todayInputDate() {
  const shifted = new Date(Date.now() + 5 * 3_600_000);
  return shifted.toISOString().slice(0, 10);
}
