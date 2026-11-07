import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, formatDateOnly } from "@/lib/office/serializers";
import { builtinHolidayReason, type CalendarCountry } from "@/lib/office/holiday-calendar";

// §W60 — EK hi qaida jo batata hai ke koi din kisi kaam ke liye khula hai ya
// nahi. Har date (set engine, bina set attestations, extra service, expected
// printing date, admin ki haath ki date) yahi istemal karti hai — pehle har
// jagah alag tareeqa tha (kahin sirf table, kahin AI, kahin sirf weekend).
//
// Tarteeb (pehli band wajah jeet jati hai):
//   1. Allowed weekdays (maslan Saudi Embassy sirf Tue–Fri, Mofa Saudi Mon–Wed)
//   2. Weekend (Pakistan Sat+Sun, Saudi Fri+Sat)
//   3. Admin ki HolidayClosure row (country + city + extra scopes) — hamesha band
//   4. Built-in calendar (holiday-calendar.ts) — sirf admin ka MANUAL "working
//      day" override (WorkingDayCache) khol sakta hai (Pakistan)
//   5. AI ki dhoondi band (HolidayClosure "AI:" row, WorkingDayCache AI band)
//      — admin ka MANUAL override khol sakta hai
//   FALLBACK cache rows (AI fail ke waqt weekend-only andaza) kabhi nahi
//   mane jate — wahi purana bug tha.
// Koi AI call yahan nahi: tez aur har dafa ek jaisa. AI sirf background mein
// mazeed band din dhoond kar tables mein daalta hai (ai-dates.ts).

type Db = Prisma.TransactionClient | typeof prisma;

export type CityScope = "ISLAMABAD" | "QUETTA" | "GUJRAT" | "LAHORE";
export const MOFA_CITY_PRIORITY: CityScope[] = ["ISLAMABAD", "GUJRAT", "LAHORE"];

export type DayRule = {
  country: CalendarCountry;
  city?: CityScope;
  // Kai cities mein se KOI EK khuli ho (Special Mofa: Islamabad → Gujrat → Lahore).
  anyCity?: CityScope[];
  extraScopes?: string[];
  allowedWeekdays?: number[]; // UTC weekday (0 = Sunday)
};

export type DayVerdict = { open: boolean; reason: string | null; city?: CityScope | null };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const WEEKEND: Record<CalendarCountry, Set<number>> = { PK: new Set([0, 6]), SA: new Set([5, 6]) };
const AI_PREFIX = "AI:";
const MAX_SEARCH_DAYS = 120;

function dayOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

type ClosureRow = { reason: string | null; ai: boolean };
type CacheRow = { isCandidateWorking: boolean; workingDate: Date; reason: string | null; source: string };

// DB rows ek dafa (range ke hisaab se) load karke memory mein — loop har din
// DB par nahi jata. Ek request / transaction ke liye ek resolver.
export class DayResolver {
  private ranges: Array<[number, number]> = [];
  private closures = new Map<string, Map<string, ClosureRow>>();
  private cache = new Map<string, CacheRow>();

  constructor(private db: Db = prisma) {}

  private covered(from: Date, to: Date) {
    return this.ranges.some(([start, end]) => start <= from.getTime() && end >= to.getTime());
  }

  async ensure(fromInput: Date, toInput: Date) {
    const from = dayOnly(fromInput);
    const to = dayOnly(toInput);
    if (this.covered(from, to)) return;
    // Thora bara tukra load karo taake agle din bhi isi mein hon.
    const start = addDays(from, -7);
    const end = addDays(to, 60);
    const [closures, cacheRows] = await Promise.all([
      this.db.holidayClosure.findMany({
        where: { date: { gte: start, lte: end } },
        select: { date: true, scope: true, reason: true },
      }),
      this.db.workingDayCache.findMany({
        where: { candidateDate: { gte: start, lte: end } },
        select: { candidateDate: true, workingDate: true, isCandidateWorking: true, reason: true, source: true },
      }),
    ]);
    for (const row of closures) {
      const key = formatDateOnly(row.date);
      const scopes = this.closures.get(key) ?? new Map<string, ClosureRow>();
      scopes.set(row.scope, { reason: row.reason, ai: (row.reason || "").startsWith(AI_PREFIX) });
      this.closures.set(key, scopes);
    }
    for (const row of cacheRows) this.cache.set(formatDateOnly(row.candidateDate), row);
    this.ranges.push([start.getTime(), end.getTime()]);
  }

  // Admin ne "Working days" panel se ye din khula mark kiya (Pakistan)?
  private manualOpen(key: string, date: Date) {
    const row = this.cache.get(key);
    return Boolean(row && row.source === "MANUAL" && row.isCandidateWorking && dayOnly(row.workingDate).getTime() === date.getTime());
  }

  private scopeClosed(key: string, scope: string, manualOpen: boolean): string | null {
    const row = this.closures.get(key)?.get(scope);
    if (!row) return null;
    if (row.ai && manualOpen) return null;
    const reason = (row.reason || "").replace(/^AI:\s*/, "").trim();
    const label = scope === "PAKISTAN" ? "" : `${scope}: `;
    return `${label}${reason || "band (holiday table)"}${row.ai ? " (AI)" : ""}`;
  }

  /** Is din ye kaam ho sakta hai? Band ho to wajah. */
  async verdict(dateInput: Date, rule: DayRule): Promise<DayVerdict> {
    const date = dayOnly(dateInput);
    await this.ensure(date, date);
    const key = formatDateOnly(date);
    const weekday = date.getUTCDay();
    if (rule.allowedWeekdays && !rule.allowedWeekdays.includes(weekday)) {
      return { open: false, reason: `${WEEKDAYS[weekday]} — is kaam ke din ${rule.allowedWeekdays.map((d) => WEEKDAYS[d].slice(0, 3)).join("/")}` };
    }
    if (WEEKEND[rule.country].has(weekday)) {
      return { open: false, reason: `${WEEKDAYS[weekday]} (${rule.country === "SA" ? "Saudi" : "Pakistan"} weekend)` };
    }
    const manualOpen = rule.country === "PK" && this.manualOpen(key, date);
    const baseScope = rule.country === "PK" ? "PAKISTAN" : "SAUDI";
    const scopes = [baseScope, ...(rule.city ? [rule.city] : []), ...(rule.extraScopes ?? [])];
    for (const scope of scopes) {
      const closed = this.scopeClosed(key, scope, manualOpen);
      if (closed) return { open: false, reason: closed };
    }
    if (!manualOpen) {
      const builtin = builtinHolidayReason(date, rule.country);
      if (builtin) return { open: false, reason: builtin };
      if (rule.country === "PK") {
        const cached = this.cache.get(key);
        if (cached && !cached.isCandidateWorking && (cached.source === "AI" || cached.source === "MANUAL")) {
          return { open: false, reason: `${cached.reason || "Chhutti"}${cached.source === "AI" ? " (AI)" : ""}` };
        }
      }
    }
    if (rule.anyCity?.length) {
      for (const city of rule.anyCity) {
        if (!this.scopeClosed(key, city, false)) return { open: true, reason: null, city };
      }
      return { open: false, reason: `${rule.anyCity.join(" / ")} sab band` };
    }
    return { open: true, reason: null, city: rule.city ?? null };
  }

  /** `candidate` ya us ke baad pehla khula din. */
  async firstOpen(candidateInput: Date, rule: DayRule): Promise<{ date: Date; city: CityScope | null; skipped: string[] }> {
    let date = dayOnly(candidateInput);
    await this.ensure(date, addDays(date, MAX_SEARCH_DAYS));
    const skipped: string[] = [];
    for (let i = 0; i < MAX_SEARCH_DAYS; i += 1) {
      const verdict = await this.verdict(date, rule);
      if (verdict.open) return { date, city: verdict.city ?? null, skipped };
      if (verdict.reason && skipped.length < 10) skipped.push(`${formatDateOnly(date)}: ${verdict.reason}`);
      date = addDays(date, 1);
    }
    // 120 din mein koi din nahi (na-mumkin halat) — weekend-only aakhri hal.
    while (WEEKEND[rule.country].has(date.getUTCDay())) date = addDays(date, 1);
    return { date, city: rule.city ?? rule.anyCity?.[0] ?? null, skipped };
  }
}

export const PAKISTAN_RULE: DayRule = { country: "PK" };
