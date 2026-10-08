import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { cleanText, parseDateOnly, toJson } from "@/lib/office/serializers";
import { HOLIDAY_SCOPES, type HolidayScope } from "@/lib/office/date-engine";

// Admin-managed holiday / closure table (§N6). Scopes:
// PAKISTAN | ISLAMABAD | QUETTA | GUJRAT | LAHORE | EMBASSIES_ISB | SAUDI

export async function GET(request: NextRequest) {
  const { denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get("year"));
    const scope = searchParams.get("scope");
    const rows = await prisma.holidayClosure.findMany({
      where: {
        ...(Number.isFinite(year) && year > 1900
          ? {
              date: {
                gte: new Date(Date.UTC(year, 0, 1)),
                lt: new Date(Date.UTC(year + 1, 0, 1)),
              },
            }
          : {}),
        ...(scope ? { scope } : {}),
      },
      orderBy: [{ date: "asc" }, { scope: "asc" }],
    });
    return NextResponse.json(toJson(rows));
  } catch (error) {
    return serverError(error);
  }
}

function readBody(body: Record<string, unknown>) {
  const date = parseDateOnly(body.date);
  if (!date) return { error: "Date sahi nahi hai (YYYY-MM-DD)" };
  const scope = cleanText(body.scope, 30)?.toUpperCase() || "PAKISTAN";
  if (!(HOLIDAY_SCOPES as readonly string[]).includes(scope)) return { error: "Scope sahi nahi hai" };
  return { data: { date, scope: scope as HolidayScope, reason: cleanText(body.reason, 200) } };
}

export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const parsed = readBody(await request.json());
    if (parsed.error !== undefined) return badRequest(parsed.error);
    const row = await prisma.holidayClosure.upsert({
      where: { date_scope: { date: parsed.data.date, scope: parsed.data.scope } },
      update: { reason: parsed.data.reason },
      create: parsed.data,
    });
    await logOfficeAction(session, {
      action: "holiday.create",
      entity: "HolidayClosure",
      entityId: row.id,
      after: row,
    });
    return NextResponse.json(toJson(row), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}

export async function PATCH(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const existing = await prisma.holidayClosure.findUnique({ where: { id } });
    if (!existing) return notFound("Holiday nahi mili");
    const parsed = readBody(body);
    if (parsed.error !== undefined) return badRequest(parsed.error);
    const row = await prisma.holidayClosure.update({ where: { id }, data: parsed.data });
    await logOfficeAction(session, {
      action: "holiday.update",
      entity: "HolidayClosure",
      entityId: id,
      before: existing,
      after: row,
    });
    return NextResponse.json(toJson(row));
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") || "";
    const existing = await prisma.holidayClosure.findUnique({ where: { id } });
    if (!existing) return notFound("Holiday nahi mili");
    await prisma.holidayClosure.delete({ where: { id } });
    await logOfficeAction(session, {
      action: "holiday.delete",
      entity: "HolidayClosure",
      entityId: id,
      before: existing,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError(error);
  }
}
