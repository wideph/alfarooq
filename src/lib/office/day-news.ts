import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, formatDateOnly } from "@/lib/office/serializers";

// §W61 — ONLINE saboot: chhutti / band hone ki khabrein GDELT se (duniya bhar
// ki news ka khula, muft database — har istemal ki ijazat; Google News feed
// sirf "personal, non-commercial" hai is liye nahi). Attached AI (DeepSeek)
// khud internet nahi dekh sakta, is liye system khabrein la kar AI ko deta
// hai; AI unhi ko parh kar faisla karta hai.
// GDELT ki shart: har 5 second mein ek request — yahan sab requests ek
// qatar mein 5.5 second ke faasle se jaati hain; "limit" jawab aaye to ruk kar
// dobara koshish.

export type NewsItem = {
  title: string;
  url: string;
  domain: string;
  seen: string; // YYYY-MM-DD
  excerpt?: string;
};

const GDELT_URL = "https://api.gdeltproject.org/api/v2/doc/doc";
const GAP_MS = 5_500;
const RELEVANT = /holiday|closed|closure|close|shut|off\b|announce|notification|suspend|section 144|lockdown|curfew|eid|ashura|muharram|milad|strike|protest|chhutti|چھٹی|تعطیل/i;

let queue: Promise<unknown> = Promise.resolve();
let lastCall = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Ek waqt mein ek GDELT request, 5.5s faasla (is function instance ke andar).
function throttled<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const wait = lastCall + GAP_MS - Date.now();
    if (wait > 0) await sleep(wait);
    try {
      return await task();
    } finally {
      lastCall = Date.now();
    }
  });
  queue = run.catch(() => undefined);
  return run;
}

function gdeltStamp(date: Date) {
  return `${formatDateOnly(date).replace(/-/g, "")}000000`;
}

/** GDELT article search. null = online data nahi mila (fail / limit). */
export async function gdeltSearch(query: string, from: Date, to: Date, max = 40): Promise<NewsItem[] | null> {
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    maxrecords: String(max),
    sort: "datedesc",
    startdatetime: gdeltStamp(from),
    enddatetime: gdeltStamp(to),
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await throttled(async () => {
      try {
        const response = await fetch(`${GDELT_URL}?${params}`, { signal: AbortSignal.timeout(30_000) });
        const text = await response.text();
        if (!response.ok || /limit requests/i.test(text)) return "retry" as const;
        if (!text.trim().startsWith("{")) return [] as NewsItem[]; // khali natija
        const data = JSON.parse(text) as { articles?: Array<{ url?: string; title?: string; domain?: string; seendate?: string }> };
        return (data.articles ?? [])
          .filter((item) => item.url && item.title)
          .map((item) => ({
            title: String(item.title).trim().slice(0, 240),
            url: String(item.url),
            domain: String(item.domain || ""),
            seen: /^(\d{4})(\d{2})(\d{2})/.exec(String(item.seendate || ""))?.slice(1).join("-") || "",
          }));
      } catch (error) {
        console.warn("[day-news] gdelt fail", error instanceof Error ? error.message : error);
        return "retry" as const;
      }
    });
    if (result !== "retry") return result;
    await sleep(GAP_MS * (attempt + 1));
  }
  return null;
}

/** Khabar ke page ka saada text (pehle ~2500 huroof). Fail par null. */
export async function articleText(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(12_000),
      headers: { "User-Agent": "Mozilla/5.0 (compatible; AlfarooqOffice/1.0; holiday-check)" },
      redirect: "follow",
    });
    if (!response.ok) return null;
    const html = (await response.text()).slice(0, 400_000);
    const body = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<(nav|header|footer|aside)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#039;|&rsquo;|&lsquo;/g, "'")
      .replace(/&quot;|&ldquo;|&rdquo;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    // Chhutti / band wali baat ke aas paas ka hissa pehle.
    const hit = body.search(RELEVANT);
    const start = hit > 600 ? hit - 600 : 0;
    return body.slice(start, start + 2500) || null;
  } catch {
    return null;
  }
}

const CITY_NAMES: Record<string, string> = {
  ISLAMABAD: "Islamabad",
  QUETTA: "Quetta",
  GUJRAT: "Gujrat",
  LAHORE: "Lahore",
};

function queriesFor(scope: string): string[] {
  if (scope === "PAKISTAN") {
    return [
      '("public holiday" OR "gazetted holiday" OR "holiday announced" OR "cabinet division") sourcecountry:pakistan',
      '("offices will remain closed" OR "offices to remain closed" OR "government offices closed") sourcecountry:pakistan',
    ];
  }
  if (scope === "SAUDI") {
    return [
      '("public holiday" OR "Eid holiday" OR "national day holiday" OR "founding day") (Saudi OR Kingdom) sourcecountry:saudiarabia',
      '("government employees" OR "public sector") holiday Saudi',
    ];
  }
  if (scope === "EMBASSIES_ISB") {
    return [
      '(embassy OR embassies) Islamabad (closed OR holiday OR suspended OR "security alert")',
      '"Saudi embassy" (Islamabad OR Pakistan) (closed OR holiday OR suspended)',
    ];
  }
  const city = CITY_NAMES[scope];
  if (!city) return [];
  return [
    `${city} (holiday OR "local holiday" OR "remain closed" OR closed OR "section 144" OR lockdown OR shutdown) sourcecountry:pakistan`,
  ];
}

/**
 * Is scope + dates ke liye online khabrein (saath mein relevant khabron ka
 * text). Aane wali dates: pichle 45 din ki announcements; guzri dates: us
 * waqt ki khabrein. null = online data bilkul nahi mila.
 */
async function gdeltForScope(scope: string, dates: Date[], today: Date): Promise<NewsItem[] | null> {
  const queries = queriesFor(scope);
  if (queries.length === 0 || dates.length === 0) return [];
  const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
  const ranges: Array<[Date, Date]> = [];
  const future = sorted.filter((date) => date >= addDays(today, -3));
  const past = sorted.filter((date) => date < addDays(today, -3));
  if (future.length) ranges.push([addDays(today, -45), addDays(today, 1)]);
  if (past.length) ranges.push([addDays(past[0], -30), addDays(past[past.length - 1], 3)]);

  const seen = new Set<string>();
  const items: NewsItem[] = [];
  let anyOk = false;
  for (const [from, to] of ranges) {
    for (const query of queries) {
      const found = await gdeltSearch(query, from, to);
      if (!found) continue;
      anyOk = true;
      for (const item of found) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        items.push(item);
      }
    }
  }
  if (!anyOk) return null;
  // Sab se relevant 30 khabrein; un mein se 5 ka text bhi.
  const ranked = items
    .map((item) => ({ item, score: RELEVANT.test(item.title) ? 1 : 0 }))
    .sort((a, b) => b.score - a.score || b.item.seen.localeCompare(a.item.seen))
    .slice(0, 30)
    .map((entry) => entry.item);
  const toRead = ranked.filter((item) => RELEVANT.test(item.title)).slice(0, 5);
  await Promise.all(
    toRead.map(async (item) => {
      const text = await articleText(item.url);
      if (text) item.excerpt = text;
    })
  );
  return ranked;
}

// --- Tavily (owner ka chuna hua online zariya) ---------------------------------

type Db = Prisma.TransactionClient | typeof prisma;

// Test mein local nakli server (TAVILY_API_URL); production mein asal Tavily.
const TAVILY_URL = process.env.TAVILY_API_URL || "https://api.tavily.com/search";
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Tavily key: Setup panel (DB) ya env TAVILY_API_KEY. */
export async function tavilyKey(db: Db = prisma): Promise<string> {
  try {
    const row = await db.officeDateConfig.findUnique({ where: { id: "global" } });
    if (row?.tavilyApiKey) return row.tavilyApiKey;
  } catch {
    // table na ho (migration baqi) → env
  }
  return process.env.TAVILY_API_KEY || "";
}

function domainOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

type TavilyResult = { title?: string; url?: string; content?: string; published_date?: string };

/** Ek Tavily search. Error par message ke saath throw (test button dikhata hai). */
export async function tavilySearch(
  key: string,
  query: string,
  range: { from: Date; to: Date } | null
): Promise<NewsItem[]> {
  const base: Record<string, unknown> = {
    query,
    topic: "news",
    search_depth: "advanced",
    max_results: 10,
    include_answer: false,
  };
  const attempts: Array<Record<string, unknown>> = range
    ? [
        { ...base, start_date: formatDateOnly(range.from), end_date: formatDateOnly(range.to) },
        // start_date / end_date na chalein to: aane wali dates ke liye "pichle N din".
        { ...base, days: Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000)) },
        { ...base, topic: "general" },
      ]
    : [base];
  let lastError = "";
  for (const body of attempts) {
    const response = await fetch(TAVILY_URL, {
      method: "POST",
      signal: AbortSignal.timeout(45_000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (response.status === 401 || response.status === 403) throw new Error(`Tavily key ghalat / band (${response.status})`);
    if (response.status === 429 || response.status === 432 || response.status === 433) {
      throw new Error(`Tavily limit / credits khatam (${response.status})`);
    }
    if (!response.ok) {
      lastError = `Tavily ${response.status}: ${text.slice(0, 200)}`;
      continue; // agla tareeqa (parameter shayad support nahi)
    }
    const data = JSON.parse(text) as { results?: TavilyResult[] };
    return (data.results ?? [])
      .filter((item) => item.url && item.title)
      .map((item) => ({
        title: String(item.title).trim().slice(0, 240),
        url: String(item.url),
        domain: domainOf(String(item.url)),
        seen: String(item.published_date || "").slice(0, 10),
        excerpt: String(item.content || "").slice(0, 1500) || undefined,
      }));
  }
  throw new Error(lastError || "Tavily jawab nahi");
}

function monthsOf(dates: Date[]) {
  return [...new Set(dates.map((date) => `${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`))].join(" ");
}

function tavilyQueries(scope: string, months: string): string[] {
  switch (scope) {
    case "PAKISTAN":
      return [
        `Pakistan public holiday announced ${months}`,
        `federal government offices closed holiday notification Pakistan ${months}`,
        `پاکستان عام تعطیل چھٹی کا اعلان ${months}`,
      ];
    case "ISLAMABAD":
      return [
        `Islamabad holiday announced ${months}`,
        `Islamabad offices closed local holiday section 144 ${months}`,
        `اسلام آباد چھٹی کا اعلان ${months}`,
      ];
    case "QUETTA":
    case "GUJRAT":
    case "LAHORE": {
      const city = scope.charAt(0) + scope.slice(1).toLowerCase();
      return [`${city} local holiday announced ${months}`, `${city} offices closed ${months}`];
    }
    case "EMBASSIES_ISB":
      return [`Saudi embassy Islamabad closed ${months}`, `embassies in Islamabad closed security alert ${months}`];
    case "SAUDI":
      return [
        `Saudi Arabia public holiday government employees ${months}`,
        `Saudi Ministry of Foreign Affairs holiday closed ${months}`,
      ];
    default:
      return [];
  }
}

export type OnlineEvidence = { items: NewsItem[]; source: "tavily" | "gdelt" };

/**
 * Is scope + dates ke liye ONLINE khabrein. Tavily key ho to Tavily (warna /
 * fail par GDELT). null = online kuch nahi mila — AI phir sirf apne ilm se
 * (check "bina online" likha jata hai aur jald dobara hota hai).
 */
export async function onlineEvidence(
  scope: string,
  dates: Date[],
  today: Date,
  db: Db = prisma
): Promise<OnlineEvidence | null> {
  if (dates.length === 0) return { items: [], source: "tavily" };
  const key = await tavilyKey(db);
  if (key) {
    const sorted = [...dates].sort((a, b) => a.getTime() - b.getTime());
    const future = sorted.filter((date) => date >= addDays(today, -3));
    const past = sorted.filter((date) => date < addDays(today, -3));
    const jobs: Array<Promise<NewsItem[] | null>> = [];
    if (future.length) {
      for (const query of tavilyQueries(scope, monthsOf(future))) {
        jobs.push(tavilySearch(key, query, { from: addDays(today, -45), to: today }).catch((error) => {
          console.warn("[day-news] tavily fail", scope, error instanceof Error ? error.message : error);
          return null;
        }));
      }
    }
    if (past.length) {
      const to = addDays(past[past.length - 1], 3);
      for (const query of tavilyQueries(scope, monthsOf(past))) {
        jobs.push(
          tavilySearch(key, query, { from: addDays(past[0], -30), to: to > today ? today : to }).catch((error) => {
            console.warn("[day-news] tavily fail", scope, error instanceof Error ? error.message : error);
            return null;
          })
        );
      }
    }
    const results = await Promise.all(jobs);
    if (results.some((result) => result !== null)) {
      const seen = new Set<string>();
      const items: NewsItem[] = [];
      for (const list of results) {
        for (const item of list ?? []) {
          if (seen.has(item.url)) continue;
          seen.add(item.url);
          items.push(item);
        }
      }
      return { items: items.slice(0, 30), source: "tavily" };
    }
  }
  const gdelt = await gdeltForScope(scope, dates, today);
  return gdelt ? { items: gdelt, source: "gdelt" } : null;
}
