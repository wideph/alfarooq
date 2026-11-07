import { prisma } from "@/lib/prisma";
import { todayPakistan } from "@/lib/office/serializers";
import { researchClosures, scopesOfRule } from "@/lib/office/ai-dates";
import { refreshOpenCasesPrintingDates } from "@/lib/office/working-day";
import {
  applyAttestationPlan,
  attestationKind,
  formatDmy,
  ruleForKind,
  type PlannedChange,
} from "@/lib/office/attestation-dates";

// §W60 — maujooda dates ki dobara jaanch:
//   • naya band din (admin table / AI) mile ya tarteeb toote → pending
//     attestation ki date aage, aur attestation department + admin ko remark;
//   • bina set ke case ki khali dates bhar di jati hain;
//   • expected printing dates naye calendar se.
// Chalta hai: admin ka "Sab dates check karein" button, holiday add / edit,
// working-day override, roz ka cron, aur har nayi date ke baad AI research.

export type DateActor = { adminId: string; role?: string | null };
export const SYSTEM_ACTOR: DateActor = { adminId: "system", role: "system" };

export type CaseDateFix = {
  caseId: string;
  caseNumber: string;
  moved: Array<{ name: string; from: string; to: string; why: string }>;
  filled: number;
};

// Pehle se lagi hui date badli ho (khali date bharna nahi) → remark.
export async function noteMovedDates(caseId: string, changes: PlannedChange[], actor: DateActor) {
  const moved = changes.filter((change) => change.from && change.from.getTime() !== change.to.getTime());
  if (moved.length === 0) return;
  const lines = moved.map((change) => `• ${change.name}: ${formatDmy(change.from!)} → ${formatDmy(change.to)} — ${change.why}`);
  await prisma.caseRemark.create({
    data: {
      caseId,
      text: `Attestation dates khud theek hui (chhutti / tarteeb):\n${lines.join("\n")}`.slice(0, 2000),
      createdById: actor.adminId,
      createdByRole: actor.role || "system",
      recipients: { create: [{ target: "ATTESTATION" }, { target: "ADMIN" }] },
    },
  });
}

/**
 * Case ki pending dates par AI research (background). Naya band din mila to
 * planner dates aage karta hai + remark. Kabhi throw nahi karta.
 */
export async function researchCaseDates(caseId: string, actor: DateActor = SYSTEM_ACTOR): Promise<number> {
  try {
    const rows = await prisma.caseAttestation.findMany({
      where: { caseId, status: { not: "DONE" }, scheduledDate: { not: null } },
      select: { scheduledDate: true, attestationType: { select: { name: true } } },
    });
    const targets = rows.map((row) => ({
      date: row.scheduledDate!,
      scopes: scopesOfRule(ruleForKind(attestationKind(row.attestationType.name))),
    }));
    const created = await researchClosures(targets);
    if (created > 0) {
      const changes = await applyAttestationPlan(caseId);
      await noteMovedDates(caseId, changes, actor);
    }
    return created;
  } catch (error) {
    console.error("[office] case date research fail", caseId, error);
    return 0;
  }
}

/** Plan + remark (pehle se lagi date badli ho to). Kabhi throw nahi karta. */
export async function planCaseDates(
  caseId: string,
  opts: { replanIds?: string[]; start?: Date } = {},
  actor: DateActor = SYSTEM_ACTOR
): Promise<PlannedChange[]> {
  try {
    const changes = await applyAttestationPlan(caseId, opts);
    const replanned = new Set(opts.replanIds ?? []);
    await noteMovedDates(
      caseId,
      changes.filter((change) => !replanned.has(change.id)),
      actor
    );
    return changes;
  } catch (error) {
    console.error("[office] attestation date plan fail", caseId, error);
    return [];
  }
}

/**
 * Tamam khule cases ki pending attestation dates dobara check (aur research=true
 * ho to pehle AI se aane wali dates ki research).
 */
export async function recheckOpenCaseDates(
  actor: DateActor,
  opts: { research?: boolean; caseIds?: string[] } = {}
): Promise<{ checked: number; fixes: CaseDateFix[]; newClosures: number; printingRefreshed: number }> {
  const cases = await prisma.case.findMany({
    where: {
      status: { not: "CANCELLED" },
      attestations: { some: { status: { not: "DONE" } } },
      ...(opts.caseIds ? { id: { in: opts.caseIds } } : {}),
    },
    select: { id: true, caseNumber: true },
  });

  let newClosures = 0;
  if (opts.research) {
    const rows = await prisma.caseAttestation.findMany({
      where: {
        caseId: { in: cases.map((item) => item.id) },
        status: { not: "DONE" },
        scheduledDate: { gte: todayPakistan() },
      },
      select: { scheduledDate: true, attestationType: { select: { name: true } } },
    });
    newClosures = await researchClosures(
      rows.map((row) => ({
        date: row.scheduledDate!,
        scopes: scopesOfRule(ruleForKind(attestationKind(row.attestationType.name))),
      })),
      { maxScans: 8 }
    );
  }

  const fixes: CaseDateFix[] = [];
  const CHUNK = 5;
  for (let i = 0; i < cases.length; i += CHUNK) {
    const results = await Promise.all(
      cases.slice(i, i + CHUNK).map(async (item) => {
        const changes = await planCaseDates(item.id, {}, actor);
        return { item, changes };
      })
    );
    for (const { item, changes } of results) {
      if (changes.length === 0) continue;
      fixes.push({
        caseId: item.id,
        caseNumber: item.caseNumber,
        moved: changes
          .filter((change) => change.from && change.from.getTime() !== change.to.getTime())
          .map((change) => ({ name: change.name, from: formatDmy(change.from!), to: formatDmy(change.to), why: change.why })),
        filled: changes.filter((change) => !change.from).length,
      });
    }
  }

  const printingRefreshed = await refreshOpenCasesPrintingDates();
  return { checked: cases.length, fixes, newClosures, printingRefreshed };
}
