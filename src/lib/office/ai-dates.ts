import type { Prisma, SiteSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PROVIDER_TIMEOUT_MS, callBotJson } from "@/lib/bot-ai";
import { SITE_SETTINGS_ID } from "@/lib/site-settings";
import { addDays, formatDateOnly, todayPakistan } from "@/lib/office/serializers";
import { DayResolver, type DayRule } from "@/lib/office/day-rules";

// docs/office-module/06 §N5/N6 — AI date research.
// §W60 — AI ab sirf MAZEED band din dhoondta hai (additive), kabhi kisi din ko
// "khula" nahi kehta, aur fail ho to kuch cache nahi hota:
//   • Pehle AI ka "working day" verdict (ya AI fail par weekend-only andaza)
//     WorkingDayCache mein hamesha ke liye likha jata tha aur baad mein usi par
//     bharosa hota tha — 9 Nov (Iqbal Day) jaisi pakki chhutti bhi "khuli" ban
//     jati. Ab pakki chhuttiyan code ka built-in calendar (holiday-calendar.ts)
//     deta hai; AI ke dhoonde band din HolidayClosure mein "AI:" ke saath jaate
//     hain (admin panel mein nazar aate / edit / delete hote hain).
//   • Dates ab AI ke intezar ke baghair FORAN lagti hain (day-rules.ts); AI
//     baad mein (after() / roz ka cron) research karta hai aur naya band din
//     mile to planner pending dates aage kar deta hai.
//   • Har scan (scope + 14 din ki window) OfficeDateScan mein yaad — aane wali
//     window har 7 din baad dobara (nayi announcement), guzri hui ek dafa.
// NOTE: model internet search nahi karta — apne ilm se jawab deta hai. Is
// liye wo sirf izafi hifazat hai; asal bharosa built-in calendar + admin table.

type Db = Prisma.TransactionClient | typeof prisma;

export const AI_REASON_PREFIX = "AI:";

export type CityName = "ISLAMABAD" | "QUETTA" | "GUJRAT" | "LAHORE";

export type AiQuestion =
  | { kind: "PAKISTAN" }
  | { kind: "SAUDI" }
  | { kind: "CITY"; city: CityName }
  | { kind: "EMBASSY" };

export type ResearchedDate = { date: Date; reason: string | null };

const PAKISTAN_WEEKEND = new Set([0, 6]); // Sun, Sat

// Ek AI scan kitne din dekhta hai (ek call poori window ka jawab).
const SCAN_WINDOW_DAYS = 14;
// Aane wali window kitne din baad dobara scan ho.
const RESCAN_FUTURE_DAYS = 7;

// Reasoning models (e.g. deepseek-v4-pro) ko jawab mein waqt lagta hai.
export const AI_DATES_VERDICT_TIMEOUT_MS = 90_000;

const CITY_SCOPES = new Set(["ISLAMABAD", "QUETTA", "GUJRAT", "LAHORE"]);

function parseIsoDate(input: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function questionForScope(scope: string): AiQuestion | null {
  if (scope === "PAKISTAN") return { kind: "PAKISTAN" };
  if (scope === "SAUDI") return { kind: "SAUDI" };
  if (scope === "EMBASSIES_ISB") return { kind: "EMBASSY" };
  if (CITY_SCOPES.has(scope)) return { kind: "CITY", city: scope as CityName };
  return null;
}

/** Ek DayRule kin scopes par mabni hai (research ke liye). */
export function scopesOfRule(rule: DayRule): string[] {
  const scopes = new Set<string>([rule.country === "PK" ? "PAKISTAN" : "SAUDI"]);
  if (rule.city) scopes.add(rule.city);
  for (const city of rule.anyCity ?? []) scopes.add(city);
  for (const scope of rule.extraScopes ?? []) scopes.add(scope);
  return [...scopes];
}

async function loadBotSettings(db: Db): Promise<SiteSettings | null> {
  try {
    const settings = await db.siteSettings.findUnique({ where: { id: SITE_SETTINGS_ID } });
    if (!settings || !settings.botEnabled || !settings.botApiKey || !settings.botModel) return null;
    return settings;
  } catch (error) {
    console.warn("[ai-dates] settings load fail", error instanceof Error ? error.message : error);
    return null;
  }
}

// --- Prompts ---------------------------------------------------------------

const PAKISTAN_HOLIDAY_RULES = [
  "Pakistan working days are Monday to Friday (Saturday and Sunday are weekend).",
  "Public/national holidays include: Kashmir Day (5 Feb), Pakistan Day (23 Mar),",
  "Labour Day (1 May), Youm-e-Takbeer (28 May, from 2024), Eid ul Fitr (about 3 days, Islamic calendar),",
  "Independence Day (14 Aug), Ashura (9-10 Muharram), Eid Milad un Nabi (12 Rabi ul Awal),",
  "Eid ul Adha (about 3 days), Iqbal Day (9 Nov), Quaid-e-Azam Day (25 Dec), plus any federal",
  "government announced holiday of that year. Use the most accurate Islamic-calendar",
  "dates you know for the specific year (Pakistan usually sights the moon a day after Saudi Arabia).",
].join(" ");

const SAUDI_HOLIDAY_RULES = [
  "Saudi Arabia working days are Sunday to Thursday (Friday and Saturday are weekend).",
  "Saudi public holidays include: Founding Day (22 Feb), Eid ul Fitr holidays,",
  "Arafat Day + Eid ul Adha holidays (government offices close for many days around both Eids),",
  "Saudi National Day (23 Sep), plus any officially announced holiday of that year.",
  "Use the most accurate Umm al-Qura dates you know.",
].join(" ");

function scanSystemPrompt(question: AiQuestion): string {
  switch (question.kind) {
    case "PAKISTAN":
      return [
        "You are an expert researcher on Pakistan's government working days and public",
        `holidays for any year 2019-2030. ${PAKISTAN_HOLIDAY_RULES}`,
        "Answer with JSON only.",
      ].join(" ");
    case "SAUDI":
      return [
        "You are an expert researcher on Saudi Arabia's government working days and",
        `public holidays for any year 2019-2030. ${SAUDI_HOLIDAY_RULES}`,
        "Answer with JSON only.",
      ].join(" ");
    case "CITY":
      return [
        "You are an expert researcher on city-level administrative closures in Pakistan",
        "(incidents, security preparations, strikes, protests, lockdowns, local holiday announcements)",
        "for any year 2019-2030. Answer with JSON only.",
      ].join(" ");
    case "EMBASSY":
      return [
        "You are an expert researcher on foreign embassies in Islamabad, Pakistan —",
        "their closures and work-suspension announcements (security alerts, incidents,",
        "preparations, their own national holidays) for any year 2019-2030. Answer with JSON only.",
      ].join(" ");
  }
}

function scanUserPrompt(question: AiQuestion, from: string, to: string): string {
  const window = `the ${SCAN_WINDOW_DAYS} days from ${from} to ${to}`;
  const tail = 'Return exactly: {"closedDates":[{"date":"YYYY-MM-DD","reason":"short reason"}]} — an empty array if none.';
  switch (question.kind) {
    case "PAKISTAN":
      return [
        `Consider ${window}. Which of these dates are/were NOT working days in Pakistan`,
        "(national/public/federal holidays or announced closures)? Ignore Saturdays and",
        "Sundays (already weekend). Include a date if it is likely a holiday.",
        tail,
      ].join(" ");
    case "SAUDI":
      return [
        `Consider ${window}. Which of these dates are/were NOT working days for Saudi government`,
        "offices (Ministry of Foreign Affairs)? Ignore Fridays and Saturdays (already weekend).",
        "Include a date if it is likely a holiday.",
        tail,
      ].join(" ");
    case "CITY":
      return [
        `Was the city of ${question.city} (Pakistan) closed for official/business work on`,
        `any of ${window} — due to any incident, security preparation, strike, protest, lockdown`,
        "or local holiday announcement? Ignore Saturdays/Sundays and nationwide holidays.",
        tail,
      ].join(" ");
    case "EMBASSY":
      return [
        `Were embassies in Islamabad (especially the Saudi embassy) closed, or was embassy work`,
        `suspended/announced, on any of ${window} (security alerts, incidents, preparations, Saudi holidays)?`,
        tail,
      ].join(" ");
  }
}

// --- AI closure scan ---------------------------------------------------------

type ScannedClosure = { date: Date; reason: string | null };

async function scanClosuresWithAi(
  settings: SiteSettings,
  question: AiQuestion,
  from: Date,
  timeoutMs: number
): Promise<ScannedClosure[] | null> {
  const fromText = formatDateOnly(from);
  const toText = formatDateOnly(addDays(from, SCAN_WINDOW_DAYS - 1));
  try {
    const raw = await callBotJson(
      settings,
      scanSystemPrompt(question),
      scanUserPrompt(question, fromText, toText),
      '{"closedDates"',
      6000,
      timeoutMs
    );
    const parsed = JSON.parse(raw) as { closedDates?: Array<{ date?: string; reason?: string }> };
    if (!Array.isArray(parsed.closedDates)) return null;
    const end = addDays(from, SCAN_WINDOW_DAYS);
    const out: ScannedClosure[] = [];
    const seen = new Set<string>();
    for (const item of parsed.closedDates) {
      const date = parseIsoDate(String(item?.date || ""));
      if (!date || date < from || date >= end) continue;
      const key = formatDateOnly(date);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ date, reason: String(item?.reason || "").slice(0, 180) || null });
    }
    return out;
  } catch (error) {
    console.warn("[ai-dates] AI scan fail", question.kind, fromText, error instanceof Error ? error.message : error);
    return null;
  }
}

// AI ke band din HolidayClosure mein ("AI:" ke saath). Admin ki row kabhi nahi
// chhuti (update no-op). Kitni NAYI rows bani — wapas.
async function cacheClosures(db: Db, scope: string, closures: ScannedClosure[]): Promise<number> {
  let created = 0;
  for (const closure of closures) {
    const existing = await db.holidayClosure.findUnique({ where: { date_scope: { date: closure.date, scope } } });
    if (existing) continue;
    const reason = closure.reason ? `${AI_REASON_PREFIX} ${closure.reason}` : AI_REASON_PREFIX;
    await db.holidayClosure.create({ data: { date: closure.date, scope, reason } });
    created += 1;
  }
  return created;
}

// 14-din ki mustaqil windows (har date hamesha isi window mein).
function windowStart(date: Date): Date {
  const day = Math.floor(date.getTime() / 86_400_000);
  return new Date((day - (day % SCAN_WINDOW_DAYS)) * 86_400_000);
}

/**
 * In dates / scopes ke liye AI research (jo window pehle scan nahi hui ya
 * purani ho chuki). Sirf band din jodta hai. Kitne naye band din mile — wapas.
 * AI na ho / fail ho → 0 (kuch cache nahi).
 */
export async function researchClosures(
  targets: Array<{ date: Date; scopes: string[] }>,
  opts: { maxScans?: number; timeoutMs?: number } = {},
  db: Db = prisma
): Promise<number> {
  const settings = await loadBotSettings(db);
  if (!settings) return 0;
  const today = todayPakistan();
  const wanted = new Map<string, { scope: string; start: Date }>();
  for (const target of targets) {
    const start = windowStart(target.date);
    for (const scope of target.scopes) {
      if (!questionForScope(scope)) continue;
      wanted.set(`${scope}|${start.getTime()}`, { scope, start });
    }
  }
  if (wanted.size === 0) return 0;
  let done: Array<{ scope: string; windowStart: Date; scannedAt: Date }>;
  try {
    done = await db.officeDateScan.findMany({
      where: {
        OR: [...wanted.values()].map((item) => ({ scope: item.scope, windowStart: item.start })),
      },
    });
  } catch (error) {
    // Table abhi na ho (migration baqi) → research chhor do; dates phir bhi theek.
    console.warn("[ai-dates] scan memo unavailable", error instanceof Error ? error.message : error);
    return 0;
  }
  const pending = [...wanted.values()].filter((item) => {
    const scan = done.find((row) => row.scope === item.scope && row.windowStart.getTime() === item.start.getTime());
    if (!scan) return true;
    const windowPast = addDays(item.start, SCAN_WINDOW_DAYS) <= today;
    return !windowPast && scan.scannedAt < addDays(new Date(), -RESCAN_FUTURE_DAYS);
  });
  const batch = pending.slice(0, opts.maxScans ?? 6);
  const results = await Promise.all(
    batch.map(async (item) => {
      const closures = await scanClosuresWithAi(
        settings,
        questionForScope(item.scope)!,
        item.start,
        opts.timeoutMs ?? AI_DATES_VERDICT_TIMEOUT_MS
      );
      if (!closures) return 0;
      const created = await cacheClosures(db, item.scope, closures);
      await db.officeDateScan.upsert({
        where: { scope_windowStart: { scope: item.scope, windowStart: item.start } },
        update: { scannedAt: new Date(), closedCount: closures.length },
        create: { scope: item.scope, windowStart: item.start, scannedAt: new Date(), closedCount: closures.length },
      });
      return created;
    })
  );
  return results.reduce((sum, value) => sum + value, 0);
}

// --- Batch research: working dates of a year (2019 pool) ---------------------

/**
 * Asks the AI for a list of Pakistan working dates of `year` (any 2019-2026).
 * Validates: right year, Monday-Friday, not in excludeDates, and (§W60) koi
 * built-in / table / AI chhutti nahi (DayResolver), deduped. Returns at most
 * `count` valid entries; an empty array when the AI is unavailable or
 * everything failed validation (callers must NOT fabricate dates in that case).
 */
export async function aiResearchWorkingDates(
  year: number,
  count: number,
  excludeDates: string[] = [],
  db: Db = prisma,
  timeoutMs: number = PROVIDER_TIMEOUT_MS
): Promise<ResearchedDate[]> {
  if (count <= 0) return [];
  const settings = await loadBotSettings(db);
  if (!settings) {
    console.warn(`[ai-dates] research ${year} skipped — AI key/model missing`);
    return [];
  }

  const exclude = new Set(excludeDates);
  const days = new DayResolver(db);
  await days.ensure(new Date(Date.UTC(year, 0, 1)), new Date(Date.UTC(year, 11, 31)));

  const system = [
    "You are an expert researcher on Pakistan's government working days and public",
    `holidays. ${PAKISTAN_HOLIDAY_RULES}`,
    "Answer with JSON only.",
  ].join(" ");

  const ask = async (needed: number, excluded: Set<string>): Promise<ResearchedDate[]> => {
    const user = [
      `List ${needed} different Pakistan WORKING days of the year ${year}.`,
      "Rules: Monday to Friday only; none of them is a public/national/announced holiday",
      `of ${year}; spread them across different months of the year; and NONE of these`,
      `excluded dates: ${[...excluded].sort().join(", ") || "(none)"}.`,
      'Return exactly: {"dates":[{"date":"YYYY-MM-DD","reason":"short reason, e.g. normal working Tuesday"}]}',
    ].join(" ");
    // Big token budget: reasoning models spend most tokens on reasoning, and
    // an exhausted budget comes back as EMPTY content (JSON.parse would fail).
    const raw = await callBotJson(settings, system, user, '{"dates"', 12000, timeoutMs);
    const parsed = JSON.parse(raw) as { dates?: Array<{ date?: string; reason?: string }> };
    if (!Array.isArray(parsed.dates)) return [];
    const valid: ResearchedDate[] = [];
    const seen = new Set<string>();
    for (const item of parsed.dates) {
      const date = parseIsoDate(String(item?.date || ""));
      if (!date) continue;
      const key = formatDateOnly(date);
      if (date.getUTCFullYear() !== year) continue;
      if (PAKISTAN_WEEKEND.has(date.getUTCDay())) continue;
      if (excluded.has(key) || seen.has(key)) continue;
      // §W60: AI ki "working" date bhi built-in calendar / table se check.
      if (!(await days.verdict(date, { country: "PK", city: "QUETTA" })).open) continue;
      seen.add(key);
      valid.push({ date, reason: String(item?.reason || "").slice(0, 200) || null });
    }
    return valid;
  };

  try {
    const collected: ResearchedDate[] = [];
    const asked = new Set(exclude);
    // Up to two rounds: the second asks for replacements of whatever the first
    // round lost to validation.
    for (let round = 0; round < 2 && collected.length < count; round += 1) {
      const batch = await ask(count - collected.length + 5, asked);
      for (const item of batch) {
        const key = formatDateOnly(item.date);
        if (asked.has(key)) continue;
        asked.add(key);
        collected.push(item);
        if (collected.length >= count) break;
      }
      if (batch.length === 0) break; // AI gave nothing usable — no point retrying
    }
    return collected.slice(0, count);
  } catch (error) {
    console.warn("[ai-dates] research fail", year, error instanceof Error ? error.message : error);
    return [];
  }
}
