"use client";

export const VISITOR_STORAGE_KEY = "bbte_visitor_id";
export const PREVIOUS_VISITOR_STORAGE_KEY = "bbte_previous_visitor_id";
// Per-deployment canonical host; when unset, visitor URLs keep their own host.
const CANONICAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || "";

function makeVisitorKey() {
  const alphabet = "0123456789abcdefghijklmnopqrstuvwxyz";
  const bytes = new Uint8Array(12);

  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
    return `v_${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`;
  }

  return `v_${Math.random().toString(36).slice(2, 14).padEnd(12, "0")}`;
}

function isLegacyVisitorKey(value: string) {
  return value.length > 20 || value.startsWith("vis_");
}

export function getOrCreateVisitorKey() {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing && !isLegacyVisitorKey(existing)) return existing;

  const next = makeVisitorKey();
  if (existing && existing !== next) {
    window.sessionStorage.setItem(PREVIOUS_VISITOR_STORAGE_KEY, existing);
  }
  window.localStorage.setItem(VISITOR_STORAGE_KEY, next);
  return next;
}

export function consumePreviousVisitorKey() {
  if (typeof window === "undefined") return "";

  const previous = window.sessionStorage.getItem(PREVIOUS_VISITOR_STORAGE_KEY) || "";
  if (previous) window.sessionStorage.removeItem(PREVIOUS_VISITOR_STORAGE_KEY);
  return previous;
}

export function peekPreviousVisitorKey() {
  if (typeof window === "undefined") return "";
  return window.sessionStorage.getItem(PREVIOUS_VISITOR_STORAGE_KEY) || "";
}

export function canonicalizeVisitorUrl(value: string | null | undefined) {
  if (!value) return "";
  if (!CANONICAL_SITE_URL) return value;

  try {
    const url = new URL(value);
    const canonical = new URL(CANONICAL_SITE_URL);

    if (
      url.hostname.endsWith(".vercel.app") &&
      url.hostname !== canonical.hostname
    ) {
      url.protocol = canonical.protocol;
      url.host = canonical.host;
      return url.toString();
    }

    return value;
  } catch {
    return value;
  }
}
