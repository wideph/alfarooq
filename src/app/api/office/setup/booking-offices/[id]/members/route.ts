import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parsePercent } from "@/lib/office/money";
import { toJson, cleanText } from "@/lib/office/serializers";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  if (session.role === "booking_office" && session.bookingOfficeId !== id) {
    return notFound("Booking office nahi mila");
  }

  const members = await prisma.bookingOfficeMember.findMany({
    where: { bookingOfficeId: id },
    orderBy: { createdAt: "asc" },
    include: { admin: { select: { id: true, email: true, name: true, isActive: true } } },
  });
  return NextResponse.json(toJson(members));
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  const { id } = await params;

  try {
    const office = await prisma.bookingOffice.findUnique({ where: { id } });
    if (!office) return notFound("Booking office nahi mila");

    const body = await request.json();
    const name = cleanText(body.name, 120);
    if (!name) return badRequest("Member ka naam zaroori hai");
    const profitPercent = body.profitPercent === undefined ? null : parsePercent(body.profitPercent);
    if (body.profitPercent !== undefined && profitPercent === null) {
      return badRequest("Profit % 0 se 100 ke darmiyan ho");
    }

    const member = await prisma.bookingOfficeMember.create({
      data: {
        bookingOfficeId: id,
        name,
        profitPercent: profitPercent ?? undefined,
      },
    });

    await logOfficeAction(session, {
      action: "office_member.create",
      entity: "BookingOfficeMember",
      entityId: member.id,
      after: member,
    });

    return NextResponse.json(toJson(member), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  const { id } = await params;

  try {
    const body = await request.json();
    const memberId = typeof body.id === "string" ? body.id : "";
    const existing = await prisma.bookingOfficeMember.findFirst({
      where: { id: memberId, bookingOfficeId: id },
    });
    if (!existing) return notFound("Member nahi mila");

    const name = cleanText(body.name, 120);
    const profitPercent = body.profitPercent === undefined ? null : parsePercent(body.profitPercent);
    if (body.profitPercent !== undefined && profitPercent === null) {
      return badRequest("Profit % 0 se 100 ke darmiyan ho");
    }

    const member = await prisma.bookingOfficeMember.update({
      where: { id: memberId },
      data: {
        ...(name ? { name } : {}),
        ...(profitPercent !== null ? { profitPercent } : {}),
        ...(body.isActive !== undefined ? { isActive: body.isActive !== false } : {}),
      },
    });

    await logOfficeAction(session, {
      action: "office_member.update",
      entity: "BookingOfficeMember",
      entityId: memberId,
      before: existing,
      after: member,
    });

    return NextResponse.json(toJson(member));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const memberId = searchParams.get("id") || "";

  const existing = await prisma.bookingOfficeMember.findFirst({
    where: { id: memberId, bookingOfficeId: id },
    include: { _count: { select: { ledger: true, salaries: true } } },
  });
  if (!existing) return notFound("Member nahi mila");
  if (existing.adminId) return badRequest("Login wale member ko delete nahi kar sakte; user ko /admin/sub-admins se hatayein");
  if (existing._count.ledger > 0 || existing._count.salaries > 0) {
    return badRequest("Is member ka ledger / salary record hai. Inactive karein.");
  }

  await prisma.bookingOfficeMember.delete({ where: { id: memberId } });
  await logOfficeAction(session, {
    action: "office_member.delete",
    entity: "BookingOfficeMember",
    entityId: memberId,
    before: existing,
  });
  return NextResponse.json({ success: true });
}
