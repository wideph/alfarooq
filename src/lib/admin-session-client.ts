"use client";

import type { AdminNavUser } from "@/components/admin/AdminNav";

let cachedAdmin: AdminNavUser | null = null;
let cachedAt = 0;
let inflight: Promise<AdminNavUser | null> | null = null;

const CACHE_MS = 60_000;

export function getCachedAdminSession() {
  if (cachedAdmin && Date.now() - cachedAt < CACHE_MS) return cachedAdmin;
  return null;
}

export function clearCachedAdminSession() {
  cachedAdmin = null;
  cachedAt = 0;
  inflight = null;
}

export function loadAdminSession() {
  const cached = getCachedAdminSession();
  if (cached) return Promise.resolve(cached);

  if (!inflight) {
    inflight = fetch("/api/auth/me")
      .then(async (res) => {
        if (!res.ok) return null;
        const data = await res.json();
        cachedAdmin = data.admin || null;
        cachedAt = Date.now();
        return cachedAdmin;
      })
      .finally(() => {
        inflight = null;
      });
  }

  return inflight;
}
