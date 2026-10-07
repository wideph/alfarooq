import { Prisma } from "@prisma/client";

// Prisma Decimal → number (2 dp) so API JSON stays plain. Dates are left as-is
// (NextResponse.json serialises them to ISO strings).
export function toJson<T>(value: T): unknown {
  if (value === null || value === undefined) return value;
  if (value instanceof Prisma.Decimal) return Number(value.toFixed(2));
  if (value instanceof Date) return value;
  if (Array.isArray(value)) return value.map((item) => toJson(item));
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[key] = toJson(item);
    }
    return out;
  }
  return value;
}

// Date-only helpers. Office dates are stored as UTC midnight of the Pakistan
// calendar date, so "2026-10-01" round-trips without timezone drift.
export function parseDateOnly(input: unknown): Date | null {
  if (typeof input !== "string") return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCMonth() !== Number(match[2]) - 1) return null;
  return date;
}

export function formatDateOnly(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

// Today's calendar date in Pakistan (UTC+5, no DST) as UTC midnight.
export function todayPakistan(): Date {
  const shifted = new Date(Date.now() + 5 * 3_600_000);
  return new Date(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), shifted.getUTCDate()));
}

export function cleanText(input: unknown, max = 500): string | null {
  if (typeof input !== "string") return null;
  const text = input.trim();
  return text ? text.slice(0, max) : null;
}
