import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { loadCaseDetail } from "@/lib/office/case-detail";
import { ATTESTATION_STATUSES, type AttestationStatus } from "@/lib/office/permissions";
import { cleanText, parseDateOnly } from "@/lib/office/serializers";

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
    await logOfficeAction(session, { action: "case.attestation.add", entity: "Case", entityId: id, after: row });
    return NextResponse.json(await loadCaseDetail(session, id), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

// PATCH: attestation office updates status / dates (R1.2). Auto-moves the case
// forward: any IN_PROGRESS → ATTESTATION, all DONE → COMPLETED.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:attestation:write");
  if (denied) return denied;
  const { id } = await params;
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

    await prisma.caseAttestation.update({ where: { id: attestationId }, data });

    const all = await prisma.caseAttestation.findMany({ where: { caseId: id }, select: { status: true } });
    let nextStatus = item.status;
    if (all.length > 0 && all.every((a) => a.status === "DONE")) {
      if (!["COMPLETED", "DELIVERED", "CANCELLED"].includes(item.status)) nextStatus = "COMPLETED";
    } else if (all.some((a) => a.status === "IN_PROGRESS" || a.status === "DONE")) {
      if (["NEW", "PAYMENT_PENDING", "IN_PROCESS", "PRINTED"].includes(item.status)) nextStatus = "ATTESTATION";
    }
    if (nextStatus !== item.status) {
      await prisma.case.update({ where: { id }, data: { status: nextStatus } });
    }

    await logOfficeAction(session, {
      action: "case.attestation.update",
      entity: "Case",
      entityId: id,
      before: existing,
      after: { ...data, caseStatus: nextStatus },
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
  await logOfficeAction(session, { action: "case.attestation.remove", entity: "Case", entityId: id, before: row });
  return NextResponse.json(await loadCaseDetail(session, id));
}
