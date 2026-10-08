"use client";

import { announceOfficeChange } from "@/lib/office/live";

// Small fetch helpers shared by office pages. Every API returns { error } on
// failure, so callers get a single string to show.
export async function officeFetch<T>(
  url: string,
  init?: RequestInit & { json?: unknown }
): Promise<{ ok: true; data: T } | { ok: false; error: string; status: number }> {
  const { json, ...rest } = init || {};
  const method = (rest.method || (json !== undefined ? "POST" : "GET")).toUpperCase();
  const res = await fetch(url, {
    ...rest,
    ...(json !== undefined
      ? { headers: { "Content-Type": "application/json", ...(rest.headers || {}) }, body: JSON.stringify(json) }
      : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return { ok: false, error: (data && data.error) || `Request fail (${res.status})`, status: res.status };
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
