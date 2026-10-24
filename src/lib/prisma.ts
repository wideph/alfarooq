import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// §W28 perf: Prisma ka Rust engine `pgbouncer=true` mode mein HAR query ko
// BEGIN + DEALLOCATE ALL + query + COMMIT mein lapet-ta hai — yani har query
// 4-5 network round trips (live DB pg_stat_statements mein ~3.7 lakh
// BEGIN/DEALLOCATE/COMMIT). `pg` driver adapter wahi Supavisor transaction
// pooler (6543) par har query EK round trip mein bhejta hai (unnamed
// statements — transaction pooling ke saath safe). Nataij byte-for-byte same
// (verified), har query ~4.7x tez.
function poolerConnectionString() {
  const raw = process.env.DATABASE_URL || "";
  try {
    const url = new URL(raw);
    // Engine-only flags — pg driver inhein nahi samajhta.
    for (const key of ["pgbouncer", "connection_limit", "pool_timeout", "statement_cache_size", "schema"]) {
      url.searchParams.delete(key);
    }
    return url.toString();
  } catch {
    return raw;
  }
}

function createPrismaClient() {
  const adapter = new PrismaPg({
    connectionString: poolerConnectionString(),
    // Supabase pooler TLS (engine ke `sslmode=prefer` jaisa: encrypted, cert
    // verify nahi — Supabase CA bundle ke baghair).
    ssl: { rejectUnauthorized: false },
    // Ek page 5–9 API calls parallel karta hai (Vercel fluid compute par aksar
    // ek hi instance) — 5 connections par woh line mein lag jati thin.
    // Supavisor transaction pooler client connections sasti hain.
    max: 10,
    idleTimeoutMillis: 20_000,
    connectionTimeoutMillis: 15_000,
  });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

globalForPrisma.prisma = prisma;
