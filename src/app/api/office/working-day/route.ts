import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parseDateOnly, cleanText } from "@/lib/office/serializers";
import {
  refreshOpenCasesPrintingDates,
  resolvePakistanWorkingDay,
} from "@/lib/office/working-day";

export const preferredRegion = ["sin1"];

export const maxDuration = 30;

// GET: cached working-day rows (newest first) for the setup panel.
export async function GET() {
  const { denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const rows = await prisma.workingDayCache.findMany({
    orderBy: { candidateDate: "desc" },
    take: 200,
  });
  return NextResponse.json(rows);
}

// POST { date }: resolve (and cache) the first working day on/after `date`.
export async function POST(request: NextRequest) {
  const { denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  try {
    const body = await request.json();
    const date = parseDateOnly(body.date);
    if (!date) return badRequest("Date YYYY-MM-DD format mein dein");
    const result = await resolvePakistanWorkingDay(date);
    return NextResponse.json(result);
  } catch (error) {
    return serverError(error);
  }
}

// PUT { candidateDate, workingDate, reason }: super admin manual override.
export async function PUT(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const body = await request.json();
    const candidateDate = parseDateOnly(body.candidateDate);
    const workingDate = parseDateOnly(body.workingDate);
    if (!candidateDate || !workingDate) return badRequest("Dono dates YYYY-MM-DD format mein dein");
    if (workingDate < candidateDate) return badRequest("Working date candidate date se pehle nahi ho sakti");

    const before = await prisma.workingDayCache.findUnique({ where: { candidateDate } });
    const isCandidateWorking = workingDate.getTime() === candidateDate.getTime();
    const row = await prisma.workingDayCache.upsert({
      where: { candidateDate },
      update: {
        workingDate,
        isCandidateWorking,
        reason: cleanText(body.reason, 200),
        source: "MANUAL",
      },
      create: {
        candidateDate,
        workingDate,
        isCandidateWorking,
        reason: cleanText(body.reason, 200),
        source: "MANUAL",
      },
    });

    const refreshed = await refreshOpenCasesPrintingDates();

    await logOfficeAction(session, {
      action: "working_day.override",
      entity: "WorkingDayCache",
      entityId: row.id,
      before,
      after: row,
    });

    return NextResponse.json({ ...row, refreshedCases: refreshed });
  } catch (error) {
    return serverError(error);
  }
}

export async function DELETE(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  const { searchParams } = new URL(request.url);
  const candidateDate = parseDateOnly(searchParams.get("date"));
  if (!candidateDate) return badRequest("Date YYYY-MM-DD format mein dein");
  const before = await prisma.workingDayCache.findUnique({ where: { candidateDate } });
  if (!before) return NextResponse.json({ success: true });
  await prisma.workingDayCache.delete({ where: { candidateDate } });
  await logOfficeAction(session, {
    action: "working_day.delete",
    entity: "WorkingDayCache",
    entityId: before.id,
    before,
  });
  return NextResponse.json({ success: true });
}
