import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";
import { toNumber } from "@/lib/office/money";
import { caseDeptCommissionCredits, type DeptCommissionKind } from "@/lib/office/dept-commission";
import { CASE_STATUS_ORDER } from "@/lib/office/workflow";

// §W56 — booking office ki EXTRA SERVICE (case banne ke baad). Ek booking mein
// kai hissay + ek amount (owner ka faisla):
//   reissue      — case dobara filing par (WAITING_FOR_FILE, filingRoundAt);
//                  filing ke liye remark LAZMI, nayi tasveer optional; dobara
//                  print → (service ki attestations ho to attestation) →
//                  courier (nayi slip).
//   attestations — chuni hui attestation types: case par pehle se hon to
//                  dobara PENDING, warna nayi; date AI working-day engine
//                  (selection ke baad pehla Pakistani working day). Case
//                  attestation stage se aage ho to wapas PRINTED (attestation
//                  queue).
//   musadiqa     — admin ko remark; Musadiqa queue (Applied → Attested).
//   custom       — admin ko remark; admin "<naam> Complete".
// Paisa: amount Case.agreedAmount mein judti hai (extraServicesAmount mein
// alag yaad) — remaining / extra / courier sab kul agreed par; commission
// office ki poori commission asal agreed par (commission.ts).
// Dobara kaam ka commission: jo department commission is case par pehle ban
// chuka aur ye service us kaam ko DOBARA karwati hai (reissue → printing +
// courier, attestations → attestation + courier) — us department ko dobara
// commission (deptCommissionRounds) aur wo case ka kharcha bhi
// (deptCommissionChargeFrom → CaseExpense kind DEPT_COMMISSION). Musadiqa /
// custom par koi commission nahi.

export type ServiceInput = {
  name?: string | null;
  amount: Prisma.Decimal;
  reissue: boolean;
  remarks?: string | null;
  attestationTypeIds: string[];
  musadiqa: boolean;
  customName?: string | null;
  image?: { key: string; type: string } | null;
};

export function jsonRecord(value: unknown): Record<string, number> {
  return value && typeof value === "object" && !Array.isArray(value) ? { ...(value as Record<string, number>) } : {};
}

export function serviceAttestationIds(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((id): id is string => typeof id === "string") : [];
}

// List / dropdown ke liye naam — booking office ne diya ho to wahi, warna hisson se.
export function autoServiceName(input: {
  reissue: boolean;
  attestationNames: string[];
  musadiqa: boolean;
  customName?: string | null;
}) {
  const parts: string[] = [];
  if (input.reissue) parts.push("Document reissue");
  if (input.attestationNames.length) parts.push(input.attestationNames.join(", "));
  if (input.musadiqa) parts.push("Musadiqa");
  if (input.customName) parts.push(input.customName);
  return parts.join(" + ") || "Extra service";
}

// Is kind ka kaam dobara: department commission ek aur dafa (rounds) aur wo
// case ka kharcha (chargeFrom). Sirf tab jab pehle ban chuka ho.
function bumpRecredit(
  kind: DeptCommissionKind,
  credits: Awaited<ReturnType<typeof caseDeptCommissionCredits>>,
  rounds: Record<string, number>,
  chargeFrom: Record<string, number>
) {
  const count = credits[kind]?.count ?? 0;
  if (count === 0) return false;
  rounds[kind] = Math.max(Number(rounds[kind]) || 1, count + 1);
  chargeFrom[kind] = Math.min(Number(chargeFrom[kind]) || Number.POSITIVE_INFINITY, count + 1);
  return true;
}

export class ServiceInputError extends Error {}

export async function bookCaseService(session: AdminSession, caseId: string, input: ServiceInput) {
  const hasPart = input.reissue || input.attestationTypeIds.length > 0 || input.musadiqa || Boolean(input.customName);
  if (!hasPart) throw new ServiceInputError("Kam az kam ek hissa chunein (reissue / attestation / musadiqa / custom)");
  if (input.reissue && !input.remarks) throw new ServiceInputError("Reissue par filing department ke liye remarks lazmi hain");

  return prisma.$transaction(async (tx) => {
    const item = await tx.case.findUnique({
      where: { id: caseId },
      select: {
        id: true,
        caseNumber: true,
        status: true,
        deptCommissionRounds: true,
        deptCommissionChargeFrom: true,
        attestations: { select: { id: true, attestationTypeId: true, order: true } },
      },
    });
    if (!item) throw new ServiceInputError("Case nahi mila");
    if (item.status === "CANCELLED") throw new ServiceInputError("Cancelled case par extra service nahi lag sakti");

    const types = input.attestationTypeIds.length
      ? await tx.attestationType.findMany({ where: { id: { in: input.attestationTypeIds } }, select: { id: true, name: true } })
      : [];
    if (types.length !== new Set(input.attestationTypeIds).size) throw new ServiceInputError("Koi attestation nahi mili");

    // Attestations: pehle se hon to dobara PENDING, warna nayi.
    const attestationIds: string[] = [];
    let nextOrder = Math.max(0, ...item.attestations.map((row) => row.order)) + 1;
    for (const type of types) {
      const existing = item.attestations.find((row) => row.attestationTypeId === type.id);
      if (existing) {
        await tx.caseAttestation.update({
          where: { id: existing.id },
          data: { status: "PENDING", completedDate: null, scheduledDate: null },
        });
        attestationIds.push(existing.id);
      } else {
        const created = await tx.caseAttestation.create({
          data: { caseId, attestationTypeId: type.id, order: nextOrder++ },
        });
        attestationIds.push(created.id);
      }
    }

    const name =
      (input.name || "").trim() ||
      autoServiceName({
        reissue: input.reissue,
        attestationNames: types.map((type) => type.name),
        musadiqa: input.musadiqa,
        customName: input.customName,
      });
    const service = await tx.caseService.create({
      data: {
        caseId,
        name: name.slice(0, 200),
        amount: input.amount,
        reissue: input.reissue,
        attestationIds: attestationIds.length ? attestationIds : Prisma.JsonNull,
        musadiqa: input.musadiqa,
        musadiqaStatus: input.musadiqa ? "APPLIED" : null,
        customName: input.customName || null,
        remarks: input.remarks || null,
        imageKey: input.image?.key ?? null,
        imageType: input.image?.type ?? null,
        createdById: session.adminId,
      },
    });

    // Status + dobara commission.
    const credits = await caseDeptCommissionCredits(caseId, tx);
    const rounds = jsonRecord(item.deptCommissionRounds);
    const chargeFrom = jsonRecord(item.deptCommissionChargeFrom);
    const recredit: DeptCommissionKind[] = [];
    const order = CASE_STATUS_ORDER[item.status] ?? 0;
    const caseData: Prisma.CaseUpdateInput = {
      agreedAmount: { increment: input.amount },
      extraServicesAmount: { increment: input.amount },
    };
    if (input.reissue && order > CASE_STATUS_ORDER.WAITING_FOR_FILE) {
      caseData.status = "WAITING_FOR_FILE";
      caseData.isPrinted = false;
      caseData.printedAt = null;
      caseData.currentAttestationId = null;
      caseData.filingRoundAt = new Date();
      for (const kind of ["PRINTING", "COURIER"] as const) {
        if (bumpRecredit(kind, credits, rounds, chargeFrom)) recredit.push(kind);
      }
    }
    if (attestationIds.length > 0) {
      if (!input.reissue && order >= CASE_STATUS_ORDER.ATTESTATION_COMPLETE) {
        caseData.status = "PRINTED";
        caseData.currentAttestationId = null;
      }
      for (const kind of ["ATTESTATION", "COURIER"] as const) {
        if (!recredit.includes(kind) && bumpRecredit(kind, credits, rounds, chargeFrom)) recredit.push(kind);
      }
    }
    if (recredit.length > 0) {
      caseData.deptCommissionRounds = rounds;
      caseData.deptCommissionChargeFrom = chargeFrom;
    }
    await tx.case.update({ where: { id: caseId }, data: caseData });

    // Remarks (Remarks tab + notification) — kis ko kya karna hai.
    const amountText = `Rs ${toNumber(input.amount).toLocaleString("en-PK")}`;
    const remark = (text: string, targets: string[]) =>
      tx.caseRemark.create({
        data: {
          caseId,
          text: text.slice(0, 2000),
          createdById: session.adminId,
          createdByRole: session.role || "unknown",
          recipients: { create: targets.map((target) => ({ target })) },
        },
      });
    if (input.reissue) {
      await remark(`Document reissue (extra service "${name}", ${amountText}): ${input.remarks}`, ["FILING", "ADMIN"]);
    }
    if (types.length) {
      await remark(
        `Extra service "${name}": attestations ${types.map((type) => type.name).join(", ")} ${input.reissue ? "(reissue print ke baad)" : "dobara / nayi"}`,
        ["ATTESTATION", "ADMIN"]
      );
    }
    if (input.musadiqa) await remark(`Is case ne Musadiqa apply kar diya hai (extra service "${name}", ${amountText})`, ["ADMIN"]);
    if (input.customName) {
      await remark(
        `Custom extra service: ${input.customName} (${amountText})${input.remarks && !input.reissue ? ` — ${input.remarks}` : ""}`,
        ["ADMIN"]
      );
    }

    return {
      service,
      caseNumber: item.caseNumber,
      fromStatus: item.status,
      toStatus: (caseData.status as string | undefined) ?? item.status,
      attestationIds,
      attestationNames: types.map((type) => type.name),
      recredit,
    };
  }, { maxWait: 10000, timeout: 30000 });
}

// Admin: musadiqa attested / custom complete / service cancel.
export async function updateCaseService(
  caseId: string,
  serviceId: string,
  action: "musadiqa-attested" | "custom-done" | "cancel"
) {
  return prisma.$transaction(async (tx) => {
    const service = await tx.caseService.findFirst({ where: { id: serviceId, caseId } });
    if (!service) throw new ServiceInputError("Extra service nahi mili");
    if (service.status === "CANCELLED") throw new ServiceInputError("Ye service cancel ho chuki");
    if (action === "musadiqa-attested") {
      if (!service.musadiqa) throw new ServiceInputError("Is service mein musadiqa nahi");
      return tx.caseService.update({
        where: { id: serviceId },
        data: { musadiqaStatus: "ATTESTED", musadiqaDoneAt: new Date() },
      });
    }
    if (action === "custom-done") {
      if (!service.customName) throw new ServiceInputError("Is service mein custom hissa nahi");
      return tx.caseService.update({ where: { id: serviceId }, data: { customDoneAt: new Date() } });
    }
    // cancel — amount wapas (agreed se minus); kaam / attestations jaise hain.
    await tx.case.update({
      where: { id: caseId },
      data: {
        agreedAmount: { decrement: service.amount },
        extraServicesAmount: { decrement: service.amount },
      },
    });
    return tx.caseService.update({ where: { id: serviceId }, data: { status: "CANCELLED" } });
  }, { maxWait: 10000, timeout: 30000 });
}

// Detail / list payload: har hisse ki halat.
export function serializeService(
  service: {
    id: string;
    name: string;
    amount: Prisma.Decimal;
    reissue: boolean;
    reissueDoneAt: Date | null;
    attestationIds: Prisma.JsonValue;
    musadiqa: boolean;
    musadiqaStatus: string | null;
    customName: string | null;
    customDoneAt: Date | null;
    remarks: string | null;
    imageKey: string | null;
    status: string;
    createdAt: Date;
    createdById: string;
  },
  attestations: Array<{ id: string; status: string; attestationType: { name: string } }>
) {
  const ids = serviceAttestationIds(service.attestationIds);
  const rows = attestations.filter((row) => ids.includes(row.id));
  const parts: Array<{ key: string; label: string; done: boolean }> = [];
  if (service.reissue) parts.push({ key: "reissue", label: "Document reissue", done: Boolean(service.reissueDoneAt) });
  for (const row of rows) parts.push({ key: `attestation:${row.id}`, label: row.attestationType.name, done: row.status === "DONE" });
  if (service.musadiqa) parts.push({ key: "musadiqa", label: "Musadiqa", done: service.musadiqaStatus === "ATTESTED" });
  if (service.customName) parts.push({ key: "custom", label: service.customName, done: Boolean(service.customDoneAt) });
  return {
    id: service.id,
    name: service.name,
    amount: toNumber(service.amount),
    status: service.status,
    remarks: service.remarks,
    hasImage: Boolean(service.imageKey),
    musadiqa: service.musadiqa,
    musadiqaStatus: service.musadiqaStatus,
    customName: service.customName,
    customDone: Boolean(service.customDoneAt),
    parts,
    done: service.status === "ACTIVE" && parts.length > 0 && parts.every((part) => part.done),
    createdAt: service.createdAt,
    createdById: service.createdById,
  };
}
