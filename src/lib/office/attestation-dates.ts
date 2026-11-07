import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { addDays, formatDateOnly, todayPakistan } from "@/lib/office/serializers";
import { toHijri } from "@/lib/office/hijri";
import { DayResolver, MOFA_CITY_PRIORITY, type DayRule } from "@/lib/office/day-rules";

// §W60 — attestation dates ka PLANNER + tarteeb ka pakka qaida (owner):
//   Board  <  UV ibcc / QR code ibcc  <  Special Mofa  <  Saudi Embassy  <  Mofa Saudi
// (har agla qadam pichle se kam az kam ek din BAAD; ek hi din bhi nahi). Back /
// Current Navttc UV / QR ki jagah, bmfq / CPLS / APAC Board ki jagah, MoH /
// Navttc ibcc ki jagah (set formulas mein yahi tarteeb hai).
// Har attestation ka apna mulk / sheher / din (DayRule): Board → Pakistan +
// Quetta, ibcc → Pakistan + Islamabad, Special Mofa → Pakistan + Islamabad /
// Gujrat / Lahore mein se koi khula, Saudi Embassy → Islamabad + embassies band
// na hon + Tue–Fri, Mofa Saudi → SAUDI ARABIA ka working day + Mon–Wed.
//
// Planner (computeAttestationPlan) case ki tamam attestations dekhta hai:
//   • jo nayi chuni gayi (replanIds) ya jin ki date hi nahi → kal (ya pichle
//     qadam ke baad) se pehla khula din;
//   • jin ki date hai magar chhutti par ya tarteeb ke khilaf → aage pehla sahi din;
//   • baqi wahi rehti hain. DONE attestations kabhi nahi badalti.
// Set wale case mein set ke steps ki dates set engine banata hai (payment ke
// baad) — planner un ki khali date nahi bharta, sirf ghalat date theek karta hai.

type Db = Prisma.TransactionClient | typeof prisma;

export type AttestationKind =
  | "BOARD"
  | "BMFQ_VERIFICATION"
  | "CPLS_ATTESTATION"
  | "APAC_ATTESTATION"
  | "UV_IBCC"
  | "QR_IBCC"
  | "IBCC"
  | "HEC"
  | "BACK_NAVTTC"
  | "CURRENT_NAVTTC"
  | "NAVTTC"
  | "MOH_ATTESTATION"
  | "SPECIAL_MOFA"
  | "SAUDI_EMBASSY"
  | "EMBASSY"
  | "MOFA_SAUDI";

const PK_QUETTA: DayRule = { country: "PK", city: "QUETTA" };
const PK_ISLAMABAD: DayRule = { country: "PK", city: "ISLAMABAD" };

export const KIND_INFO: Record<AttestationKind, { tier: number; rule: DayRule }> = {
  BOARD: { tier: 1, rule: PK_QUETTA },
  BMFQ_VERIFICATION: { tier: 1, rule: PK_QUETTA },
  CPLS_ATTESTATION: { tier: 1, rule: PK_ISLAMABAD },
  APAC_ATTESTATION: { tier: 1, rule: PK_ISLAMABAD },
  UV_IBCC: { tier: 2, rule: PK_ISLAMABAD },
  QR_IBCC: { tier: 2, rule: PK_ISLAMABAD },
  IBCC: { tier: 2, rule: PK_ISLAMABAD },
  HEC: { tier: 2, rule: PK_ISLAMABAD },
  BACK_NAVTTC: { tier: 2, rule: PK_ISLAMABAD },
  CURRENT_NAVTTC: { tier: 2, rule: PK_ISLAMABAD },
  NAVTTC: { tier: 2, rule: PK_ISLAMABAD },
  MOH_ATTESTATION: { tier: 2, rule: PK_ISLAMABAD },
  SPECIAL_MOFA: { tier: 3, rule: { country: "PK", anyCity: MOFA_CITY_PRIORITY } },
  SAUDI_EMBASSY: {
    tier: 4,
    rule: { country: "PK", city: "ISLAMABAD", extraScopes: ["EMBASSIES_ISB"], allowedWeekdays: [2, 3, 4, 5] },
  },
  EMBASSY: { tier: 4, rule: { country: "PK", city: "ISLAMABAD", extraScopes: ["EMBASSIES_ISB"] } },
  MOFA_SAUDI: { tier: 5, rule: { country: "SA", allowedWeekdays: [1, 2, 3] } },
};

export const TIER_LABELS: Record<number, string> = {
  1: "Board",
  2: "UV / QR ibcc",
  3: "Special Mofa",
  4: "Saudi Embassy",
  5: "Mofa Saudi",
};

export const ORDER_RULE_TEXT = "Board → UV / QR ibcc → Special Mofa → Saudi Embassy → Mofa Saudi (har agla pichle ke BAAD)";

/** Attestation type ke naam (ya set ke stepKey) se us ki qisam. Pehchan na ho to null. */
export function attestationKind(name: string, stepKey?: string | null): AttestationKind | null {
  const key = stepKey === "MOFA_SAUD" ? "MOFA_SAUDI" : stepKey;
  if (key && key in KIND_INFO) return key as AttestationKind;
  const n = name.trim().toLowerCase();
  if (/mofa/.test(n) && /saud/.test(n)) return "MOFA_SAUDI";
  if (/embassy/.test(n)) return /saud/.test(n) ? "SAUDI_EMBASSY" : "EMBASSY";
  if (/mofa/.test(n)) return "SPECIAL_MOFA";
  if (/\buv\b/.test(n)) return "UV_IBCC";
  if (/\bqr\b/.test(n)) return "QR_IBCC";
  if (/navttc/.test(n)) return /back/.test(n) ? "BACK_NAVTTC" : /current/.test(n) ? "CURRENT_NAVTTC" : "NAVTTC";
  if (/ibcc/.test(n)) return "IBCC";
  if (/\bhec\b/.test(n)) return "HEC";
  if (/\bmoh\b/.test(n)) return "MOH_ATTESTATION";
  if (/bmfq/.test(n)) return "BMFQ_VERIFICATION";
  if (/cpls/.test(n)) return "CPLS_ATTESTATION";
  if (/apac/.test(n)) return "APAC_ATTESTATION";
  if (/board/.test(n)) return "BOARD";
  return null;
}

export function ruleForKind(kind: AttestationKind | null): DayRule {
  return kind ? KIND_INFO[kind].rule : { country: "PK" };
}

function maxDate(...dates: Array<Date | null | undefined>): Date | null {
  let best: Date | null = null;
  for (const date of dates) if (date && (!best || date > best)) best = date;
  return best;
}

export function formatDmy(date: Date) {
  const iso = formatDateOnly(date);
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(0, 4)}`;
}

function formatDdMmYy(date: Date) {
  const iso = formatDateOnly(date);
  return `${iso.slice(8, 10)}-${iso.slice(5, 7)}-${iso.slice(2, 4)}`;
}

// Date badle to step ke saath likhi maloomat bhi (city / hijri / dd-mm-yy).
function notesFor(kind: AttestationKind | null, date: Date, city: string | null, previous: string | null): string | null {
  if (kind === "SPECIAL_MOFA") return `City: ${city ?? MOFA_CITY_PRIORITY[0]}`;
  if (kind === "SAUDI_EMBASSY") return `Hijri: ${toHijri(date).formatted}`;
  if (kind === "MOFA_SAUDI") return formatDdMmYy(date);
  return previous;
}

type Row = {
  id: string;
  name: string;
  kind: AttestationKind | null;
  tier: number | null;
  order: number;
  status: string;
  scheduledDate: Date | null;
  notes: string | null;
  setOwned: boolean;
};

export type PlannedChange = {
  id: string;
  name: string;
  from: Date | null;
  to: Date;
  notes: string | null;
  why: string;
};

async function loadRows(db: Db, caseId: string): Promise<Row[] | null> {
  const item = await db.case.findUnique({
    where: { id: caseId },
    select: {
      status: true,
      set: { select: { steps: { select: { stepKey: true, label: true } } } },
      attestations: {
        select: {
          id: true,
          order: true,
          status: true,
          scheduledDate: true,
          notes: true,
          attestationType: { select: { name: true } },
        },
      },
    },
  });
  if (!item) return null;
  const steps = item.set?.steps ?? [];
  return item.attestations.map((row) => {
    const name = row.attestationType.name;
    const step = steps.find((s) => s.label.trim().toLowerCase() === name.trim().toLowerCase());
    const kind = attestationKind(name, step?.stepKey);
    return {
      id: row.id,
      name,
      kind,
      tier: kind ? KIND_INFO[kind].tier : null,
      order: row.order,
      status: row.status,
      scheduledDate: row.scheduledDate,
      notes: row.notes,
      setOwned: Boolean(step),
    };
  });
}

/**
 * Case ki attestations ke liye kaun si date kahan jani chahiye (likhta nahi).
 * replanIds: abhi chuni / dobara khuli attestations — inhe nayi date milti hai.
 * start: nayi date is din se pehle nahi (default: kal, Pakistan waqt).
 */
export async function computeAttestationPlan(
  caseId: string,
  opts: { replanIds?: string[]; start?: Date; resolver?: DayResolver } = {},
  db: Db = prisma
): Promise<PlannedChange[]> {
  const rows = await loadRows(db, caseId);
  if (!rows) return [];
  const resolver = opts.resolver ?? new DayResolver(db);
  const replan = new Set(opts.replanIds ?? []);
  const start = opts.start ?? addDays(todayPakistan(), 1);
  const changes: PlannedChange[] = [];
  const finalDate = new Map<string, Date | null>(rows.map((row) => [row.id, row.scheduledDate]));

  const place = async (row: Row, prev: { date: Date; name: string } | null) => {
    const rule = ruleForKind(row.kind);
    const afterPrev = prev ? addDays(prev.date, 1) : null;
    const current = row.scheduledDate;
    const needs = replan.has(row.id) || (!current && !row.setOwned);
    if (!needs && !current) return; // set ka step — set engine payment ke baad bharega
    let floor: Date;
    let why: string;
    if (needs) {
      floor = maxDate(start, afterPrev)!;
      why = current ? "Dobara chuni gayi — nayi date" : "Nayi attestation — date lagi";
    } else {
      const verdict = await resolver.verdict(current!, rule);
      const orderOk = !afterPrev || current! >= afterPrev;
      if (verdict.open && orderOk) {
        // Date theek, magar likhi hui city us din band → pehli khuli city.
        const written = /^City:\s*([A-Z]+)/.exec(row.notes || "")?.[1];
        if (row.kind === "SPECIAL_MOFA" && written && verdict.city && written !== verdict.city) {
          const writtenOpen = await resolver.verdict(current!, { country: "PK", city: written as typeof MOFA_CITY_PRIORITY[number] });
          if (!writtenOpen.open) {
            changes.push({ id: row.id, name: row.name, from: current, to: current!, notes: `City: ${verdict.city}`, why: `${written} band — nayi city` });
          }
        }
        return;
      }
      floor = maxDate(current, afterPrev)!;
      why = !verdict.open
        ? `${formatDmy(current!)} ko band: ${verdict.reason}`
        : `Tarteeb: ${prev!.name} (${formatDmy(prev!.date)}) ke BAAD honi chahiye`;
    }
    const picked = await resolver.firstOpen(floor, rule);
    finalDate.set(row.id, picked.date);
    if (!current || picked.date.getTime() !== current.getTime()) {
      changes.push({
        id: row.id,
        name: row.name,
        from: current,
        to: picked.date,
        notes: notesFor(row.kind, picked.date, picked.city, row.notes),
        why,
      });
    }
  };

  const sorted = [...rows].sort((a, b) => a.order - b.order);
  let prev: { date: Date; name: string } | null = null;
  for (let tier = 1; tier <= 5; tier += 1) {
    const tierRows = sorted.filter((row) => row.tier === tier);
    for (const row of tierRows) if (row.status !== "DONE") await place(row, prev);
    // Agle qadam ke liye: ab tak ki sab se aakhri date (DONE ki bhi).
    for (const row of tierRows) {
      const date = finalDate.get(row.id);
      if (date && (!prev || date > prev.date)) prev = { date, name: row.name };
    }
  }
  for (const row of sorted) {
    if (row.tier === null && row.status !== "DONE") await place(row, null);
  }
  return changes;
}

/** Plan likho (ek case ek waqt mein — advisory lock). Badli hui rows wapas. */
export async function applyAttestationPlan(
  caseId: string,
  opts: { replanIds?: string[]; start?: Date } = {}
): Promise<PlannedChange[]> {
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`attestation-plan:${caseId}`}))`;
      const changes = await computeAttestationPlan(caseId, opts, tx);
      for (const change of changes) {
        await tx.caseAttestation.update({
          where: { id: change.id },
          data: { scheduledDate: change.to, notes: change.notes },
        });
      }
      return changes;
    },
    { maxWait: 10000, timeout: 30000 }
  );
}

/** Kabhi throw nahi karta (date lagna case ke kaam ko rok na de). */
export async function safeApplyAttestationPlan(caseId: string, opts: { replanIds?: string[]; start?: Date } = {}) {
  try {
    return await applyAttestationPlan(caseId, opts);
  } catch (error) {
    console.error("[office] attestation date plan fail", caseId, error);
    return [];
  }
}

/**
 * Admin ki haath se di gayi scheduled date: chhutti / ghalat din ya pichle
 * qadam se pehle → error (Roman Urdu). Aage wale qadam baad mein planner
 * khud aage kar deta hai (applyAttestationPlan).
 */
export async function manualDateError(caseId: string, attestationId: string, date: Date, db: Db = prisma): Promise<string | null> {
  const rows = await loadRows(db, caseId);
  const row = rows?.find((item) => item.id === attestationId);
  if (!rows || !row) return null;
  const verdict = await new DayResolver(db).verdict(date, ruleForKind(row.kind));
  if (!verdict.open) return `${formatDmy(date)} ko ${row.name} ki date nahi lag sakti — ${verdict.reason}`;
  if (row.tier === null) return null;
  for (const other of rows) {
    if (other.id === row.id || other.tier === null || !other.scheduledDate) continue;
    if (other.tier < row.tier && other.scheduledDate >= date) {
      return `${row.name} ki date ${other.name} (${formatDmy(other.scheduledDate)}) ke BAAD honi chahiye — tarteeb: ${ORDER_RULE_TEXT}`;
    }
    if (other.tier > row.tier && other.status === "DONE" && other.scheduledDate <= date) {
      return `${row.name} ki date ${other.name} (${formatDmy(other.scheduledDate)}, done) se PEHLE honi chahiye — tarteeb: ${ORDER_RULE_TEXT}`;
    }
  }
  return null;
}

/** Tarteeb / chhutti ki khilaf warzi (audit + tests ke liye) — har case ki list. */
export async function attestationDateProblems(caseId: string, db: Db = prisma, resolver?: DayResolver): Promise<string[]> {
  const rows = await loadRows(db, caseId);
  if (!rows) return [];
  const days = resolver ?? new DayResolver(db);
  const problems: string[] = [];
  for (const row of rows) {
    if (row.status === "DONE" || !row.scheduledDate) continue;
    const verdict = await days.verdict(row.scheduledDate, ruleForKind(row.kind));
    if (!verdict.open) problems.push(`${row.name} ${formatDmy(row.scheduledDate)} band: ${verdict.reason}`);
    if (row.tier === null) continue;
    for (const other of rows) {
      if (other.tier === null || !other.scheduledDate || other.tier >= row.tier) continue;
      if (other.scheduledDate >= row.scheduledDate) {
        problems.push(`${row.name} ${formatDmy(row.scheduledDate)} ≤ ${other.name} ${formatDmy(other.scheduledDate)} (tarteeb)`);
      }
    }
  }
  return problems;
}
