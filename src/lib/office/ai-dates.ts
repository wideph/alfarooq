import type { Prisma, SiteSettings } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { PROVIDER_TIMEOUT_MS, callBotJson } from "@/lib/bot-ai";
import { SITE_SETTINGS_ID } from "@/lib/site-settings";
import { formatDateOnly } from "@/lib/office/serializers";
import { DayResolver, type DayRule } from "@/lib/office/day-rules";

// docs/office-module/06 §N5/N6 — AI date research.
// §W60 — AI kabhi kisi din ko "khula" nahi bana sakta (built-in calendar /
// admin table hamesha jeet te hain), fail ho to kuch cache nahi hota.
// §W61 — har din ka ONLINE check (date-verify.ts): system Tavily (owner ka
// chuna hua; warna GDELT) se taaza khabrein lata hai, attached AI (DeepSeek
// — khud internet nahi dekh sakta) un khabron ko parh kar har din ka faisla
// deta hai (saboot ke saath). Band mila → HolidayClosure "AI:" row (admin
// panel mein, edit / delete) + planner date aage karta hai.

type Db = Prisma.TransactionClient | typeof prisma;

export const AI_REASON_PREFIX = "AI:";

export type CityName = "ISLAMABAD" | "QUETTA" | "GUJRAT" | "LAHORE";

export type ResearchedDate = { date: Date; reason: string | null };

const PAKISTAN_WEEKEND = new Set([0, 6]); // Sun, Sat

// Reasoning models (e.g. deepseek-v4-pro) ko jawab mein waqt lagta hai.
export const AI_DATES_VERDICT_TIMEOUT_MS = 90_000;

function parseIsoDate(input: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(input.trim());
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
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

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const SCOPE_TEXT: Record<string, string> = {
  PAKISTAN: "Pakistan — federal / provincial government offices nationwide (public holidays, announced closures)",
  ISLAMABAD: "Islamabad (federal capital) — government offices incl. IBCC, MOFA, HEC (local holidays, security closures, section 144, protests)",
  QUETTA: "Quetta (Balochistan) — government offices incl. the education board (local holidays, strikes, security closures)",
  GUJRAT: "Gujrat (Punjab) — MOFA camp office / government offices (local holidays, closures)",
  LAHORE: "Lahore (Punjab) — MOFA camp office / government offices (local holidays, closures)",
  EMBASSIES_ISB: "Embassies in Islamabad, especially the Saudi Embassy (closures, Saudi holidays, security alerts)",
  SAUDI: "Saudi Arabia — government offices incl. the Ministry of Foreign Affairs (public holidays, Eid government holidays)",
};

/** Attached AI chalu hai (key + model + enabled)? */
export async function dateAiAvailable(db: Db = prisma): Promise<boolean> {
  return Boolean(await loadBotSettings(db));
}

export type DayAiVerdict = { closed: boolean; reason: string | null; evidence: string[] };

type Evidence = { title: string; url: string; domain: string; seen: string; excerpt?: string };

/**
 * Attached AI se in dates ka faisla (is scope ke liye), online khabron ki
 * roshni mein. Har date ka jawab lazmi; koi date reh jaye ya AI fail ho →
 * null (kuch likha nahi jata, baad mein dobara).
 */
export async function aiCheckDays(
  input: { scope: string; dates: Date[]; today: Date; news: Evidence[] | null; source: string | null },
  db: Db = prisma
): Promise<{ verdicts: Map<string, DayAiVerdict>; model: string } | null> {
  const settings = await loadBotSettings(db);
  if (!settings || input.dates.length === 0) return null;
  const keys = [...new Set(input.dates.map((date) => formatDateOnly(date)))].sort();
  const rules = input.scope === "SAUDI" || input.scope === "EMBASSIES_ISB" ? `${SAUDI_HOLIDAY_RULES} ${PAKISTAN_HOLIDAY_RULES}` : PAKISTAN_HOLIDAY_RULES;
  const system = [
    "You verify whether specific dates are WORKING days for offices that attest documents.",
    "You are given online news search results collected today. Read them carefully: a holiday or",
    "closure is often announced only a few days before (e.g. sudden local holidays in Islamabad,",
    "security closures, government notifications, Eid dates fixed by moon sighting).",
    rules,
    "Mark a date CLOSED if any news, official notification or certain knowledge shows the offices of",
    "this scope are/were closed that day (or very likely closed). If a news item says a holiday is",
    "cancelled or that a day is NOT a holiday, treat it as open. Weekends are already handled.",
    "Answer with JSON only.",
  ].join(" ");
  const news = (input.news ?? [])
    .slice(0, 30)
    .map((item, index) =>
      [
        `[${index + 1}] ${item.title} — ${item.domain}${item.seen ? `, ${item.seen}` : ""}`,
        `    ${item.url}`,
        item.excerpt ? `    ${item.excerpt.replace(/\s+/g, " ").slice(0, 900)}` : "",
      ]
        .filter(Boolean)
        .join("\n")
    )
    .join("\n");
  const user = [
    `Today is ${formatDateOnly(input.today)}.`,
    `Scope: ${SCOPE_TEXT[input.scope] ?? input.scope}.`,
    `Dates to decide: ${keys.map((key) => `${key} (${WEEKDAY_NAMES[new Date(`${key}T00:00:00Z`).getUTCDay()]})`).join(", ")}.`,
    input.news === null
      ? "Online news could NOT be fetched right now — decide from your own knowledge only."
      : `Online news results (${input.source}):\n${news || "(no matching news found)"}`,
    'Return exactly: {"days":[{"date":"YYYY-MM-DD","closed":true|false,"reason":"short reason (holiday name / closure) or empty","evidence":[news numbers like 1, 3]}]}',
    "— one entry for EVERY date listed above.",
  ].join("\n");

  try {
    const raw = await callBotJson(settings, system, user, '{"days"', 8000, AI_DATES_VERDICT_TIMEOUT_MS);
    const parsed = JSON.parse(raw) as {
      days?: Array<{ date?: string; closed?: unknown; reason?: string; evidence?: unknown }>;
    };
    if (!Array.isArray(parsed.days)) return null;
    const verdicts = new Map<string, DayAiVerdict>();
    for (const day of parsed.days) {
      const date = parseIsoDate(String(day?.date || ""));
      if (!date) continue;
      const key = formatDateOnly(date);
      if (!keys.includes(key) || typeof day.closed !== "boolean") continue;
      const evidence = (Array.isArray(day.evidence) ? day.evidence : [])
        .map((value) => Number(value))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= (input.news?.length ?? 0))
        .map((value) => input.news![value - 1].url);
      verdicts.set(key, { closed: day.closed, reason: String(day.reason || "").slice(0, 180) || null, evidence });
    }
    // Har date ka jawab na ho to poora natija na-qabil (aadha faisla nahi).
    if (keys.some((key) => !verdicts.has(key))) return null;
    return { verdicts, model: `${settings.botProvider}/${settings.botModel}` };
  } catch (error) {
    console.warn("[ai-dates] day check fail", input.scope, error instanceof Error ? error.message : error);
    return null;
  }
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
