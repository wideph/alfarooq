import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { notifyAdmins, notifyRole } from "@/lib/office/notifications";
import { ATTESTATION_STATUSES, type AttestationStatus } from "@/lib/office/permissions";
import { cleanText, parseDateOnly } from "@/lib/office/serializers";
import { evaluateCaseCompletion } from "@/lib/office/workflow";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// POST: booking office adds a required attestation to the case.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id, { attestations: true });
    if (!item) return notFound("Case nahi mila");
    const body = await request.json();
    const attestationTypeId = typeof body.attestationTypeId === "string" ? body.attestationTypeId : "";
    const type = await prisma.attestationType.findUnique({ where: { id: attestationTypeId } });
    if (!type) return badRequest("Attestation type nahi mila");
    if (item.attestations.some((a) => a.attestationTypeId === attestationTypeId)) {
      return badRequest("Ye attestation pehle se add hai");
    }
    const order = item.attestations.length + 1;
    const row = await prisma.caseAttestation.create({
      data: { caseId: id, attestationTypeId, order, scheduledDate: parseDateOnly(body.scheduledDate) },
    });
    // W13.2: audit log response ke baad.
    after(async () => {
      await logOfficeAction(session, { action: "case.attestation.add", entity: "Case", entityId: id, after: row });
    });
    return NextResponse.json(await loadCaseDetail(session, id), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

const ATTESTATION_ORDER: Record<string, number> = { PENDING: 0, IN_PROGRESS: 1, DONE: 2 };

// PATCH: attestation office (office:attestation:write) updates status / dates /
// notes (R1.2). The atta department (office:atta:write) may only move a step
// forward PENDING → IN_PROGRESS → DONE (with completedDate). Case auto-moves:
// any IN_PROGRESS → ATTESTATION (+currentAttestationId); all set steps DONE +
// FINAL atta file → ATTESTATION_COMPLETE (see evaluateCaseCompletion, §W11.1).
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  const fullAccess = hasPermission(session, "office:attestation:write");
  const attaOnly = !fullAccess && hasPermission(session, "office:atta:write");
  if (!fullAccess && !attaOnly) return forbidden();

  try {
    const item = await findAccessibleCase(session, id, { attestations: true });
    if (!item) return notFound("Case nahi mila");
    const body = await request.json();
    const attestationId = typeof body.id === "string" ? body.id : "";
    const existing = item.attestations.find((a) => a.id === attestationId);
    if (!existing) return notFound("Attestation nahi mili");

    const data: {
      status?: string;
      scheduledDate?: Date | null;
      completedDate?: Date | null;
      notes?: string | null;
    } = {};

    if (attaOnly) {
      // Atta department: status-only, strictly forward.
      if (body.scheduledDate !== undefined || body.notes !== undefined) {
        return forbidden("Atta department sirf step status badal sakta hai");
      }
      if (body.status === undefined) return badRequest("Status zaroori hai");
      if (!ATTESTATION_STATUSES.includes(body.status as AttestationStatus)) {
        return badRequest("Status sahi nahi hai");
      }
      const currentOrder = ATTESTATION_ORDER[existing.status] ?? 0;
      const nextOrder = ATTESTATION_ORDER[body.status as string] ?? -1;
      if (nextOrder <= currentOrder) {
        return badRequest("Step sirf aage barh sakta hai (PENDING → IN_PROGRESS → DONE)");
      }
      data.status = body.status;
      data.completedDate =
        body.status === "DONE"
          ? parseDateOnly(body.completedDate) ||
            new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()))
          : null;
    } else {
      if (body.status !== undefined) {
        if (!ATTESTATION_STATUSES.includes(body.status as AttestationStatus)) return badRequest("Status sahi nahi hai");
        data.status = body.status;
        if (body.status === "DONE" && body.completedDate === undefined && !existing.completedDate) {
          data.completedDate = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
        }
        if (body.status !== "DONE") data.completedDate = null;
      }
      if (body.scheduledDate !== undefined) data.scheduledDate = body.scheduledDate ? parseDateOnly(body.scheduledDate) : null;
      if (body.completedDate !== undefined) data.completedDate = body.completedDate ? parseDateOnly(body.completedDate) : null;
      if (body.notes !== undefined) data.notes = cleanText(body.notes, 500);
    }

    if (Object.keys(data).length === 0) return badRequest("Kuch change nahi kiya");

    await prisma.caseAttestation.update({ where: { id: attestationId }, data });

    // §W11.1: IN_PROGRESS → case ATTESTATION + currentAttestationId = ye step;
    // DONE (agar current tha) → pointer agle PENDING step par; phir
    // evaluateCaseCompletion (sab DONE + FINAL atta file → ATTESTATION_COMPLETE).
    let nextStatus = item.status;
    if (data.status === "IN_PROGRESS") {
      if (
        [
          "FIRST_PAYMENT_PENDING",
          "WAITING_FOR_FILE",
          "WAITING_FOR_PRINTING",
          "PRINTED",
          "ATTESTATION",
        ].includes(item.status)
      ) {
        nextStatus = "ATTESTATION";
        await prisma.case.update({
          where: { id },
          data: { status: "ATTESTATION", currentAttestationId: attestationId },
        });
      }
    } else if (data.status === "DONE" && item.currentAttestationId === attestationId) {
      const next = await prisma.caseAttestation.findFirst({
        where: { caseId: id, status: "PENDING" },
        orderBy: { order: "asc" },
        select: { id: true },
      });
      await prisma.case.update({
        where: { id },
        data: { currentAttestationId: next?.id ?? null },
      });
    }

    const completed = await evaluateCaseCompletion(id);
    if (completed) nextStatus = "ATTESTATION_COMPLETE";

    // W13.2: audit log + notifications response ke baad (status side effects
    // aur evaluateCaseCompletion request path mein hi rehte hain).
    after(async () => {
      // §W11.8: attestation DONE → atta department + admins.
      if (data.status === "DONE") {
        const link = `/office/cases/${id}`;
        const title = `Case ${item.caseNumber}: attestation done`;
        await notifyRole("atta", { type: "attestation", title, link });
        await notifyAdmins({ type: "attestation", title, link });
      }

      await logOfficeAction(session, {
        action: "case.attestation.update",
        entity: "Case",
        entityId: id,
        before: existing,
        after: { ...data, caseStatus: nextStatus },
      });
    });
    return NextResponse.json(await loadCaseDetail(session, id));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  const { id } = await params;
  const item = await findAccessibleCase(session, id);
  if (!item) return notFound("Case nahi mila");
  const attestationId = new URL(request.url).searchParams.get("attestationId") || "";
  const row = await prisma.caseAttestation.findFirst({ where: { id: attestationId, caseId: id } });
  if (!row) return notFound("Attestation nahi mili");
  if (row.status !== "PENDING") return badRequest("Sirf pending attestation remove ho sakti hai");
  await prisma.caseAttestation.delete({ where: { id: attestationId } });
  // W13.2: audit log response ke baad.
  after(async () => {
    await logOfficeAction(session, { action: "case.attestation.remove", entity: "Case", entityId: id, before: row });
  });
  return NextResponse.json(await loadCaseDetail(session, id));
}
