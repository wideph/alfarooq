import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, formatDateOnly } from "@/lib/office/serializers";
import { toHijri } from "@/lib/office/hijri";
import { nextBoardAttasNumber } from "@/lib/office/board-attas";
import { boardYearForSuffix, parseRollSuffix } from "@/lib/office/rnumber";
import {
  aiChooseMoofaCity,
  aiResearchWorkingDates,
  cityOpenVerdict,
  embassyOpenVerdict,
  pakistanWorkingVerdict,
  saudiWorkingVerdict,
  type AiVerdict,
  type CityName,
} from "@/lib/office/ai-dates";

// docs/office-module/06 §N5/N6 — AI-FIRST set-date engine.
// Every step formula now validates each candidate date through the attached AI
// model (src/lib/office/ai-dates.ts): Pakistan working day, city closures
// (incidents/preparations/strikes), embassy closures in Islamabad and Saudi
// working days are all RESEARCHED by the AI, cached into HolidayClosure /
// WorkingDayCache (admin can edit/delete; admin rows always win), and only
// when the AI key is missing or a call fails does the deterministic weekend +
// HolidayClosure-table layer below act as the fallback.

type Db = Prisma.TransactionClient | typeof prisma;

export const HOLIDAY_SCOPES = [
  "PAKISTAN",
  "ISLAMABAD",
  "QUETTA",
  "GUJRAT",
  "LAHORE",
  "EMBASSIES_ISB",
  "SAUDI",
] as const;
export type HolidayScope = (typeof HOLIDAY_SCOPES)[number];

export type CityScope = "ISLAMABAD" | "QUETTA" | "GUJRAT" | "LAHORE";

const PAKISTAN_WEEKEND = new Set([0, 6]); // Sun, Sat
const SAUDI_WEEKEND = new Set([5, 6]); // Fri, Sat

const MAX_LOOKAHEAD_DAYS = 45;

function dateKey(date: Date): string {
  return formatDateOnly(date);
}

function dayOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

// --- Deterministic fallback layer (pure, kept for reference/tests) -----------
// These pure helpers are the pre-AI engine. The live path is the AI-first loop
// below; ai-dates.ts reproduces this exact rule (weekend + HolidayClosure) when
// the AI is unavailable, so behaviour never regresses.
// Loads HolidayClosure rows covering [from, from + days] once, so the forward
// iteration below is pure in-memory. Key: "YYYY-MM-DD" → set of scopes.
async function loadClosures(db: Db, from: Date, days = MAX_LOOKAHEAD_DAYS): Promise<Map<string, Set<string>>> {
  const rows = await db.holidayClosure.findMany({
    where: { date: { gte: from, lte: addDays(from, days) } },
    select: { date: true, scope: true },
  });
  const map = new Map<string, Set<string>>();
  for (const row of rows) {
    const key = dateKey(row.date);
    const scopes = map.get(key) ?? new Set<string>();
    scopes.add(row.scope);
    map.set(key, scopes);
  }
  return map;
}

function isBlockedDay(
  date: Date,
  closures: Map<string, Set<string>>,
  weekend: Set<number>,
  scopes: readonly string[]
): boolean {
  if (weekend.has(date.getUTCDay())) return true;
  const dayScopes = closures.get(dateKey(date));
  if (!dayScopes) return false;
  return scopes.some((scope) => dayScopes.has(scope));
}

export type WorkingDayOpts = {
  city?: CityScope;
  extraScopes?: readonly string[];
  allowedWeekdays?: readonly number[]; // UTC weekday numbers (0=Sun)
};

// First working day on/after `candidate`.
// Pakistan rule: Sat+Sun weekend; PAKISTAN-scope closures always block;
// a city-scope closure blocks only when that city is requested.
// Saudi rule: Fri+Sat weekend; SAUDI-scope closures block.
function firstWorkingDayWith(
  candidateInput: Date,
  closures: Map<string, Set<string>>,
  country: "PK" | "SA",
  opts: WorkingDayOpts = {}
): Date {
  const weekend = country === "PK" ? PAKISTAN_WEEKEND : SAUDI_WEEKEND;
  const scopes: string[] = country === "PK" ? ["PAKISTAN"] : ["SAUDI"];
  if (opts.city) scopes.push(opts.city);
  if (opts.extraScopes) scopes.push(...opts.extraScopes);

  let date = dayOnly(candidateInput);
  for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i += 1) {
    if (opts.allowedWeekdays && !opts.allowedWeekdays.includes(date.getUTCDay())) {
      date = addDays(date, 1);
      continue;
    }
    if (!isBlockedDay(date, closures, weekend, scopes)) return date;
    date = addDays(date, 1);
  }
  // Fallback (closures loaded window exhausted): weekend-only rule.
  while (weekend.has(date.getUTCDay())) date = addDays(date, 1);
  return date;
}

// --- AI-first layer ----------------------------------------------------------
// Each candidate day is decided by the AI research layer (ai-dates.ts). The AI
// verdict functions already consult the HolidayClosure / WorkingDayCache tables
// first (admin rows win) and fall back to the deterministic table rule when the
// AI is unavailable — so this loop IS also the fallback path.

function verdictForScope(date: Date, scope: string, db: Db): Promise<AiVerdict> {
  switch (scope) {
    case "PAKISTAN":
      return pakistanWorkingVerdict(date, db);
    case "SAUDI":
      return saudiWorkingVerdict(date, db);
    case "EMBASSIES_ISB":
      return embassyOpenVerdict(date, db);
    default:
      return cityOpenVerdict(date, scope as CityName, db);
  }
}

// First working day on/after `candidate`, every day decided AI-first.
async function firstWorkingDayAi(
  candidateInput: Date,
  country: "PK" | "SA",
  opts: WorkingDayOpts,
  db: Db
): Promise<Date> {
  const weekend = country === "PK" ? PAKISTAN_WEEKEND : SAUDI_WEEKEND;
  const scopes: string[] = country === "PK" ? ["PAKISTAN"] : ["SAUDI"];
  if (opts.city) scopes.push(opts.city);
  if (opts.extraScopes) scopes.push(...opts.extraScopes);

  let date = dayOnly(candidateInput);
  for (let i = 0; i < MAX_LOOKAHEAD_DAYS; i += 1) {
    if (opts.allowedWeekdays && !opts.allowedWeekdays.includes(date.getUTCDay())) {
      date = addDays(date, 1);
      continue;
    }
    if (weekend.has(date.getUTCDay())) {
      date = addDays(date, 1);
      continue;
    }
    // All scopes of this day are researched in PARALLEL: each AI call scans a
    // 14-day window and caches, so the following days are cache hits and one
    // window costs roughly one AI round-trip instead of one per scope per day.
    const verdicts = await Promise.all(scopes.map((scope) => verdictForScope(date, scope, db)));
    if (verdicts.every((verdict) => verdict.open)) return date;
    date = addDays(date, 1);
  }
  // Lookahead exhausted: weekend-only rule (same as the pure fallback).
  while (weekend.has(date.getUTCDay())) date = addDays(date, 1);
  return date;
}

// --- Public single-day checks (AI-first; used by routes/validation) ---------

export async function isPakistanWorkingDay(dateInput: Date, city?: CityScope, db: Db = prisma): Promise<boolean> {
  const date = dayOnly(dateInput);
  if (PAKISTAN_WEEKEND.has(date.getUTCDay())) return false;
  const pakistan = await pakistanWorkingVerdict(date, db);
  if (!pakistan.open) return false;
  if (city) {
    const cityVerdict = await cityOpenVerdict(date, city, db);
    if (!cityVerdict.open) return false;
  }
  return true;
}

export async function isSaudiWorkingDay(dateInput: Date, db: Db = prisma): Promise<boolean> {
  const date = dayOnly(dateInput);
  if (SAUDI_WEEKEND.has(date.getUTCDay())) return false;
  const verdict = await saudiWorkingVerdict(date, db);
  return verdict.open;
}

export async function firstWorkingDayOnOrAfter(
  candidate: Date,
  opts: WorkingDayOpts & { country?: "PK" | "SA" } = {},
  db: Db = prisma
): Promise<Date> {
  return firstWorkingDayAi(candidate, opts.country ?? "PK", opts, db);
}

// Offset helper per §N5/N6: candidate = base + N calendar days, then first
// working day on/after that candidate.
export async function firstWorkingDayAfterOffset(
  base: Date,
  days: number,
  opts: WorkingDayOpts & { country?: "PK" | "SA" } = {},
  db: Db = prisma
): Promise<Date> {
  return firstWorkingDayOnOrAfter(addDays(dayOnly(base), days), opts, db);
}

// --- Specialised formulas (§N5) ----------------------------------------------

export const MOOFA_CITY_PRIORITY: CityScope[] = ["ISLAMABAD", "GUJRAT", "LAHORE"];

// Special Moofa: first Pakistan working day on/after candidate (AI decides),
// then the AI picks the first open city (priority Islamabad → Gujrat → Lahore),
// cross-checked against the admin HolidayClosure table. If all three cities are
// closed that day, fall back to the earliest city-specific AI-checked working
// day so a date is always returned.
export async function specialMoofaCityDate(
  candidate: Date,
  db: Db = prisma
): Promise<{ date: Date; city: CityScope }> {
  const start = dayOnly(candidate);
  const base = await firstWorkingDayAi(start, "PK", {}, db);

  const choice = await aiChooseMoofaCity(base, db);
  const chosenCheck = await cityOpenVerdict(base, choice.city, db);
  if (chosenCheck.open) return { date: base, city: choice.city };

  // All three cities closed on the base date (or admin overrode the AI pick):
  // earliest city-specific working day.
  let best: { date: Date; city: CityScope } = {
    date: await firstWorkingDayAi(start, "PK", { city: MOOFA_CITY_PRIORITY[0] }, db),
    city: MOOFA_CITY_PRIORITY[0],
  };
  for (const city of MOOFA_CITY_PRIORITY.slice(1)) {
    const date = await firstWorkingDayAi(start, "PK", { city }, db);
    if (date < best.date) best = { date, city };
  }
  return best;
}

// Saud MBC: Special Moofa + 2 → first Islamabad working day on Tue/Wed/Thu/Fri
// with no EMBASSIES_ISB closure that date.
export async function saudMbcDate(specialMoofaDate: Date, db: Db = prisma): Promise<Date> {
  return firstWorkingDayAfterOffset(
    specialMoofaDate,
    2,
    { city: "ISLAMABAD", extraScopes: ["EMBASSIES_ISB"], allowedWeekdays: [2, 3, 4, 5] },
    db
  );
}

// Moofa Saud: Saud MBC + 4 → first Saudi working day on Sun/Mon/Tue/Wed.
export async function moofaSaudDate(saudMbc: Date, db: Db = prisma): Promise<Date> {
  return firstWorkingDayAfterOffset(saudMbc, 4, { country: "SA", allowedWeekdays: [0, 1, 2, 3] }, db);
}

export function formatDdMmYy(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(date.getUTCFullYear() % 100).padStart(2, "0");
  return `${dd}-${mm}-${yy}`;
}

// --- Set orchestrator ---------------------------------------------------------

type SetFamily = "UV" | "QR" | "BORD_ONLY" | "MEDICAL" | "ATTA";

export type StepComputation = {
  stepKey: string;
  label: string;
  order: number;
  scheduledDate: Date | null;
  notes: string | null;
};

export type GenerateSetDatesResult = {
  status: "ok" | "pending";
  pendingReasons: string[];
  steps: StepComputation[];
  boardAttasNumber: string | null;
};

function detectFamily(stepKeys: string[]): SetFamily {
  if (stepKeys.includes("BMFQ_VER")) return "MEDICAL";
  if (stepKeys.includes("CPLS_ATTA") || stepKeys.includes("APAC_ATTA")) return "ATTA";
  if (stepKeys.includes("UV_IDCC") || stepKeys.includes("BACK_NEVTCC")) return "UV";
  if (stepKeys.includes("QR_IDCC") || stepKeys.includes("CURRENT_NEVTCC")) return "QR";
  return "BORD_ONLY";
}

const PENDING_NO_PAYMENT = "Pehli payment receive nahi hui — dates payment ke baad banenge";
const PENDING_POOL_EMPTY = "2019 working-date pool khali hai — admin pool bhare";

// Owner's brief: the 2019 pool holds up to 30 AI-researched working dates.
const POOL_TARGET_2019 = 30;

// Computes (and persists) the scheduled dates of every step of a case's set.
// Never throws for missing inputs: steps whose inputs are missing are left
// without a scheduledDate and the reason is returned (docs §N5/N6).
export async function generateSetDates(caseId: string, db: Db = prisma): Promise<GenerateSetDatesResult> {
  const item = await db.case.findUnique({
    where: { id: caseId },
    include: {
      category: { select: { name: true } },
      set: { include: { steps: { orderBy: { order: "asc" } } } },
    },
  });
  if (!item) throw new Error("Case nahi mila");
  if (!item.set || item.set.steps.length === 0) {
    return { status: "pending", pendingReasons: ["Set select nahi hua"], steps: [], boardAttasNumber: null };
  }

  const steps = item.set.steps;
  const stepKeys = steps.map((step) => step.stepKey);
  const family = detectFamily(stepKeys);
  const secondKey = stepKeys[1] ?? null;

  const firstPayment = await db.payment.findFirst({
    where: { caseId, status: "RECEIVED" },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
    select: { paymentDate: true },
  });
  const paymentDate = firstPayment ? dayOnly(firstPayment.paymentDate) : null;

  const pendingReasons = new Set<string>();
  const dates = new Map<string, Date>();
  const notes = new Map<string, string>();

  // Preload closures for the whole window we may touch (payment-based formulas
  // reach ~payment+20 days; r-number years can be anywhere, so those steps load
  // their own windows via the async helpers).
  const windowStart = paymentDate ?? new Date(Date.UTC(2019, 0, 1));
  const closures = await loadClosures(db, windowStart, 400);

  const pkWorking = (candidate: Date, opts: WorkingDayOpts = {}) => firstWorkingDayWith(candidate, closures, "PK", opts);

  const needsPayment = (): boolean => {
    if (paymentDate) return false;
    pendingReasons.add(PENDING_NO_PAYMENT);
    return true;
  };

  // -- BORD (+ its UV/QR pair) -------------------------------------------------
  const hasBord = stepKeys.includes("BORD");
  if (hasBord) {
    const rNumberMode =
      family === "UV" || secondKey === "UV_IDCC" || secondKey === "BACK_NEVTCC";
    if (rNumberMode) {
      const suffix = parseRollSuffix(item.rollNumber);
      const forcedYear = boardYearForSuffix(suffix);
      let bordDate: Date | null = null;
      if (forcedYear) {
        // Suffix 19/20/21 → that year. The brief fixes only the YEAR; we use the
        // first payment's month/day in that year (deterministic), then the first
        // working day on/after it. Without a payment the Bord date stays pending.
        if (!needsPayment() && paymentDate) {
          const base = new Date(Date.UTC(forcedYear, paymentDate.getUTCMonth(), paymentDate.getUTCDate()));
          bordDate = await firstWorkingDayOnOrAfter(base, {}, db);
        }
      } else {
        // Any other suffix → random pick from the 2019 working-date pool.
        let pool = await db.workingDatePool.findMany({
          where: { year: 2019 },
          select: { date: true },
        });
        if (pool.length < POOL_TARGET_2019) {
          // Owner's brief: the AI RESEARCHES 2019 working dates into the pool
          // (admin can edit/delete them afterwards). Only when the AI fails do
          // we continue with whatever the pool already holds.
          try {
            const existing = pool.map((row) => formatDateOnly(row.date));
            const researched = await aiResearchWorkingDates(2019, POOL_TARGET_2019 - pool.length, existing, db);
            for (const item of researched) {
              await db.workingDatePool.upsert({
                where: { year_date: { year: 2019, date: item.date } },
                update: {},
                create: { year: 2019, date: item.date, note: item.reason ? `AI: ${item.reason}` : "AI research" },
              });
            }
            if (researched.length > 0) {
              pool = await db.workingDatePool.findMany({ where: { year: 2019 }, select: { date: true } });
            }
          } catch (error) {
            console.warn("[date-engine] 2019 pool AI fill fail", error instanceof Error ? error.message : error);
          }
        }
        const candidates = pool
          .map((row) => dayOnly(row.date))
          .filter((date) => !PAKISTAN_WEEKEND.has(date.getUTCDay()));
        if (candidates.length === 0) {
          pendingReasons.add(PENDING_POOL_EMPTY);
        } else {
          bordDate = candidates[Math.floor(Math.random() * candidates.length)];
        }
      }
      if (bordDate) {
        dates.set("BORD", bordDate);
        // UV idcc / Back Nevtcc: working day ≥ 3 days after Bord (same year).
        const uvKey = stepKeys.includes("UV_IDCC") ? "UV_IDCC" : "BACK_NEVTCC";
        if (stepKeys.includes(uvKey)) {
          const uvDate = await firstWorkingDayOnOrAfter(addDays(bordDate, 3), {}, db);
          const crossedYear = uvDate.getUTCFullYear() !== bordDate.getUTCFullYear();
          dates.set(uvKey, uvDate);
          const pairNote = `Bord pair: ${formatDateOnly(bordDate)}${crossedYear ? " (sal barh gaya)" : ""}`;
          notes.set(uvKey, pairNote);
          notes.set("BORD", `${uvKey === "UV_IDCC" ? "UV idcc" : "Back Nevtcc"} pair: ${formatDateOnly(uvDate)}`);
        }
      } else {
        if (stepKeys.includes("UV_IDCC") || stepKeys.includes("BACK_NEVTCC")) {
          // Pair cannot be computed without its Bord date.
          if (forcedYear && !paymentDate) pendingReasons.add(PENDING_NO_PAYMENT);
        }
      }
    } else {
      // Set-(ii) family (QR / Current Nevtcc) and Bord-only sets (v)/(vii):
      // Bord = first payment + 5 days → first working day (PAK + QUETTA rule).
      if (!needsPayment() && paymentDate) {
        const bordDate = await pkWorking(addDays(paymentDate, 5), { city: "QUETTA" });
        dates.set("BORD", bordDate);
      }
    }

    // QR code idcc / Current Nevtcc = Bord + 2 days → first Islamabad working day.
    const qrKey = stepKeys.includes("QR_IDCC") ? "QR_IDCC" : "CURRENT_NEVTCC";
    if (stepKeys.includes(qrKey)) {
      const bordDate = dates.get("BORD");
      if (bordDate) dates.set(qrKey, await pkWorking(addDays(bordDate, 2), { city: "ISLAMABAD" }));
      else if (!pendingReasons.size) pendingReasons.add("Bord date ke baghair QR idcc nahi ban sakta");
    }
  }

  // -- SPECIAL_MOOFA ------------------------------------------------------------
  if (stepKeys.includes("SPECIAL_MOOFA")) {
    let candidate: Date | null = null;
    if (family === "UV" || family === "BORD_ONLY") {
      // i-style: first payment + 7 days.
      if (!needsPayment() && paymentDate) candidate = addDays(paymentDate, 7);
    } else if (family === "MEDICAL") {
      const moh = dates.get("MOH_ATTA");
      if (moh) candidate = addDays(moh, 1);
    } else {
      // ii-style / CPLS / APAC: previous step date + 1 day.
      const prevKey = stepKeys[stepKeys.indexOf("SPECIAL_MOOFA") - 1];
      const prev = prevKey ? dates.get(prevKey) : null;
      if (prev) candidate = addDays(prev, 1);
    }
    if (candidate) {
      const result = await specialMoofaCityDate(candidate, db);
      dates.set("SPECIAL_MOOFA", result.date);
      notes.set("SPECIAL_MOOFA", `City: ${result.city}`);
    } else if (paymentDate && !pendingReasons.size) {
      pendingReasons.add("Special Moofa ka pichla step abhi pending hai");
    }
  }

  // -- SAUD_MBC / MOOFA_SAUD -----------------------------------------------------
  if (stepKeys.includes("SAUD_MBC")) {
    const moofa = dates.get("SPECIAL_MOOFA");
    if (moofa) {
      const date = await saudMbcDate(moofa, db);
      dates.set("SAUD_MBC", date);
      notes.set("SAUD_MBC", `Hijri: ${toHijri(date).formatted}`);
    } else if (paymentDate) {
      pendingReasons.add("Saud MBC ke liye Special Moofa date chahiye");
    }
  }
  if (stepKeys.includes("MOOFA_SAUD")) {
    const saudMbc = dates.get("SAUD_MBC");
    if (saudMbc) {
      const date = await moofaSaudDate(saudMbc, db);
      dates.set("MOOFA_SAUD", date);
      notes.set("MOOFA_SAUD", formatDdMmYy(date));
    } else if (paymentDate) {
      pendingReasons.add("Moofa Saud ke liye Saud MBC date chahiye");
    }
  }

  // -- Medical Bmfq ---------------------------------------------------------------
  if (stepKeys.includes("BMFQ_VER")) {
    if (!needsPayment() && paymentDate) {
      dates.set("BMFQ_VER", await pkWorking(addDays(paymentDate, 5), { city: "QUETTA" }));
    }
  }
  if (stepKeys.includes("MOH_ATTA")) {
    const bmfq = dates.get("BMFQ_VER");
    if (bmfq) dates.set("MOH_ATTA", await pkWorking(addDays(bmfq, 2), { city: "ISLAMABAD" }));
  }

  // -- CPLS / APAC -----------------------------------------------------------------
  const attaKey = stepKeys.includes("CPLS_ATTA") ? "CPLS_ATTA" : "APAC_ATTA";
  if (stepKeys.includes(attaKey)) {
    if (!needsPayment() && paymentDate) {
      dates.set(attaKey, await pkWorking(addDays(paymentDate, 3), { city: "ISLAMABAD" }));
    }
  }
  if (stepKeys.includes("NEVTCC")) {
    const atta = dates.get(attaKey);
    if (atta) dates.set("NEVTCC", await pkWorking(addDays(atta, 1), { city: "ISLAMABAD" }));
  }

  const computations: StepComputation[] = steps.map((step) => ({
    stepKey: step.stepKey,
    label: step.label,
    order: step.order,
    scheduledDate: dates.get(step.stepKey) ?? null,
    notes: notes.get(step.stepKey) ?? null,
  }));

  // -- Persist -------------------------------------------------------------------
  const boardAttasNumber = await prisma.$transaction(async (tx) => {
    let attasNumber: string | null = null;
    for (const step of computations) {
      const type = await tx.attestationType.upsert({
        where: { name: step.label },
        update: {},
        create: { name: step.label, order: step.order },
      });
      const existing = await tx.caseAttestation.findUnique({
        where: { caseId_attestationTypeId: { caseId, attestationTypeId: type.id } },
      });
      if (!existing) {
        await tx.caseAttestation.create({
          data: {
            caseId,
            attestationTypeId: type.id,
            status: "PENDING",
            scheduledDate: step.scheduledDate,
            notes: step.notes,
            order: step.order,
          },
        });
      } else {
        // Regeneration refreshes dates/notes but never wipes atta-department
        // progress: an existing status (IN_PROGRESS / DONE) is kept, and an
        // existing date is kept when the new computation had to stay pending.
        await tx.caseAttestation.update({
          where: { id: existing.id },
          data: {
            scheduledDate: step.scheduledDate ?? existing.scheduledDate,
            notes: step.notes ?? existing.notes,
            order: step.order,
          },
        });
      }
    }

    const bordDate = dates.get("BORD");
    if (bordDate) {
      // Board Attas Number is consumed once per case; never regenerate it.
      const current = await tx.case.findUnique({ where: { id: caseId }, select: { boardAttasNumber: true } });
      if (current && !current.boardAttasNumber) {
        attasNumber = await nextBoardAttasNumber(bordDate, tx);
        await tx.case.update({ where: { id: caseId }, data: { boardAttasNumber: attasNumber } });
      } else {
        attasNumber = current?.boardAttasNumber ?? null;
      }
    }
    return attasNumber;
  });

  return {
    status: pendingReasons.size ? "pending" : "ok",
    pendingReasons: [...pendingReasons],
    steps: computations,
    boardAttasNumber,
  };
}
