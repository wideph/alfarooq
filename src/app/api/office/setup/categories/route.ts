import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parseAmount } from "@/lib/office/money";
import { toJson, cleanText } from "@/lib/office/serializers";
import { getOfficeCategories, revalidateOfficeSetup } from "@/lib/office/setup-cache";

export const preferredRegion = ["sin1"];

export async function GET() {
  const { denied } = await guardOffice("office:cases:read");
  if (denied) return denied;

  // §W20: cached (60s + tag invalidation) — response shape wahi hai.
  const categories = await getOfficeCategories();
  return NextResponse.json(categories);
}

function readBody(body: Record<string, unknown>) {
  const name = cleanText(body.name, 120);
  if (!name) return { error: "Category ka naam zaroori hai" };
  const defaultAmount =
    body.defaultAmount === undefined || body.defaultAmount === null || body.defaultAmount === ""
      ? null
      : parseAmount(body.defaultAmount);
  if (body.defaultAmount && defaultAmount === null) return { error: "Default amount sahi nahi hai" };
  const order = Number(body.order);
  return {
    data: {
      name,
      defaultAmount,
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
    const category = await prisma.caseCategory.create({ data: parsed.data });
    revalidateOfficeSetup();
    await logOfficeAction(session, {
      action: "category.create",
      entity: "CaseCategory",
      entityId: category.id,
      after: category,
    });
    return NextResponse.json(toJson(category), { status: 201 });
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
    const existing = await prisma.caseCategory.findUnique({ where: { id } });
    if (!existing) return notFound("Category nahi mili");
    const parsed = readBody(body);
    if (parsed.error !== undefined) return badRequest(parsed.error);
    const category = await prisma.caseCategory.update({ where: { id }, data: parsed.data });
    revalidateOfficeSetup();
    await logOfficeAction(session, {
      action: "category.update",
      entity: "CaseCategory",
      entityId: id,
      before: existing,
      after: category,
    });
    return NextResponse.json(toJson(category));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const existing = await prisma.caseCategory.findUnique({
    where: { id },
    include: { _count: { select: { cases: true } } },
  });
  if (!existing) return notFound("Category nahi mili");
  if (existing._count.cases > 0) return badRequest("Is category ke cases hain. Inactive karein.");
  await prisma.caseCategory.delete({ where: { id } });
  revalidateOfficeSetup();
  await logOfficeAction(session, {
    action: "category.delete",
    entity: "CaseCategory",
    entityId: id,
    before: existing,
  });
  return NextResponse.json({ success: true });
}
