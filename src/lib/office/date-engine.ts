import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, formatDateOnly } from "@/lib/office/serializers";
import { toHijri } from "@/lib/office/hijri";
import { nextBoardAttestationNumber } from "@/lib/office/board-attestation";
import { boardYearForSuffix, parseRollSuffix } from "@/lib/office/rnumber";
import { revalidateOfficeSetup } from "@/lib/office/setup-cache";
import { aiResearchWorkingDates } from "@/lib/office/ai-dates";
import { DayResolver, MOFA_CITY_PRIORITY as CITY_PRIORITY, type CityScope as Cities, type DayRule } from "@/lib/office/day-rules";
import { KIND_INFO, applyAttestationPlan, attestationKind, ruleForKind } from "@/lib/office/attestation-dates";

// docs/office-module/06 §N5/N6 — set-date engine.
// §W60: har date EK qaide se (day-rules.ts): weekend + admin holiday table +
// BUILT-IN chhuttiyon ka calendar (Iqbal Day, Eid, Ashura… code mein) + AI ke
// dhoonde band din. Har step apne mulk / sheher / din ke hisaab se
// (attestation-dates.ts KIND_INFO: Mofa Saudi = Saudi working day, Saudi
// Embassy = Islamabad + embassies, …). Pehle set ke zyada tar steps sirf
// holiday TABLE dekhte thay (table mein na ho to chhutti par date) aur baqi AI
// ke andaze par. Tarteeb ka qaida bhi yahin: har step pichle qadam (Board →
// ibcc → Mofa → Saudi Embassy → Mofa Saudi) ke BAAD. Aakhir mein planner case
// ki baqi (set se bahar) attestations ki dates / tarteeb bhi theek karta hai.
// AI ka intezar yahan nahi (sirf 2019 pool khali ho to) — AI research baad
// mein background mein (date-recheck.ts).

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

export type CityScope = Cities;
export const MOFA_CITY_PRIORITY: CityScope[] = CITY_PRIORITY;

function dayOnly(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

export type WorkingDayOpts = {
  city?: CityScope;
  extraScopes?: string[];
  allowedWeekdays?: number[]; // UTC weekday numbers (0=Sun)
};

function ruleFrom(opts: WorkingDayOpts & { country?: "PK" | "SA" }): DayRule {
  return {
    country: opts.country ?? "PK",
    city: opts.city,
    extraScopes: opts.extraScopes,
    allowedWeekdays: opts.allowedWeekdays,
  };
}

// --- Public single-day checks ------------------------------------------------

export async function isPakistanWorkingDay(dateInput: Date, city?: CityScope, db: Db = prisma): Promise<boolean> {
  return (await new DayResolver(db).verdict(dateInput, { country: "PK", city })).open;
}

export async function isSaudiWorkingDay(dateInput: Date, db: Db = prisma): Promise<boolean> {
  return (await new DayResolver(db).verdict(dateInput, { country: "SA" })).open;
}

export async function firstWorkingDayOnOrAfter(
  candidate: Date,
  opts: WorkingDayOpts & { country?: "PK" | "SA" } = {},
  db: Db = prisma
): Promise<Date> {
  return (await new DayResolver(db).firstOpen(candidate, ruleFrom(opts))).date;
}

// candidate = base + N calendar days, phir us din ya baad ka pehla khula din.
export async function firstWorkingDayAfterOffset(
  base: Date,
  days: number,
  opts: WorkingDayOpts & { country?: "PK" | "SA" } = {},
  db: Db = prisma
): Promise<Date> {
  return firstWorkingDayOnOrAfter(addDays(dayOnly(base), days), opts, db);
}

export function formatDdMmYy(date: Date): string {
  const dd = String(date.getUTCDate()).padStart(2, "0");
  const mm = String(date.getUTCMonth() + 1).padStart(2, "0");
  const yy = String(date.getUTCFullYear() % 100).padStart(2, "0");
  return `${dd}-${mm}-${yy}`;
}

// --- Set orchestrator ---------------------------------------------------------

type SetFamily = "UV" | "QR" | "BOARD_ONLY" | "MEDICAL" | "ATTESTATION";

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
  boardAttestationNumber: string | null;
};

function detectFamily(stepKeys: string[]): SetFamily {
  if (stepKeys.includes("BMFQ_VERIFICATION")) return "MEDICAL";
  if (stepKeys.includes("CPLS_ATTESTATION") || stepKeys.includes("APAC_ATTESTATION")) return "ATTESTATION";
  if (stepKeys.includes("UV_IBCC") || stepKeys.includes("BACK_NAVTTC")) return "UV";
  if (stepKeys.includes("QR_IBCC") || stepKeys.includes("CURRENT_NAVTTC")) return "QR";
  return "BOARD_ONLY";
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
    return { status: "pending", pendingReasons: ["Set of Attestations select nahi hua"], steps: [], boardAttestationNumber: null };
  }

  const steps = item.set.steps;
  const stepKeys = steps.map((step) => step.stepKey);
  const family = detectFamily(stepKeys);
  const secondKey = stepKeys[1] ?? null;
  const labelOf = (key: string) => steps.find((step) => step.stepKey === key)?.label ?? key;

  const firstPayment = await db.payment.findFirst({
    where: { caseId, status: "RECEIVED" },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
    select: { paymentDate: true },
  });
  const paymentDate = firstPayment ? dayOnly(firstPayment.paymentDate) : null;

  const pendingReasons = new Set<string>();
  const dates = new Map<string, Date>();
  const notes = new Map<string, string>();
  const days = new DayResolver(db);

  const tierOf = (key: string) => {
    const kind = attestationKind(labelOf(key), key);
    return kind ? KIND_INFO[kind].tier : null;
  };
  // §W60 — har step ka din us ke apne qaide se, aur pichle qadam ke BAAD.
  const work = async (key: string, candidate: Date) => {
    const tier = tierOf(key);
    let floor = dayOnly(candidate);
    if (tier !== null) {
      for (const [otherKey, date] of dates) {
        const otherTier = tierOf(otherKey);
        if (otherTier !== null && otherTier < tier && date >= floor) floor = addDays(date, 1);
      }
    }
    return days.firstOpen(floor, ruleForKind(attestationKind(labelOf(key), key)));
  };

  const needsPayment = (): boolean => {
    if (paymentDate) return false;
    pendingReasons.add(PENDING_NO_PAYMENT);
    return true;
  };

  // -- BOARD (+ its UV/QR pair) -------------------------------------------------
  const hasBoard = stepKeys.includes("BOARD");
  if (hasBoard) {
    const rNumberMode =
      family === "UV" || secondKey === "UV_IBCC" || secondKey === "BACK_NAVTTC";
    if (rNumberMode) {
      const suffix = parseRollSuffix(item.rollNumber);
      const forcedYear = boardYearForSuffix(suffix);
      let boardDate: Date | null = null;
      if (forcedYear) {
        // Suffix 19/20/21 → that year. The brief fixes only the YEAR; we use the
        // first payment's month/day in that year (deterministic), then the first
        // working day on/after it. Without a payment the Board date stays pending.
        if (!needsPayment() && paymentDate) {
          const base = new Date(Date.UTC(forcedYear, paymentDate.getUTCMonth(), paymentDate.getUTCDate()));
          boardDate = (await work("BOARD", base)).date;
        }
      } else {
        const boardRule = ruleForKind("BOARD");
        await days.ensure(new Date(Date.UTC(2019, 0, 1)), new Date(Date.UTC(2019, 11, 31)));
        // §W60 (N6 "store the pick"): pehle se chuni hui 2019 date sahi ho to
        // wahi rahe — har payment / regenerate par nayi random date nahi.
        const current = await db.caseAttestation.findFirst({
          where: { caseId, attestationType: { name: labelOf("BOARD") } },
          select: { scheduledDate: true },
        });
        if (
          current?.scheduledDate &&
          current.scheduledDate.getUTCFullYear() === 2019 &&
          (await days.verdict(current.scheduledDate, boardRule)).open
        ) {
          boardDate = dayOnly(current.scheduledDate);
        } else {
          // Any other suffix → random pick from the 2019 working-date pool.
          let pool = await db.workingDatePool.findMany({ where: { year: 2019 }, select: { date: true } });
          if (pool.length < POOL_TARGET_2019) {
            // Owner's brief: the AI RESEARCHES 2019 working dates into the pool
            // (admin can edit/delete them afterwards). Only when the AI fails do
            // we continue with whatever the pool already holds.
            try {
              const existing = pool.map((row) => formatDateOnly(row.date));
              const researched = await aiResearchWorkingDates(2019, POOL_TARGET_2019 - pool.length, existing, db);
              for (const researchedItem of researched) {
                await db.workingDatePool.upsert({
                  where: { year_date: { year: 2019, date: researchedItem.date } },
                  update: {},
                  create: { year: 2019, date: researchedItem.date, note: researchedItem.reason ? `AI: ${researchedItem.reason}` : "AI research" },
                });
              }
              if (researched.length > 0) {
                pool = await db.workingDatePool.findMany({ where: { year: 2019 }, select: { date: true } });
              }
            } catch (error) {
              console.warn("[date-engine] 2019 pool AI fill fail", error instanceof Error ? error.message : error);
            }
          }
          // §W60: pool ki sirf wo dates jo chhutti / weekend / Quetta band nahi.
          const candidates: Date[] = [];
          for (const row of pool) {
            const date = dayOnly(row.date);
            if ((await days.verdict(date, boardRule)).open) candidates.push(date);
          }
          if (candidates.length === 0) {
            pendingReasons.add(PENDING_POOL_EMPTY);
          } else {
            boardDate = candidates[Math.floor(Math.random() * candidates.length)];
          }
        }
      }
      if (boardDate) {
        dates.set("BOARD", boardDate);
        // UV ibcc / Back Navttc: working day ≥ 3 days after Board (same year).
        const uvKey = stepKeys.includes("UV_IBCC") ? "UV_IBCC" : "BACK_NAVTTC";
        if (stepKeys.includes(uvKey)) {
          const uvDate = (await work(uvKey, addDays(boardDate, 3))).date;
          const crossedYear = uvDate.getUTCFullYear() !== boardDate.getUTCFullYear();
          dates.set(uvKey, uvDate);
          const pairNote = `Board pair: ${formatDateOnly(boardDate)}${crossedYear ? " (sal barh gaya)" : ""}`;
          notes.set(uvKey, pairNote);
          notes.set("BOARD", `${uvKey === "UV_IBCC" ? "UV ibcc" : "Back Navttc"} pair: ${formatDateOnly(uvDate)}`);
        }
      } else {
        if (stepKeys.includes("UV_IBCC") || stepKeys.includes("BACK_NAVTTC")) {
          // Pair cannot be computed without its Board date.
          if (forcedYear && !paymentDate) pendingReasons.add(PENDING_NO_PAYMENT);
        }
      }
    } else {
      // Set-(ii) family (QR / Current Navttc) and Board-only sets (v)/(vii):
      // Board = first payment + 5 days → first working day (PAK + QUETTA rule).
      if (!needsPayment() && paymentDate) {
        dates.set("BOARD", (await work("BOARD", addDays(paymentDate, 5))).date);
      }
    }

    // QR code ibcc / Current Navttc = Board + 2 days → first Islamabad working day.
    const qrKey = stepKeys.includes("QR_IBCC") ? "QR_IBCC" : "CURRENT_NAVTTC";
    if (stepKeys.includes(qrKey)) {
      const boardDate = dates.get("BOARD");
      if (boardDate) dates.set(qrKey, (await work(qrKey, addDays(boardDate, 2))).date);
      else if (!pendingReasons.size) pendingReasons.add("Board date ke baghair QR ibcc nahi ban sakta");
    }
  }

  // -- Medical Bmfq (§W60: Special Mofa se PEHLE — pehle baad mein tha, is liye
  //    Medical set (i) ki Special Mofa date kabhi nahi banti thi) --------------
  if (stepKeys.includes("BMFQ_VERIFICATION")) {
    if (!needsPayment() && paymentDate) {
      dates.set("BMFQ_VERIFICATION", (await work("BMFQ_VERIFICATION", addDays(paymentDate, 5))).date);
    }
  }
  if (stepKeys.includes("MOH_ATTESTATION")) {
    const bmfq = dates.get("BMFQ_VERIFICATION");
    if (bmfq) dates.set("MOH_ATTESTATION", (await work("MOH_ATTESTATION", addDays(bmfq, 2))).date);
  }

  // -- CPLS / APAC (§W60: Special Mofa se pehle, wahi wajah) -----------------------
  const attestationKey = stepKeys.includes("CPLS_ATTESTATION") ? "CPLS_ATTESTATION" : "APAC_ATTESTATION";
  if (stepKeys.includes(attestationKey)) {
    if (!needsPayment() && paymentDate) {
      dates.set(attestationKey, (await work(attestationKey, addDays(paymentDate, 3))).date);
    }
  }
  if (stepKeys.includes("NAVTTC")) {
    const attestation = dates.get(attestationKey);
    if (attestation) dates.set("NAVTTC", (await work("NAVTTC", addDays(attestation, 1))).date);
  }

  // -- SPECIAL_MOFA ------------------------------------------------------------
  if (stepKeys.includes("SPECIAL_MOFA")) {
    let candidate: Date | null = null;
    if (family === "UV" || family === "BOARD_ONLY") {
      // i-style: first payment + 7 days.
      if (!needsPayment() && paymentDate) candidate = addDays(paymentDate, 7);
    } else if (family === "MEDICAL") {
      const moh = dates.get("MOH_ATTESTATION");
      if (moh) candidate = addDays(moh, 1);
    } else {
      // ii-style / CPLS / APAC: previous step date + 1 day.
      const prevKey = stepKeys[stepKeys.indexOf("SPECIAL_MOFA") - 1];
      const prev = prevKey ? dates.get(prevKey) : null;
      if (prev) candidate = addDays(prev, 1);
    }
    if (candidate) {
      // Pakistan working day + Islamabad → Gujrat → Lahore mein pehli khuli city.
      const result = await work("SPECIAL_MOFA", candidate);
      dates.set("SPECIAL_MOFA", result.date);
      notes.set("SPECIAL_MOFA", `City: ${result.city ?? MOFA_CITY_PRIORITY[0]}`);
    } else if (paymentDate && !pendingReasons.size) {
      pendingReasons.add("Special Mofa ka pichla step abhi pending hai");
    }
  }

  // -- SAUDI_EMBASSY / MOFA_SAUD -----------------------------------------------------
  // Saudi Embassy: Special Mofa + 2 → Islamabad working day, Tue/Wed/Thu/Fri,
  // embassies band na hon. Mofa Saudi: Saudi Embassy + 4 → SAUDI working day,
  // Mon/Tue/Wed (Saudi chhuttiyan bhi).
  if (stepKeys.includes("SAUDI_EMBASSY")) {
    const mofa = dates.get("SPECIAL_MOFA");
    if (mofa) {
      const date = (await work("SAUDI_EMBASSY", addDays(mofa, 2))).date;
      dates.set("SAUDI_EMBASSY", date);
      notes.set("SAUDI_EMBASSY", `Hijri: ${toHijri(date).formatted}`);
    } else if (paymentDate) {
      pendingReasons.add("Saudi Embassy ke liye Special Mofa date chahiye");
    }
  }
  // §W24: live DB ke sets stepKey "MOFA_SAUDI" use karte hain jabke purana
  // seed "MOFA_SAUD" likhta tha — dono keys accept karo (pehli maujood key).
  const mofaSaudKey = stepKeys.includes("MOFA_SAUDI") ? "MOFA_SAUDI" : "MOFA_SAUD";
  if (stepKeys.includes(mofaSaudKey)) {
    const saudiEmbassy = dates.get("SAUDI_EMBASSY");
    if (saudiEmbassy) {
      const date = (await work(mofaSaudKey, addDays(saudiEmbassy, 4))).date;
      dates.set(mofaSaudKey, date);
      notes.set(mofaSaudKey, formatDdMmYy(date));
    } else if (paymentDate) {
      pendingReasons.add("Mofa Saudi ke liye Saudi Embassy date chahiye");
    }
  }

  const computations: StepComputation[] = steps.map((step) => ({
    stepKey: step.stepKey,
    label: step.label,
    order: step.order,
    scheduledDate: dates.get(step.stepKey) ?? null,
    notes: notes.get(step.stepKey) ?? null,
  }));

  // -- Persist -------------------------------------------------------------------
  const boardAttestationNumber = await prisma.$transaction(async (tx) => {
    let attestationNumber: string | null = null;
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
        // Regeneration refreshes dates/notes but never wipes attestation-department
        // progress: an existing status (IN_PROGRESS / DONE) is kept, and an
        // existing date is kept when the new computation had to stay pending.
        // §W60: DONE step ki date bhi nahi badalti (kaam ho chuka).
        await tx.caseAttestation.update({
          where: { id: existing.id },
          data:
            existing.status === "DONE"
              ? { order: step.order }
              : {
                  scheduledDate: step.scheduledDate ?? existing.scheduledDate,
                  notes: step.notes ?? existing.notes,
                  order: step.order,
                },
        });
      }
    }

    const boardDate = dates.get("BOARD");
    if (boardDate) {
      // Board Attestation Number is consumed once per case; never regenerate it.
      const current = await tx.case.findUnique({ where: { id: caseId }, select: { boardAttestationNumber: true } });
      if (current && !current.boardAttestationNumber) {
        attestationNumber = await nextBoardAttestationNumber(boardDate, tx);
        await tx.case.update({ where: { id: caseId }, data: { boardAttestationNumber: attestationNumber } });
      } else {
        attestationNumber = current?.boardAttestationNumber ?? null;
      }
    }
    return attestationNumber;
  }, { maxWait: 10000, timeout: 30000 });

  // §W60: set ke bahar ki attestations (extra / one-by-one) ki date + poore
  // case ki tarteeb / chhutti ka aakhri check.
  try {
    await applyAttestationPlan(caseId);
  } catch (error) {
    console.error("[date-engine] attestation plan fail", error);
  }

  // §W20: upsert ne naya AttestationType banaya ho sakta hai — setup cache
  // invalidate (best-effort; generateSetDates after() se bhi call hota hai).
  try {
    revalidateOfficeSetup();
  } catch (error) {
    console.error("[office] setup cache revalidate fail", error);
  }

  return {
    status: pendingReasons.size ? "pending" : "ok",
    pendingReasons: [...pendingReasons],
    steps: computations,
    boardAttestationNumber,
  };
}
