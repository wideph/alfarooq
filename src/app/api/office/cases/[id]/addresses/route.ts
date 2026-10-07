import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { cleanText } from "@/lib/office/serializers";

type RouteParams = { params: Promise<{ id: string }> };

// R1.3: booking office can add multiple delivery addresses at any stage.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    const body = await request.json();
    const address = cleanText(body.address, 500);
    if (!address) return badRequest("Address zaroori hai");
    const row = await prisma.caseAddress.create({
      data: { caseId: id, address, label: cleanText(body.label, 60) },
    });
    await logOfficeAction(session, { action: "case.address.add", entity: "Case", entityId: id, after: row });
    return NextResponse.json(row, { status: 201 });
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
  const addressId = new URL(request.url).searchParams.get("addressId") || "";
  const row = await prisma.caseAddress.findFirst({ where: { id: addressId, caseId: id } });
  if (!row) return notFound("Address nahi mila");
  await prisma.caseAddress.delete({ where: { id: addressId } });
  await logOfficeAction(session, { action: "case.address.remove", entity: "Case", entityId: id, before: row });
  return NextResponse.json({ success: true });
}
