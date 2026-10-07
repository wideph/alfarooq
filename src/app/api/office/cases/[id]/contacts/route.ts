import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { cleanText } from "@/lib/office/serializers";

type RouteParams = { params: Promise<{ id: string }> };

// R1.3: booking office can add multiple contact numbers at any stage.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    const body = await request.json();
    const phone = cleanText(body.phone, 40);
    if (!phone) return badRequest("Phone number zaroori hai");
    const contact = await prisma.caseContact.create({
      data: { caseId: id, phone, label: cleanText(body.label, 60) },
    });
    await logOfficeAction(session, { action: "case.contact.add", entity: "Case", entityId: id, after: contact });
    return NextResponse.json(contact, { status: 201 });
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
  const contactId = new URL(request.url).searchParams.get("contactId") || "";
  const contact = await prisma.caseContact.findFirst({ where: { id: contactId, caseId: id } });
  if (!contact) return notFound("Contact nahi mila");
  await prisma.caseContact.delete({ where: { id: contactId } });
  await logOfficeAction(session, { action: "case.contact.remove", entity: "Case", entityId: id, before: contact });
  return NextResponse.json({ success: true });
}
