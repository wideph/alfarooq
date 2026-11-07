import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, formatDateOnly, todayPakistan } from "@/lib/office/serializers";
import { DayResolver, type DayRule } from "@/lib/office/day-rules";
import { attestationKind, ruleForKind } from "@/lib/office/attestation-dates";
import { AI_REASON_PREFIX, aiCheckDays, dateAiAvailable, scopesOfRule } from "@/lib/office/ai-dates";
import { onlineEvidence } from "@/lib/office/day-news";
import { planCaseDates, recheckOpenCaseDates, SYSTEM_ACTOR, type DateActor } from "@/lib/office/date-recheck";

// §W61 — har date ka ONLINE check (owner):
//   • Jo din pehle se tay hai (weekend, built-in chhutti, admin table, admin ka
//     "khula" override) us par AI nahi. Baqi har din, har zaroori scope
//     (Pakistan + sheher / embassies / Saudi) ke liye: Tavily se taaza khabrein
//     → attached AI (DeepSeek) faisla + saboot → OfficeDayCheck.
//   • 20 din se aage ki date par faisla NAHI (TENTATIVE) — achanak chhutti ka
//     elaan ho sakta hai. 20 din ke andar aate hi check, phir ROZ dobara jab
//     tak din guzar na jaye (roz ka cron + case kholne par).
//   • Band mila → HolidayClosure "AI:" row + planner date aage + remark, phir
//     nayi date ka bhi check (jab tak sab confirm na ho).
//   • AI / internet fail → kuch nahi likha jata; date "check baqi" dikhti hai
//     aur dobara koshish hoti hai. Bina online khabron ke AI ka faisla
//     "OFFLINE" — 3 ghante baad dobara.

type Db = Prisma.TransactionClient | typeof prisma;

export const VERIFY_HORIZON_DAYS = 20;
const FRESH_ONLINE_MS = 20 * 3_600_000;
const FRESH_OFFLINE_MS = 3 * 3_600_000;
const LEASE_MS = 290_000;

export type DateCheckStatus = "VERIFIED" | "OFFLINE" | "PENDING" | "TENTATIVE" | "CLOSED";
export type DateCheck = {
  status: DateCheckStatus;
  checkedAt: string | null;
  note: string | null;
  sources: Array<{ title: string; url: string }>;
};

type Item = { key: string; date: Date; rule: DayRule };
type CheckRow = { date: Date; scope: string; open: boolean; reason: string | null; sources: Prisma.JsonValue; online: boolean; checkedAt: Date };

function isFresh(row: CheckRow, date: Date, today: Date, now: number) {
  // Guzra hua din: us din (ya baad) ka ek check kaafi — tareekh ab nahi badalti.
  if (date < today) return row.checkedAt >= date;
  return now - row.checkedAt.getTime() < (row.online ? FRESH_ONLINE_MS : FRESH_OFFLINE_MS);
}

function sourcesOf(value: Prisma.JsonValue): Array<{ title: string; url: string }> {
  return Array.isArray(value)
    ? value
        .filter((item): item is { title: string; url: string } => Boolean(item && typeof item === "object" && "url" in item))
        .map((item) => ({ title: String(item.title || item.url), url: String(item.url) }))
    : [];
}

/**
 * Har item (date + qaida) ki halat, aur kin (scope, din) ka AI check chahiye.
 * Koi AI call nahi.
 */
async function analyze(items: Item[], db: Db, resolver: DayResolver) {
  const today = todayPakistan();
  const now = Date.now();
  const horizon = addDays(today, VERIFY_HORIZON_DAYS);
  const dates = [...new Set(items.map((item) => item.date.getTime()))].map((time) => new Date(time));
  const rows: CheckRow[] = dates.length
    ? await db.officeDayCheck.findMany({ where: { date: { in: dates } } })
    : [];
  const byKey = new Map(rows.map((row) => [`${formatDateOnly(row.date)}|${row.scope}`, row]));
  const statuses = new Map<string, DateCheck>();
  const needs = new Map<string, Set<string>>(); // scope → date keys

  for (const item of items) {
    const dateKey = formatDateOnly(item.date);
    if (item.date > horizon) {
      statuses.set(item.key, {
        status: "TENTATIVE",
        checkedAt: null,
        note: `${VERIFY_HORIZON_DAYS} din se zyada aage — qareeb aane par AI online check karega`,
        sources: [],
      });
      continue;
    }
    const verdict = await resolver.verdict(item.date, item.rule);
    if (!verdict.open) {
      statuses.set(item.key, { status: "CLOSED", checkedAt: null, note: verdict.reason, sources: [] });
      continue;
    }
    // Special Mofa: Pakistan + jo city chuni (pehli khuli); baqi: qaide ke scopes.
    let scopes = item.rule.anyCity?.length
      ? [item.rule.country === "PK" ? "PAKISTAN" : "SAUDI", ...(verdict.city ? [verdict.city] : [])]
      : scopesOfRule(item.rule);
    if (item.rule.country === "PK" && (await resolver.isManualOpen(item.date))) {
      scopes = scopes.filter((scope) => scope !== "PAKISTAN"); // admin ne khud khula kaha
    }
    let pending = false;
    let offline = false;
    let closedNote: string | null = null;
    let oldest: Date | null = null;
    const sources: Array<{ title: string; url: string }> = [];
    for (const scope of scopes) {
      const row = byKey.get(`${dateKey}|${scope}`);
      if (!row || !isFresh(row, item.date, today, now)) {
        pending = true;
        const set = needs.get(scope) ?? new Set<string>();
        set.add(dateKey);
        needs.set(scope, set);
        continue;
      }
      if (!row.open) closedNote = `${scope}: ${row.reason || "band"}`;
      if (!row.online) offline = true;
      if (!oldest || row.checkedAt < oldest) oldest = row.checkedAt;
      sources.push(...sourcesOf(row.sources).slice(0, 2));
    }
    statuses.set(item.key, {
      status: closedNote ? "CLOSED" : pending ? "PENDING" : offline ? "OFFLINE" : "VERIFIED",
      checkedAt: oldest ? oldest.toISOString() : null,
      note: closedNote ?? (pending ? "AI online check baqi" : offline ? "AI ne check kiya (online khabrein nahi mili) — jald dobara" : "AI + online khabrein: khula din"),
      sources: sources.slice(0, 4),
    });
  }
  return { statuses, needs };
}

// Ek scope ke dino ka faisla (online khabrein + AI). null = abhi nahi ho saka.
export type DayChecker = (
  scope: string,
  dates: Date[],
  today: Date
) => Promise<{
  verdicts: Map<string, { closed: boolean; reason: string | null; sources: Array<{ title: string; url: string }> }>;
  online: boolean;
  model: string;
} | null>;

export const onlineAiChecker: DayChecker = async (scope, dates, today) => {
  // AI band ho to khabrein lane ka faida nahi (faisla AI karta hai).
  if (!(await dateAiAvailable())) return null;
  const evidence = await onlineEvidence(scope, dates, today);
  const result = await aiCheckDays({ scope, dates, today, news: evidence?.items ?? null, source: evidence?.source ?? null });
  if (!result) return null;
  const titles = new Map((evidence?.items ?? []).map((item) => [item.url, item.title]));
  const verdicts = new Map(
    [...result.verdicts].map(([key, verdict]) => [
      key,
      {
        closed: verdict.closed,
        reason: verdict.reason,
        sources: verdict.evidence.slice(0, 5).map((url) => ({ title: titles.get(url) ?? url, url })),
      },
    ])
  );
  return { verdicts, online: evidence !== null, model: result.model };
};

/**
 * (scope → din) ke checks chalao. Har scope: online khabrein → AI faisla →
 * OfficeDayCheck; band → HolidayClosure "AI:" row. Band mile (date, scope).
 */
async function runChecks(needs: Map<string, Set<string>>, checker: DayChecker, db: Db = prisma) {
  const today = todayPakistan();
  const closed: Array<{ date: Date; scope: string }> = [];
  let ok = 0;
  let failed = 0;
  await Promise.all(
    [...needs.entries()].map(async ([scope, keys]) => {
      const dates = [...keys].sort().map((key) => new Date(`${key}T00:00:00Z`));
      const result = await checker(scope, dates, today).catch((error) => {
        console.warn("[office] day check fail", scope, error instanceof Error ? error.message : error);
        return null;
      });
      if (!result || dates.some((date) => !result.verdicts.has(formatDateOnly(date)))) {
        failed += 1;
        return;
      }
      ok += 1;
      for (const date of dates) {
        const verdict = result.verdicts.get(formatDateOnly(date))!;
        const data = {
          open: !verdict.closed,
          reason: verdict.reason,
          sources: verdict.sources,
          online: result.online,
          model: result.model,
          checkedAt: new Date(),
        };
        await db.officeDayCheck.upsert({
          where: { date_scope: { date, scope } },
          update: data,
          create: { date, scope, ...data },
        });
        if (verdict.closed) {
          closed.push({ date, scope });
          const existing = await db.holidayClosure.findUnique({ where: { date_scope: { date, scope } } });
          if (!existing) {
            await db.holidayClosure.create({
              data: {
                date,
                scope,
                reason: `${AI_REASON_PREFIX} ${verdict.reason || "chhutti / band"}${result.online ? " (online)" : ""}`.slice(0, 200),
              },
            });
          }
        }
      }
    })
  );
  return { closed, ok, failed };
}

async function caseItems(caseId: string, db: Db = prisma): Promise<Item[]> {
  const rows = await db.caseAttestation.findMany({
    where: { caseId, status: { not: "DONE" }, scheduledDate: { not: null } },
    select: { id: true, scheduledDate: true, attestationType: { select: { name: true } } },
  });
  return rows.map((row) => ({
    key: row.id,
    date: row.scheduledDate!,
    rule: ruleForKind(attestationKind(row.attestationType.name)),
  }));
}

/** UI ke liye: har attestation ki date ki halat (koi AI call nahi). */
export async function attestationDateChecks(
  rows: Array<{ id: string; status: string; scheduledDate: Date | null; attestationType: { name: string } }>,
  db: Db = prisma
): Promise<Record<string, DateCheck>> {
  const items: Item[] = rows
    .filter((row) => row.status !== "DONE" && row.scheduledDate)
    .map((row) => ({ key: row.id, date: row.scheduledDate!, rule: ruleForKind(attestationKind(row.attestationType.name)) }));
  if (items.length === 0) return {};
  try {
    const { statuses } = await analyze(items, db, new DayResolver(db));
    return Object.fromEntries(statuses);
  } catch (error) {
    console.error("[office] date check status fail", error);
    return {};
  }
}

/**
 * Ek case ki pending dates ka online check — jab tak sab confirm na hon (ya
 * waqt khatam). Lease: ek case par ek waqt mein ek check.
 */
export async function verifyCaseDates(
  caseId: string,
  opts: { budgetMs?: number; actor?: DateActor; checker?: DayChecker } = {}
): Promise<{ busy: boolean; rounds: number; moved: boolean; failed: boolean }> {
  const deadline = Date.now() + (opts.budgetMs ?? 230_000);
  const now = new Date();
  const lease = await prisma.case.updateMany({
    where: { id: caseId, OR: [{ datesCheckingUntil: null }, { datesCheckingUntil: { lt: now } }] },
    data: { datesCheckingUntil: new Date(now.getTime() + LEASE_MS) },
  });
  if (lease.count === 0) return { busy: true, rounds: 0, moved: false, failed: false };
  let rounds = 0;
  let moved = false;
  let failed = false;
  try {
    while (rounds < 6 && Date.now() < deadline) {
      const items = await caseItems(caseId);
      const { needs } = await analyze(items, prisma, new DayResolver());
      if (needs.size === 0) break;
      rounds += 1;
      const result = await runChecks(needs, opts.checker ?? onlineAiChecker);
      if (result.closed.length > 0) {
        const changes = await planCaseDates(caseId, {}, opts.actor ?? SYSTEM_ACTOR);
        moved = moved || changes.length > 0;
        continue; // nayi dates ka bhi check
      }
      if (result.failed > 0) {
        failed = true;
        break; // AI / internet abhi nahi — baad mein dobara
      }
    }
  } catch (error) {
    failed = true;
    console.error("[office] verify case dates fail", caseId, error);
  } finally {
    await prisma.case.update({ where: { id: caseId }, data: { datesCheckingUntil: null } }).catch(() => undefined);
  }
  return { busy: false, rounds, moved, failed };
}

/** Kabhi throw nahi karta (after() ke liye). */
export async function safeVerifyCaseDates(caseId: string, actor?: DateActor) {
  try {
    return await verifyCaseDates(caseId, { actor });
  } catch (error) {
    console.error("[office] verify case dates fail", caseId, error);
    return null;
  }
}

/**
 * Roz ka cron / admin button: tamam khule cases ki pending dates (20 din ke
 * andar + guzri hui) aur expected printing dates ka online check; band mile to
 * dates aage + remark. Phir planner ki aam jaanch.
 */
export async function verifyAllOpenDates(opts: { budgetMs?: number; actor?: DateActor; checker?: DayChecker } = {}) {
  const deadline = Date.now() + (opts.budgetMs ?? 240_000);
  const actor = opts.actor ?? SYSTEM_ACTOR;
  const horizon = addDays(todayPakistan(), VERIFY_HORIZON_DAYS);
  let rounds = 0;
  let scopesChecked = 0;
  let scopesFailed = 0;
  const closedFound: string[] = [];
  const touched = new Set<string>();
  while (rounds < 4 && Date.now() < deadline) {
    const attestations = await prisma.caseAttestation.findMany({
      where: {
        status: { not: "DONE" },
        scheduledDate: { not: null, lte: horizon },
        case: { status: { not: "CANCELLED" } },
      },
      select: { id: true, caseId: true, scheduledDate: true, attestationType: { select: { name: true } } },
    });
    const printing = await prisma.case.findMany({
      where: { status: { notIn: ["COMPLETED", "DELIVERED", "CANCELLED"] }, expectedPrintingDate: { not: null, lte: horizon, gte: todayPakistan() } },
      select: { id: true, expectedPrintingDate: true },
    });
    const items: Item[] = [
      ...attestations.map((row) => ({
        key: `a:${row.caseId}:${row.id}`,
        date: row.scheduledDate!,
        rule: ruleForKind(attestationKind(row.attestationType.name)),
      })),
      ...printing.map((row) => ({ key: `p:${row.id}`, date: row.expectedPrintingDate!, rule: { country: "PK" } as DayRule })),
    ];
    const { needs } = await analyze(items, prisma, new DayResolver());
    if (needs.size === 0) break;
    rounds += 1;
    const result = await runChecks(needs, opts.checker ?? onlineAiChecker);
    scopesChecked += result.ok;
    scopesFailed += result.failed;
    if (result.closed.length === 0) break;
    const closedKeys = new Set(result.closed.map((item) => formatDateOnly(item.date)));
    for (const item of result.closed) closedFound.push(`${formatDateOnly(item.date)} ${item.scope}`);
    for (const item of items) {
      if (closedKeys.has(formatDateOnly(item.date))) touched.add(item.key.split(":")[1]);
    }
    if (touched.size) await recheckOpenCaseDates(actor, { caseIds: [...touched] });
  }
  return { rounds, scopesChecked, scopesFailed, closedFound, casesTouched: touched.size };
}

