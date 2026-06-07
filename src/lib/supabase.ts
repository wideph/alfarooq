import { createClient, SupabaseClient } from "@supabase/supabase-js";

const globalForSupabase = globalThis as unknown as { supabaseAdmin?: SupabaseClient };

export function getSupabaseAdmin(): SupabaseClient {
  if (globalForSupabase.supabaseAdmin) {
    return globalForSupabase.supabaseAdmin;
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error("Supabase environment variables are not configured");
  }

  globalForSupabase.supabaseAdmin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return globalForSupabase.supabaseAdmin;
}

export function getStorageBucket(): string {
  return process.env.SUPABASE_STORAGE_BUCKET || "uploads";
}
