import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays } from "@/lib/office/serializers";
import { DayResolver, PAKISTAN_RULE } from "@/lib/office/day-rules";

// docs/office-module/03_BUSINESS_RULES.md BR7.
// Expected printing date = first Pakistan working day on/after payment date + 6.
// §W60: din ka faisla day-rules.ts (weekend + admin table + built-in
// chhuttiyan + AI ke dhoonde band din; admin ka MANUAL override). Pehle yahan
// AI se 8 second mein jawab manga jata tha — reasoning model aksar time out,
// phir weekend-only andaza "FALLBACK" ban kar hamesha ke liye cache ho jata
// tha (aur set / bina set dates bhi usi cache par bharosa karti thin). Ab koi
// andaza cache nahi hota.

export const PRINTING_LEAD_DAYS = 6;

type Db = Prisma.TransactionClient | typeof prisma;

export type WorkingDayResult = {
  candidateDate: Date;
  workingDate: Date;
  isCandidateWorking: boolean;
  reason: string | null;
  // MANUAL = admin override; CALENDAR = built-in calendar + tables.
  source: "MANUAL" | "CALENDAR";
};

export async function resolvePakistanWorkingDay(candidateInput: Date, db: Db = prisma): Promise<WorkingDayResult> {
  const candidate = new Date(
    Date.UTC(candidateInput.getUTCFullYear(), candidateInput.getUTCMonth(), candidateInput.getUTCDate())
  );
  // Admin ka override (candidate → working date) hamesha jeet ta hai.
  const manual = await db.workingDayCache.findUnique({ where: { candidateDate: candidate } });
  if (manual && manual.source === "MANUAL") {
    return {
      candidateDate: manual.candidateDate,
      workingDate: manual.workingDate,
      isCandidateWorking: manual.isCandidateWorking,
      reason: manual.reason,
      source: "MANUAL",
    };
  }
  const picked = await new DayResolver(db).firstOpen(candidate, PAKISTAN_RULE);
  const isCandidateWorking = picked.date.getTime() === candidate.getTime();
  return {
    candidateDate: candidate,
    workingDate: picked.date,
    isCandidateWorking,
    reason: isCandidateWorking ? null : picked.skipped.map((line) => line.replace(/^\d{4}-\d{2}-\d{2}: /, "")).join(", ") || null,
    source: "CALENDAR",
  };
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
  // §W20: har case ka refresh independent hai — parallel (pehle N sequential
  // round-trips). §W20-R5 (review #5): unbounded fan-out pool/AI burst na kare,
  // is liye 8-8 ke chunks mein.
  const CHUNK = 8;
  for (let i = 0; i < cases.length; i += CHUNK) {
    await Promise.all(cases.slice(i, i + CHUNK).map((item) => refreshExpectedPrintingDate(item.id)));
  }
  return cases.length;
}
