import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { toJson, cleanText } from "@/lib/office/serializers";
import { BOOKING_OFFICE_TYPES, type BookingOfficeType } from "@/lib/office/permissions";
import { createOfficeUser, hashOfficeUserPassword, validateOfficeUser, type OfficeUserInput } from "@/lib/office/office-users";

const officeInclude = {
  members: { orderBy: { createdAt: "asc" as const } },
  commissions: { include: { category: { select: { id: true, name: true } } } },
  users: {
    select: { id: true, name: true, email: true, role: true, isActive: true },
    orderBy: { createdAt: "asc" as const },
  },
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

// N2: office + uske users/roles ek hi submit mein bante hain. Sab kuch ek
// transaction mein — koi bhi user fail ho to office bhi nahi banta.
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;

  try {
    const body = await request.json();
    const parsed = readOfficeBody(body);
    if (parsed.error !== undefined) return badRequest(parsed.error);

    const users: OfficeUserInput[] = [];
    if (body.users !== undefined) {
      if (!Array.isArray(body.users)) return badRequest("Users ki list sahi nahi hai");
      const emails = new Set<string>();
      for (const raw of body.users) {
        const validated = validateOfficeUser(raw);
        if ("error" in validated) return badRequest(validated.error);
        if (emails.has(validated.data.email)) {
          return badRequest(`Email "${validated.data.email}" list mein do baar hai`);
        }
        emails.add(validated.data.email);
        users.push(validated.data);
      }
    }

    // bcrypt hashing transaction se pehle — tx sirf DB work rakhe.
    const hashedUsers = await Promise.all(users.map(hashOfficeUserPassword));

    const officeId = await prisma.$transaction(async (tx) => {
      const office = await tx.bookingOffice.create({ data: parsed.data });

      // Every office gets a default member row (the office itself) so payouts
      // and salaries always have a target even before shareholders are added.
      await tx.bookingOfficeMember.create({
        data: { bookingOfficeId: office.id, name: office.name },
      });

      await logOfficeAction(
        session,
        {
          action: "booking_office.create",
          entity: "BookingOffice",
          entityId: office.id,
          after: parsed.data,
        },
        tx
      );

      for (const user of hashedUsers) {
        await createOfficeUser(tx, session, office.id, user);
      }

      return office.id;
    }, { maxWait: 10000, timeout: 30000 });

    const fresh = await prisma.bookingOffice.findUnique({
      where: { id: officeId },
      include: officeInclude,
    });
    return NextResponse.json(toJson(fresh), { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("pehle se registered")) {
      return badRequest(error.message);
    }
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
