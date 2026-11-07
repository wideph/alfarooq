import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { cleanText, parseDateOnly, toJson } from "@/lib/office/serializers";
import { HOLIDAY_SCOPES, type HolidayScope } from "@/lib/office/date-engine";
import { getOfficeHolidayClosures, revalidateOfficeSetup } from "@/lib/office/setup-cache";
import { recheckOpenCaseDates } from "@/lib/office/date-recheck";
import { builtinHolidaysOfYear } from "@/lib/office/holiday-calendar";

export const preferredRegion = ["sin1"];

// §W60: chhutti add / badalne ke baad us din ki pending dates aage (after()).
export const maxDuration = 300;

// Is din pending attestation wale cases dobara check (chhutti par date → aage).
async function recheckCasesOn(session: { adminId: string; role?: string | null }, dates: Date[]) {
  try {
    const rows = await prisma.caseAttestation.findMany({
      where: { status: { not: "DONE" }, scheduledDate: { in: dates } },
      select: { caseId: true },
      distinct: ["caseId"],
    });
    if (rows.length === 0) return;
    await recheckOpenCaseDates({ adminId: session.adminId, role: session.role || "admin" }, { caseIds: rows.map((row) => row.caseId) });
  } catch (error) {
    console.error("[office] holiday recheck fail", error);
  }
}

// Admin-managed holiday / closure table (§N6). Scopes:
// PAKISTAN | ISLAMABAD | QUETTA | GUJRAT | LAHORE | EMBASSIES_ISB | SAUDI

export async function GET(request: NextRequest) {
  const { denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    // §W60: ?builtin=YYYY → code ke built-in calendar ki chhuttiyan (sirf dikhane ke liye).
    const builtinYear = Number(searchParams.get("builtin"));
    if (Number.isFinite(builtinYear) && builtinYear > 1900 && builtinYear < 2200) {
      return NextResponse.json({
        year: builtinYear,
        pakistan: builtinHolidaysOfYear(builtinYear, "PK"),
        saudi: builtinHolidaysOfYear(builtinYear, "SA"),
      });
    }
    const year = Number(searchParams.get("year"));
    const scope = searchParams.get("scope");
    // §W20: cached (60s + tag invalidation); year/scope filters in-memory.
    // Cached dates ISO strings hain (UTC midnight) — lexicographic compare
    // wahi range deta hai jo pehle Date range deta tha.
    const all = await getOfficeHolidayClosures();
    const hasYear = Number.isFinite(year) && year > 1900;
    const rows = all.filter(
      (row) =>
        (!hasYear || (row.date >= `${year}-01-01` && row.date < `${year + 1}-01-01`)) &&
        (!scope || row.scope === scope)
    );
    return NextResponse.json(rows);
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
    revalidateOfficeSetup();
    after(() => recheckCasesOn(session, [row.date]));
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
    revalidateOfficeSetup();
    after(() => recheckCasesOn(session, [row.date]));
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
    revalidateOfficeSetup();
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
