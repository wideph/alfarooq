import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { toJson, cleanText } from "@/lib/office/serializers";
import { BOOKING_OFFICE_TYPES, type BookingOfficeType } from "@/lib/office/permissions";

const officeInclude = {
  members: { orderBy: { createdAt: "asc" as const } },
  commissions: { include: { category: { select: { id: true, name: true } } } },
  _count: { select: { cases: true, users: true } },
};

// Every office role may read the list (cashier ledger, booking office own
// header); booking_office users only get their own office.
export async function GET() {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;

  const offices = await prisma.bookingOffice.findMany({
    where: session.role === "booking_office" ? { id: session.bookingOfficeId || "" } : {},
    orderBy: [{ isActive: "desc" }, { name: "asc" }],
    include: officeInclude,
  });

  return NextResponse.json(toJson(offices));
}

function readOfficeBody(body: Record<string, unknown>) {
  const name = cleanText(body.name, 120);
  const type = typeof body.type === "string" ? (body.type as BookingOfficeType) : null;
  if (!name) return { error: "Office ka naam zaroori hai" };
  if (!type || !BOOKING_OFFICE_TYPES.includes(type)) return { error: "Office type sahi nahi hai" };
  return {
    data: {
      name,
      type,
      phone: cleanText(body.phone, 40),
      notes: cleanText(body.notes, 1000),
      isActive: body.isActive === undefined ? true : body.isActive !== false,
    },
  };
}

export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;

  try {
    const parsed = readOfficeBody(await request.json());
    if (parsed.error !== undefined) return badRequest(parsed.error);

    const office = await prisma.bookingOffice.create({
      data: parsed.data,
      include: officeInclude,
    });

    // Every office gets a default member row (the office itself) so payouts and
    // salaries always have a target even before shareholders are added.
    if (office.members.length === 0) {
      await prisma.bookingOfficeMember.create({
        data: { bookingOfficeId: office.id, name: office.name },
      });
    }

    await logOfficeAction(session, {
      action: "booking_office.create",
      entity: "BookingOffice",
      entityId: office.id,
      after: parsed.data,
    });

    const fresh = await prisma.bookingOffice.findUnique({
      where: { id: office.id },
      include: officeInclude,
    });
    return NextResponse.json(toJson(fresh), { status: 201 });
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
    const existing = await prisma.bookingOffice.findUnique({ where: { id } });
    if (!existing) return notFound("Booking office nahi mila");

    const parsed = readOfficeBody(body);
    if (parsed.error !== undefined) return badRequest(parsed.error);

    // Changing the type of an office that already has ledger history would make
    // old entries meaningless, so it is blocked once cases exist.
    if (parsed.data.type !== existing.type) {
      const caseCount = await prisma.case.count({ where: { bookingOfficeId: id } });
      if (caseCount > 0) {
        return badRequest("Cases mojood hain, is office ka type change nahi ho sakta");
      }
    }

    const office = await prisma.bookingOffice.update({
      where: { id },
      data: parsed.data,
      include: officeInclude,
    });

    await logOfficeAction(session, {
      action: "booking_office.update",
      entity: "BookingOffice",
      entityId: id,
      before: existing,
      after: parsed.data,
    });

    return NextResponse.json(toJson(office));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id") || "";
  const existing = await prisma.bookingOffice.findUnique({
    where: { id },
    include: { _count: { select: { cases: true, ledger: true } } },
  });
  if (!existing) return notFound("Booking office nahi mila");
  if (existing._count.cases > 0 || existing._count.ledger > 0) {
    return badRequest("Is office ke cases / ledger mojood hain. Delete ki jagah inactive karein.");
  }

  await prisma.bookingOffice.delete({ where: { id } });
  await logOfficeAction(session, {
    action: "booking_office.delete",
    entity: "BookingOffice",
    entityId: id,
    before: existing,
  });

  return NextResponse.json({ success: true });
}
