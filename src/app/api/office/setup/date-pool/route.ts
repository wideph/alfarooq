import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { addDays, cleanText, formatDateOnly, parseDateOnly, toJson } from "@/lib/office/serializers";
import { isPakistanWorkingDay } from "@/lib/office/date-engine";

// Admin-managed working-date pool (§N6) — e.g. the 2019 pool used for random
// Bord-date picks. The pool holds at most POOL_LIMIT entries per year; the
// suggest endpoint proposes the next working dates not yet in the pool.
const POOL_LIMIT = 30;

export async function GET(request: NextRequest) {
  const { denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const year = Number(searchParams.get("year")) || 2019;

    if (searchParams.get("suggest") === "1") {
      const existing = await prisma.workingDatePool.findMany({
        where: { year },
        select: { date: true },
      });
      const used = new Set(existing.map((row) => formatDateOnly(row.date)));
      const suggestions: string[] = [];
      let cursor = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year + 1, 0, 1));
      while (cursor < end && existing.length + suggestions.length < POOL_LIMIT) {
        if (!used.has(formatDateOnly(cursor)) && (await isPakistanWorkingDay(cursor))) {
          suggestions.push(formatDateOnly(cursor));
        }
        cursor = addDays(cursor, 1);
      }
      return NextResponse.json({ year, count: existing.length, limit: POOL_LIMIT, suggestions });
    }

    const rows = await prisma.workingDatePool.findMany({
      where: { year },
      orderBy: { date: "asc" },
    });
    return NextResponse.json(toJson({ year, count: rows.length, limit: POOL_LIMIT, rows }));
  } catch (error) {
    return serverError(error);
  }
}

export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const year = Number(body.year);
    const date = parseDateOnly(body.date);
    if (!Number.isFinite(year) || year < 1900 || !date || date.getUTCFullYear() !== year) {
      return badRequest("Year ya date sahi nahi hai");
    }
    // Pool entries must be real Pakistan working days: not Sat/Sun, not a
    // PAKISTAN-scope holiday.
    if (!(await isPakistanWorkingDay(date))) {
      return badRequest("Ye date working day nahi hai (weekend ya holiday)");
    }

    const count = await prisma.workingDatePool.count({ where: { year } });
    const existing = await prisma.workingDatePool.findUnique({
      where: { year_date: { year, date } },
    });
    if (!existing && count >= POOL_LIMIT) {
      return badRequest(`Pool full hai (${POOL_LIMIT} dates). Pehle koi entry delete karein.`);
    }

    const row = await prisma.workingDatePool.upsert({
      where: { year_date: { year, date } },
      update: { note: cleanText(body.note, 200) },
      create: { year, date, note: cleanText(body.note, 200) },
    });
    await logOfficeAction(session, {
      action: "date-pool.create",
      entity: "WorkingDatePool",
      entityId: row.id,
      after: row,
    });
    return NextResponse.json(toJson(row), { status: 201 });
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
    const existing = await prisma.workingDatePool.findUnique({ where: { id } });
    if (!existing) return notFound("Entry nahi mili");
    await prisma.workingDatePool.delete({ where: { id } });
    await logOfficeAction(session, {
      action: "date-pool.delete",
      entity: "WorkingDatePool",
      entityId: id,
      before: existing,
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError(error);
  }
}
