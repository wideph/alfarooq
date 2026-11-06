import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminSession } from "@/lib/auth";
import { toNumber } from "@/lib/office/money";
import { caseDeptCommissionCredits, type DeptCommissionKind } from "@/lib/office/dept-commission";
import { CASE_STATUS_ORDER, type RemarkTarget } from "@/lib/office/workflow";

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
  // §W59: "Attestation (A, B)" — pehle "Document reissue + A, B" mein + aur , mil jate thay.
  if (input.attestationNames.length) parts.push(`Attestation (${input.attestationNames.join(", ")})`);
  if (input.musadiqa) parts.push("Musadiqa");
  if (input.customName) parts.push(input.customName);
  return parts.join(" + ") || "Extra service";
}

// §W59 — extra service ka EK auto remark (pehle do alag, service ka naam aur
// attestation list dohraye jate thay — "(reissue print ke baad)" / "dobara /
// nayi" samajh nahi aata tha). Ab har department ki apni line, kaam ki
// tarteeb se, aur har attestation ke saath (dobara / nayi). Jis department ka
// kaam hai wahi target. Department walon ko paisa nahi dikhta (§N7) — raqam
// sirf tab jab remark sirf admin ke liye ho (musadiqa / custom).
export type ServiceRemarkAttestation = { name: string; kind: "redo" | "pending" | "new" };
const ATTESTATION_KIND_LABEL: Record<ServiceRemarkAttestation["kind"], string> = {
  redo: "dobara",
  pending: "pehle se baqi",
  new: "nayi",
};

export function serviceRemark(input: {
  // Booking office ka apna diya naam (auto naam nahi — wo hisson ko dohrata hai).
  label?: string | null;
  amountText: string;
  // Service se pehle case ka status.
  fromStatus: string;
  reissue: boolean;
  remarks?: string | null;
  hasImage: boolean;
  attestations: ServiceRemarkAttestation[];
  musadiqa: boolean;
  customName?: string | null;
}): { text: string; targets: RemarkTarget[] } {
  const order = CASE_STATUS_ORDER[input.fromStatus] ?? 0;
  const steps: string[] = [];
  const targets = new Set<RemarkTarget>(["ADMIN"]);

  if (input.reissue) {
    const filed = order > CASE_STATUS_ORDER.WAITING_FOR_FILE;
    steps.push(
      `Filing: ${filed ? "document dobara banana hai" : "file banate waqt dhyan dein"} — hidayat: ${input.remarks || "—"}` +
        (input.hasImage ? " — nayi tasveer bhi lagi hai (case mein \"Document reissue\" box)." : "")
    );
    targets.add("FILING");
    if (order >= CASE_STATUS_ORDER.PRINTED) {
      steps.push("Printing: nayi file aane par dobara print karein.");
      targets.add("PRINTING");
    } else if (filed) {
      steps.push("Printing: purani file print na karein — nayi file aane par print karein.");
      targets.add("PRINTING");
    }
  }
  if (input.attestations.length) {
    const list = input.attestations.map((row) => `${row.name} (${ATTESTATION_KIND_LABEL[row.kind]})`).join(", ");
    const backToQueue = !input.reissue && order >= CASE_STATUS_ORDER.ATTESTATION_COMPLETE;
    steps.push(
      `Attestation${input.reissue ? " (dobara print ke baad)" : ""}: ${list}.` +
        (backToQueue ? " Case wapas attestation queue mein aa gaya hai." : "")
    );
    targets.add("ATTESTATION");
  }
  if (steps.length && order >= CASE_STATUS_ORDER.DELIVERED) {
    steps.push("Courier: case pehle bheja ja chuka hai — ye kaam poora hone par dobara bhejna hai (nayi slip).");
    targets.add("COURIER");
  }

  const adminLines: string[] = [];
  if (input.musadiqa) adminLines.push("Admin: Musadiqa apply ho gaya — Musadiqa queue se \"Attested\" karein.");
  if (input.customName) {
    const note = input.remarks && !input.reissue ? ` Note: ${input.remarks}` : "";
    adminLines.push(`Admin: ${input.customName} — kaam poora hone par "Complete" karein.${note}`);
  }

  const adminOnly = targets.size === 1;
  const head = `Extra service${input.label ? ` "${input.label}"` : ""}${adminOnly ? ` (${input.amountText})` : ""}`;
  const lines =
    steps.length > 1
      ? [`${head} — kaam isi tarteeb se:`, ...steps.map((step, index) => `${index + 1}. ${step}`), ...adminLines]
      : steps.length === 1
        ? [`${head} — ${steps[0]}`, ...adminLines]
        : adminLines.length === 1
          ? [`${head} — ${adminLines[0]}`]
          : [`${head}:`, ...adminLines];
  return { text: lines.join("\n"), targets: [...targets] };
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
        attestations: { select: { id: true, attestationTypeId: true, order: true, status: true } },
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
    const remarkAttestations: ServiceRemarkAttestation[] = [];
    let nextOrder = Math.max(0, ...item.attestations.map((row) => row.order)) + 1;
    for (const type of types) {
      const existing = item.attestations.find((row) => row.attestationTypeId === type.id);
      if (existing) {
        await tx.caseAttestation.update({
          where: { id: existing.id },
          data: { status: "PENDING", completedDate: null, scheduledDate: null },
        });
        attestationIds.push(existing.id);
        remarkAttestations.push({ name: type.name, kind: existing.status === "DONE" ? "redo" : "pending" });
      } else {
        const created = await tx.caseAttestation.create({
          data: { caseId, attestationTypeId: type.id, order: nextOrder++ },
        });
        attestationIds.push(created.id);
        remarkAttestations.push({ name: type.name, kind: "new" });
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

    // §W59: EK remark (Remarks tab + warning) — har department ka kaam tarteeb se.
    const remark = serviceRemark({
      label: (input.name || "").trim() || null,
      amountText: `Rs ${toNumber(input.amount).toLocaleString("en-PK")}`,
      fromStatus: item.status,
      reissue: input.reissue,
      remarks: input.remarks,
      hasImage: Boolean(input.image),
      attestations: remarkAttestations,
      musadiqa: input.musadiqa,
      customName: input.customName,
    });
    await tx.caseRemark.create({
      data: {
        caseId,
        text: remark.text.slice(0, 2000),
        createdById: session.adminId,
        createdByRole: session.role || "unknown",
        recipients: { create: remark.targets.map((target) => ({ target })) },
      },
    });

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
