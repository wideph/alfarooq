import type { Prisma, SiteSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PROVIDER_TIMEOUT_MS, callBotJson } from "@/lib/bot-ai";
import { SITE_SETTINGS_ID } from "@/lib/site-settings";
import { addDays, formatDateOnly } from "@/lib/office/serializers";

// docs/office-module/06 §N5/N6 — AI-FIRST date research layer.
// The owner's brief: an attached AI model RESEARCHES and DECIDES the dates —
// whether a date was a working day in Pakistan / a city, whether Islamabad had
// closures due to incidents/preparations, whether embassies were closed, which
// city to use, and it researches 2019 working dates into the admin pool.
// Every AI verdict is cached: closures are upserted into HolidayClosure (so
// they show in the admin Holidays panel and stay editable/deletable), and
// Pakistan working-day verdicts go into WorkingDayCache (source "AI").
// Admin edits always win: a HolidayClosure row whose reason does NOT start
// with AI_REASON_PREFIX is treated as MANUAL and is never overwritten, and a
// MANUAL WorkingDayCache row is never overwritten either.
// Fallback: only when the AI key is missing or a call fails/returns invalid
// JSON do we fall back to the deterministic weekend + HolidayClosure-table
// logic (and log via console.warn).

type Db = Prisma.TransactionClient | typeof prisma;

export const AI_REASON_PREFIX = "AI:";

export type CityName = "ISLAMABAD" | "QUETTA" | "GUJRAT" | "LAHORE";

export type AiQuestion =
  | { kind: "PAKISTAN" }
  | { kind: "SAUDI" }
  | { kind: "CITY"; city: CityName }
  | { kind: "EMBASSY" };

export type AiVerdict = {
  date: string; // YYYY-MM-DD that was asked about
  kind: AiQuestion["kind"];
  city: CityName | null;
  open: boolean; // true = working day / city open / embassies open
  reason: string | null;
  source: "AI" | "MANUAL" | "FALLBACK";
};

export type ResearchedDate = { date: Date; reason: string | null };

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const PAKISTAN_WEEKEND = new Set([0, 6]); // Sun, Sat
const SAUDI_WEEKEND = new Set([5, 6]); // Fri, Sat

// How many days each AI closure-scan covers (one AI call answers the whole
// window, so the engine does not pay one call per iterated day).
const SCAN_WINDOW_DAYS = 14;

// Reasoning models (e.g. deepseek-v4-pro) need far more than the bot's quick
// 8s budget to answer; verdict scans get 90s (results are cached, so this is a
// first-call cost only), batch research gets the full provider timeout by
// default (scripts may pass more).
export const AI_DATES_VERDICT_TIMEOUT_MS = 90_000;

function dayOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function parseIsoDate(input: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function questionScope(question: AiQuestion): string {
  switch (question.kind) {
    case "PAKISTAN":
      return "PAKISTAN";
    case "SAUDI":
      return "SAUDI";
    case "EMBASSY":
      return "EMBASSIES_ISB";
    case "CITY":
      return question.city;
  }
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
  "Labour Day (1 May), Eid ul Fitr (about 3 days, Islamic calendar), Independence Day (14 Aug),",
  "Ashura (9-10 Muharram), Eid Milad un Nabi (12 Rabi ul Awal), Eid ul Adha (about 3 days),",
  "Defence Day (6 Sep), Iqbal Day (9 Nov), Quaid-e-Azam Day (25 Dec), plus any federal",
  "government announced holiday of that year. Use the most accurate Islamic-calendar",
  "dates you know for the specific year.",
].join(" ");

const SAUDI_HOLIDAY_RULES = [
  "Saudi Arabia working days are Sunday to Thursday (Friday and Saturday are weekend).",
  "Saudi public holidays include: Founding Day (22 Feb), Eid ul Fitr holidays,",
  "Arafat Day + Eid ul Adha holidays, Saudi National Day (23 Sep), plus any officially",
  "announced holiday of that year. Use the most accurate Islamic-calendar dates you know.",
].join(" ");

function scanSystemPrompt(question: AiQuestion): string {
  switch (question.kind) {
    case "PAKISTAN":
      return [
        "You are an expert researcher on Pakistan's government working days and public",
        `holidays for any year 2019-2026. ${PAKISTAN_HOLIDAY_RULES}`,
        "Answer with JSON only.",
      ].join(" ");
    case "SAUDI":
      return [
        "You are an expert researcher on Saudi Arabia's government working days and",
        `public holidays for any year 2019-2026. ${SAUDI_HOLIDAY_RULES}`,
        "Answer with JSON only.",
      ].join(" ");
    case "CITY":
      return [
        "You are an expert researcher on city-level administrative closures in Pakistan",
        "(incidents, security preparations, strikes, protests, local holiday announcements)",
        "for any year 2019-2026. Answer with JSON only.",
      ].join(" ");
    case "EMBASSY":
      return [
        "You are an expert researcher on foreign embassies in Islamabad, Pakistan —",
        "their closures and work-suspension announcements (security alerts, incidents,",
        "preparations) for any year 2019-2026. Answer with JSON only.",
      ].join(" ");
  }
}

function scanUserPrompt(question: AiQuestion, from: string, to: string): string {
  const window = `the ${SCAN_WINDOW_DAYS} days from ${from} to ${to}`;
  switch (question.kind) {
    case "PAKISTAN":
      return [
        `Consider ${window}. Which of these dates were NOT working days in Pakistan`,
        "(national/public/federal holidays or announced closures)? Ignore Saturdays and",
        "Sundays (already weekend).",
        'Return exactly: {"closedDates":[{"date":"YYYY-MM-DD","reason":"short reason"}]}',
        "— an empty array if none.",
      ].join(" ");
    case "SAUDI":
      return [
        `Consider ${window}. Which of these dates were NOT working days in Saudi Arabia`,
        "(public holidays or announced closures)? Ignore Fridays and Saturdays (already",
        "weekend).",
        'Return exactly: {"closedDates":[{"date":"YYYY-MM-DD","reason":"short reason"}]}',
        "— an empty array if none.",
      ].join(" ");
    case "CITY":
      return [
        `Was the city of ${question.city} (Pakistan) closed for official/business work on`,
        `any of ${window} — due to any incident, security preparation, strike, protest,`,
        "or local holiday announcement? Ignore Saturdays/Sundays and nationwide holidays.",
        'Return exactly: {"closedDates":[{"date":"YYYY-MM-DD","reason":"short reason"}]}',
        "— an empty array if none.",
      ].join(" ");
    case "EMBASSY":
      return [
        `Were embassies in Islamabad closed, or was embassy work suspended/announced, on`,
        `any of ${window} (security alerts, incidents, preparations, announcements)?`,
        'Return exactly: {"closedDates":[{"date":"YYYY-MM-DD","reason":"short reason"}]}',
        "— an empty array if none.",
      ].join(" ");
  }
}

// --- AI closure scan (cached into HolidayClosure / WorkingDayCache) ---------

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
      out.push({ date, reason: String(item?.reason || "").slice(0, 200) || null });
    }
    return out;
  } catch (error) {
    console.warn("[ai-dates] AI scan fail", question.kind, fromText, error instanceof Error ? error.message : error);
    return null;
  }
}

// Upserts AI-found closures into HolidayClosure. Admin rows (reason without the
// AI prefix) are never touched — update is a no-op, create only when missing.
async function cacheClosures(db: Db, scope: string, closures: ScannedClosure[]): Promise<void> {
  for (const closure of closures) {
    const reason = closure.reason ? `${AI_REASON_PREFIX} ${closure.reason}` : AI_REASON_PREFIX;
    await db.holidayClosure.upsert({
      where: { date_scope: { date: closure.date, scope } },
      update: {},
      create: { date: closure.date, scope, reason },
    });
  }
}

// For Pakistan scans we also fill WorkingDayCache (source "AI") for every day
// of the window, so the printing-date helper and future checks reuse the
// verdict. MANUAL rows are never overwritten.
async function cachePakistanWindow(db: Db, from: Date, closures: ScannedClosure[]): Promise<void> {
  const closed = new Map<string, string | null>();
  for (const closure of closures) closed.set(formatDateOnly(closure.date), closure.reason);
  const openDates: Date[] = [];
  for (let i = 0; i < SCAN_WINDOW_DAYS; i += 1) {
    const date = addDays(from, i);
    if (!PAKISTAN_WEEKEND.has(date.getUTCDay()) && !closed.has(formatDateOnly(date))) openDates.push(date);
  }
  for (let i = 0; i < SCAN_WINDOW_DAYS; i += 1) {
    const candidate = addDays(from, i);
    const key = formatDateOnly(candidate);
    const existing = await db.workingDayCache.findUnique({ where: { candidateDate: candidate } });
    if (existing && existing.source === "MANUAL") continue; // admin override wins
    const closedReason = closed.get(key);
    const isWeekend = PAKISTAN_WEEKEND.has(candidate.getUTCDay());
    const isWorking = !isWeekend && closedReason === undefined;
    const workingDate = isWorking ? candidate : openDates.find((date) => date > candidate);
    if (!workingDate) continue; // window exhausted without a working day — do not cache
    await db.workingDayCache.upsert({
      where: { candidateDate: candidate },
      update: {},
      create: {
        candidateDate: candidate,
        workingDate,
        isCandidateWorking: isWorking,
        reason: isWorking ? null : closedReason ?? WEEKDAYS[candidate.getUTCDay()],
        source: "AI",
      },
    });
  }
}

// --- Core verdict helper -----------------------------------------------------

/**
 * aiVerdict(dateISO, question) — the AI-first single-date decision.
 * Order: deterministic weekend rule → HolidayClosure table (admin + previously
 * cached AI rows) → WorkingDayCache (Pakistan kind) → ONE AI scan call whose
 * result is cached → deterministic fallback (console.warn).
 */
export async function aiVerdict(
  dateISO: string,
  question: AiQuestion,
  db: Db = prisma,
  timeoutMs: number = AI_DATES_VERDICT_TIMEOUT_MS
): Promise<AiVerdict> {
  const date = parseIsoDate(dateISO) ?? dayOnly(new Date());
  const key = formatDateOnly(date);
  const city = question.kind === "CITY" ? question.city : null;
  const scope = questionScope(question);

  const base = { date: key, kind: question.kind, city };

  // Weekend rule stays deterministic (the AI prompts encode the same rule).
  if (question.kind === "PAKISTAN" && PAKISTAN_WEEKEND.has(date.getUTCDay())) {
    return { ...base, open: false, reason: WEEKDAYS[date.getUTCDay()], source: "FALLBACK" };
  }
  if (question.kind === "SAUDI" && SAUDI_WEEKEND.has(date.getUTCDay())) {
    return { ...base, open: false, reason: WEEKDAYS[date.getUTCDay()], source: "FALLBACK" };
  }

  // 1) HolidayClosure table — admin rows and previously cached AI rows.
  const closure = await db.holidayClosure.findFirst({ where: { date, scope } });
  if (closure) {
    const manual = !(closure.reason || "").startsWith(AI_REASON_PREFIX);
    return {
      ...base,
      open: false,
      reason: (closure.reason || "").replace(/^AI:\s*/, "") || null,
      source: manual ? "MANUAL" : "AI",
    };
  }

  // 2) WorkingDayCache (Pakistan working-day verdicts).
  if (question.kind === "PAKISTAN") {
    const cached = await db.workingDayCache.findUnique({ where: { candidateDate: date } });
    if (cached) {
      const open = cached.isCandidateWorking && dayOnly(cached.workingDate).getTime() === date.getTime();
      return {
        ...base,
        open,
        reason: open ? null : cached.reason,
        source: cached.source === "MANUAL" ? "MANUAL" : cached.source === "AI" ? "AI" : "FALLBACK",
      };
    }
  }

  // 3) AI research (one call covers a 14-day window, everything cached).
  const settings = await loadBotSettings(db);
  if (settings) {
    const closures = await scanClosuresWithAi(settings, question, date, timeoutMs);
    if (closures) {
      await cacheClosures(db, scope, closures);
      if (question.kind === "PAKISTAN") await cachePakistanWindow(db, date, closures);
      const hit = closures.find((item) => formatDateOnly(item.date) === key);
      return { ...base, open: !hit, reason: hit?.reason ?? null, source: "AI" };
    }
  }

  // 4) Fallback: no key / AI failed → deterministic (weekend already handled;
  //    no closure row found above → open).
  console.warn(`[ai-dates] fallback for ${question.kind}${city ? `/${city}` : ""} ${key} — AI unavailable`);
  return { ...base, open: true, reason: null, source: "FALLBACK" };
}

// Convenience wrappers used by the date engine.
export function pakistanWorkingVerdict(date: Date, db: Db = prisma, timeoutMs?: number) {
  return aiVerdict(formatDateOnly(dayOnly(date)), { kind: "PAKISTAN" }, db, timeoutMs);
}
export function saudiWorkingVerdict(date: Date, db: Db = prisma, timeoutMs?: number) {
  return aiVerdict(formatDateOnly(dayOnly(date)), { kind: "SAUDI" }, db, timeoutMs);
}
export function cityOpenVerdict(date: Date, city: CityName, db: Db = prisma, timeoutMs?: number) {
  return aiVerdict(formatDateOnly(dayOnly(date)), { kind: "CITY", city }, db, timeoutMs);
}
export function embassyOpenVerdict(date: Date, db: Db = prisma, timeoutMs?: number) {
  return aiVerdict(formatDateOnly(dayOnly(date)), { kind: "EMBASSY" }, db, timeoutMs);
}

// --- City choice (Special Moofa) --------------------------------------------

export const MOOFA_CITY_PRIORITY: CityName[] = ["ISLAMABAD", "GUJRAT", "LAHORE"];

/**
 * AI picks the first open city (priority Islamabad → Gujrat → Lahore) for the
 * given date. The AI answer is cross-checked against the HolidayClosure table
 * (admin rows always win); on AI failure the deterministic table rule picks
 * the first city without a closure row.
 */
export async function aiChooseMoofaCity(
  dateInput: Date,
  db: Db = prisma
): Promise<{ city: CityName; reason: string | null; source: "AI" | "MANUAL" | "FALLBACK" }> {
  const date = dayOnly(dateInput);
  const key = formatDateOnly(date);

  const rows = await db.holidayClosure.findMany({
    where: { date, scope: { in: [...MOOFA_CITY_PRIORITY] } },
  });
  const closedCities = new Set(rows.map((row) => row.scope));
  const firstTableOpen = MOOFA_CITY_PRIORITY.find((c) => !closedCities.has(c)) ?? MOOFA_CITY_PRIORITY[0];

  const settings = await loadBotSettings(db);
  if (!settings) {
    console.warn(`[ai-dates] city choice fallback for ${key} — AI unavailable`);
    return { city: firstTableOpen, reason: null, source: "FALLBACK" };
  }

  const system = "You answer questions about city closures in Pakistan with JSON only. Be brief.";
  const user = [
    `On ${key} (${WEEKDAYS[date.getUTCDay()]}), was there any known closure (incident,`,
    `security preparation, strike, protest, local holiday announcement) in`,
    `${MOOFA_CITY_PRIORITY.join(", ")}? If no known closure, the answer is ISLAMABAD`,
    "(the first city in priority order). Reply immediately with exactly:",
    '{"city":"ISLAMABAD|GUJRAT|LAHORE","reason":"short reason"}',
  ].join(" ");

  try {
    // Big token budget: reasoning models spend most tokens before the answer.
    const raw = await callBotJson(settings, system, user, '{"city"', 4000, AI_DATES_VERDICT_TIMEOUT_MS);
    const parsed = JSON.parse(raw) as { city?: string; reason?: string };
    const city = String(parsed.city || "").toUpperCase() as CityName;
    if (!MOOFA_CITY_PRIORITY.includes(city)) throw new Error(`AI city invalid: ${parsed.city}`);
    // Admin table always wins over the AI pick.
    if (closedCities.has(city)) {
      return { city: firstTableOpen, reason: "Admin table ne is city ko band mark kiya hai", source: "MANUAL" };
    }
    // Record the AI's finding: every city ranked before the chosen one was
    // closed that day — upsert it so the admin panel shows it (editable/
    // deletable); existing admin rows are never touched (update: {}).
    const chosenIdx = MOOFA_CITY_PRIORITY.indexOf(city);
    for (const skipped of MOOFA_CITY_PRIORITY.slice(0, chosenIdx)) {
      await db.holidayClosure.upsert({
        where: { date_scope: { date, scope: skipped } },
        update: {},
        create: { date, scope: skipped, reason: `${AI_REASON_PREFIX} City band thi — AI ne ${city} choose ki` },
      });
    }
    return { city, reason: String(parsed.reason || "").slice(0, 200) || null, source: "AI" };
  } catch (error) {
    console.warn("[ai-dates] city choice AI fail", key, error instanceof Error ? error.message : error);
    // Middle layer: derive the choice from per-city AI closure scans (still
    // AI-researched, and cached) before giving up to the plain table rule.
    for (const city of MOOFA_CITY_PRIORITY) {
      if (closedCities.has(city)) continue;
      const verdict = await cityOpenVerdict(date, city, db);
      if (verdict.open) return { city, reason: verdict.reason, source: verdict.source };
    }
    return { city: firstTableOpen, reason: null, source: "FALLBACK" };
  }
}

// --- Batch research: working dates of a year (2019 pool) ---------------------

/**
 * Asks the AI for a list of Pakistan working dates of `year` (any 2019-2026).
 * Validates: right year, Monday-Friday, not in excludeDates, not a known
 * PAKISTAN-scope closure, deduped. Returns at most `count` valid entries;
 * an empty array when the AI is unavailable or everything failed validation
 * (callers must NOT fabricate dates in that case).
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
  const yearStart = new Date(Date.UTC(year, 0, 1));
  const yearEnd = new Date(Date.UTC(year, 11, 31));
  const closureRows = await db.holidayClosure.findMany({
    where: { date: { gte: yearStart, lte: yearEnd }, scope: "PAKISTAN" },
    select: { date: true },
  });
  for (const row of closureRows) exclude.add(formatDateOnly(row.date));

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
