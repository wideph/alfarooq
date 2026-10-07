import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { BOT_QUICK_TIMEOUT_MS, callBotJson } from "@/lib/bot-ai";
import { fetchPrivateSiteSettingsFromDb } from "@/lib/get-site-settings";
import { addDays, formatDateOnly } from "@/lib/office/serializers";

// docs/office-module/03_BUSINESS_RULES.md BR7.
// Expected printing date = first Pakistan working day on/after payment date + 6.

export const PRINTING_LEAD_DAYS = 6;

type Db = Prisma.TransactionClient | typeof prisma;

export type WorkingDayResult = {
  candidateDate: Date;
  workingDate: Date;
  isCandidateWorking: boolean;
  reason: string | null;
  source: "AI" | "FALLBACK" | "MANUAL";
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function isWeekend(date: Date) {
  const day = date.getUTCDay();
  return day === 0 || day === 6;
}

function fallbackWorkingDay(candidate: Date): WorkingDayResult {
  let date = candidate;
  while (isWeekend(date)) date = addDays(date, 1);
  return {
    candidateDate: candidate,
    workingDate: date,
    isCandidateWorking: date.getTime() === candidate.getTime(),
    reason: date.getTime() === candidate.getTime() ? null : WEEKDAYS[candidate.getUTCDay()],
    source: "FALLBACK",
  };
}

async function askAi(candidate: Date): Promise<WorkingDayResult | null> {
  const settings = await fetchPrivateSiteSettingsFromDb();
  if (!settings.botApiKey || !settings.botModel) return null;

  const candidateText = formatDateOnly(candidate);
  const system = [
    "You are an expert on Pakistan's public holidays and government working days.",
    "Working days are Monday to Friday, excluding Pakistani national/public holidays:",
    "Eid ul Fitr (3 days), Eid ul Adha (3 days), Ashura (9-10 Muharram), Eid Milad un Nabi (12 Rabi ul Awal),",
    "Kashmir Day (5 Feb), Pakistan Day (23 Mar), Labour Day (1 May), Independence Day (14 Aug),",
    "Iqbal Day (9 Nov), Quaid-e-Azam Day (25 Dec), and other federal government announced holidays.",
    "Use the most accurate Islamic calendar dates you know for the given year.",
    "Answer with JSON only.",
  ].join(" ");
  const user = [
    `Candidate date: ${candidateText} (${WEEKDAYS[candidate.getUTCDay()]}).`,
    "Is it a working day in Pakistan? If not, what is the first working day on or after it?",
    'Return exactly: {"isWorkingDay": true|false, "workingDate": "YYYY-MM-DD", "reason": "short reason or empty"}',
  ].join(" ");

  try {
    const raw = await callBotJson(settings, system, user, '{"isWorkingDay"', 300, BOT_QUICK_TIMEOUT_MS);
    const parsed = JSON.parse(raw) as { isWorkingDay?: boolean; workingDate?: string; reason?: string };
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(parsed.workingDate || ""));
    if (!match) return null;
    const workingDate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    if (Number.isNaN(workingDate.getTime())) return null;
    // Sanity limits: never before the candidate, never more than 14 days later,
    // never a weekend. Anything else means the model drifted → fallback.
    if (workingDate < candidate || workingDate > addDays(candidate, 14) || isWeekend(workingDate)) return null;
    const isCandidateWorking = workingDate.getTime() === candidate.getTime();
    if (parsed.isWorkingDay === true && !isCandidateWorking) return null;
    return {
      candidateDate: candidate,
      workingDate,
      isCandidateWorking,
      reason: isCandidateWorking ? null : String(parsed.reason || "").slice(0, 200) || null,
      source: "AI",
    };
  } catch (error) {
    console.error("[working-day] AI fail", error instanceof Error ? error.message : error);
    return null;
  }
}

export async function resolvePakistanWorkingDay(candidateInput: Date, db: Db = prisma): Promise<WorkingDayResult> {
  const candidate = new Date(
    Date.UTC(candidateInput.getUTCFullYear(), candidateInput.getUTCMonth(), candidateInput.getUTCDate())
  );

  const cached = await db.workingDayCache.findUnique({ where: { candidateDate: candidate } });
  if (cached) {
    return {
      candidateDate: cached.candidateDate,
      workingDate: cached.workingDate,
      isCandidateWorking: cached.isCandidateWorking,
      reason: cached.reason,
      source: cached.source as WorkingDayResult["source"],
    };
  }

  const result = (await askAi(candidate)) || fallbackWorkingDay(candidate);

  await db.workingDayCache.upsert({
    where: { candidateDate: candidate },
    update: {},
    create: {
      candidateDate: candidate,
      workingDate: result.workingDate,
      isCandidateWorking: result.isCandidateWorking,
      reason: result.reason,
      source: result.source,
    },
  });

  return result;
}

export async function expectedPrintingDateFor(paymentDate: Date, db: Db = prisma) {
  const base = new Date(Date.UTC(paymentDate.getUTCFullYear(), paymentDate.getUTCMonth(), paymentDate.getUTCDate()));
  const result = await resolvePakistanWorkingDay(addDays(base, PRINTING_LEAD_DAYS), db);
  return result.workingDate;
}

// Recomputes Case.expectedPrintingDate from the earliest RECEIVED payment.
export async function refreshExpectedPrintingDate(caseId: string, db: Db = prisma) {
  const first = await db.payment.findFirst({
    where: { caseId, status: "RECEIVED" },
    orderBy: [{ paymentDate: "asc" }, { createdAt: "asc" }],
    select: { paymentDate: true },
  });

  const expected = first ? await expectedPrintingDateFor(first.paymentDate, db) : null;
  await db.case.update({ where: { id: caseId }, data: { expectedPrintingDate: expected } });
  return expected;
}

const CLOSED_STATUSES = ["COMPLETED", "DELIVERED", "CANCELLED"];

// After a manual override of a working-day row, open cases get fresh dates.
export async function refreshOpenCasesPrintingDates() {
  const cases = await prisma.case.findMany({
    where: { status: { notIn: CLOSED_STATUSES }, expectedPrintingDate: { not: null } },
    select: { id: true },
  });
  for (const item of cases) await refreshExpectedPrintingDate(item.id);
  return cases.length;
}
