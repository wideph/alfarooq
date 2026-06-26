"use client";

export const VISITOR_STORAGE_KEY = "bbte_visitor_id";

function makeVisitorKey() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `vis_${crypto.randomUUID()}`;
  }
  return `vis_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

export function getOrCreateVisitorKey() {
  if (typeof window === "undefined") return "";

  const existing = window.localStorage.getItem(VISITOR_STORAGE_KEY);
  if (existing) return existing;

  const next = makeVisitorKey();
  window.localStorage.setItem(VISITOR_STORAGE_KEY, next);
  return next;
}
