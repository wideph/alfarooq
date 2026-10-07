import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { toJson, cleanText } from "@/lib/office/serializers";

export async function GET() {
  const { denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const types = await prisma.attestationType.findMany({
    orderBy: [{ order: "asc" }, { name: "asc" }],
  });
  return NextResponse.json(toJson(types));
}

function readBody(body: Record<string, unknown>) {
  const name = cleanText(body.name, 120);
  if (!name) return { error: "Attestation ka naam zaroori hai" };
  const order = Number(body.order);
  return {
    data: {
      name,
      order: Number.isFinite(order) ? order : 0,
      isActive: body.isActive === undefined ? true : body.isActive !== false,
    },
  };
}

export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const parsed = readBody(await request.json());
    if (parsed.error !== undefined) return badRequest(parsed.error);
    const type = await prisma.attestationType.create({ data: parsed.data });
    await logOfficeAction(session, {
      action: "attestation_type.create",
      entity: "AttestationType",
      entityId: type.id,
      after: type,
    });
    return NextResponse.json(toJson(type), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

export async function PUT(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const existing = await prisma.attestationType.findUnique({ where: { id } });
    if (!existing) return notFound("Attestation type nahi mila");
    const parsed = readBody(body);
    if (parsed.error !== undefined) return badRequest(parsed.error);
    const type = await prisma.attestationType.update({ where: { id }, data: parsed.data });
    await logOfficeAction(session, {
      action: "attestation_type.update",
      entity: "AttestationType",
      entityId: id,
      before: existing,
      after: type,
    });
    return NextResponse.json(toJson(type));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const existing = await prisma.attestationType.findUnique({
    where: { id },
    include: { _count: { select: { caseAttestations: true } } },
  });
  if (!existing) return notFound("Attestation type nahi mila");
  if (existing._count.caseAttestations > 0) {
    return badRequest("Ye attestation cases mein use ho rahi hai. Inactive karein.");
  }
  await prisma.attestationType.delete({ where: { id } });
  await logOfficeAction(session, {
    action: "attestation_type.delete",
    entity: "AttestationType",
    entityId: id,
    before: existing,
  });
  return NextResponse.json({ success: true });
}
