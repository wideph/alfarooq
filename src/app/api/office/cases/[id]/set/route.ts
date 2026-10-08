import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { generateSetDates } from "@/lib/office/date-engine";
import { isSetDimmed, DIMMED_REASON } from "@/lib/office/rnumber";

type RouteParams = { params: Promise<{ id: string }> };

// Booking office (or admin): select the attestation set of a case. Dimmed sets
// (r-number suffix 22..29, §N5) are rejected. If a RECEIVED first payment
// already exists, the set dates are generated right away.
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id, { category: { select: { name: true } } });
    if (!item) return notFound("Case nahi mila");

    const body = await request.json();
    const setId = typeof body.setId === "string" ? body.setId : "";
    if (!setId) return badRequest("Set zaroori hai");

    const set = await prisma.categorySet.findUnique({
      where: { id: setId },
      include: { steps: { orderBy: { order: "asc" } } },
    });
    if (!set || !set.isActive) return notFound("Set nahi mila");
    if (item.categoryId && set.categoryId !== item.categoryId) {
      return badRequest("Ye set is category ka nahi hai");
    }
    if (isSetDimmed(item.category?.name, item.rollNumber, set.name)) {
      return forbidden(DIMMED_REASON);
    }

    await prisma.case.update({ where: { id }, data: { setId } });
    await logOfficeAction(session, {
      action: "case.set",
      entity: "Case",
      entityId: id,
      before: { setId: item.setId },
      after: { setId, setName: set.name },
    });

    let generated: Awaited<ReturnType<typeof generateSetDates>> | null = null;
    const firstPayment = await prisma.payment.findFirst({
      where: { caseId: id, status: "RECEIVED" },
      select: { id: true },
    });
    if (firstPayment) {
      try {
        generated = await generateSetDates(id);
      } catch (error) {
        console.error("[office] generateSetDates fail", error);
      }
    }

    return NextResponse.json({
      success: true,
      setId,
      setName: set.name,
      dates: generated
        ? { status: generated.status, pendingReasons: generated.pendingReasons, boardAttasNumber: generated.boardAttasNumber }
        : null,
    });
  } catch (error) {
    return serverError(error);
  }
}

// Admin / office:cases:write — clear the selected set (attestation rows stay).
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:write");
  if (denied) return denied;
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");

    await prisma.case.update({ where: { id }, data: { setId: null } });
    await logOfficeAction(session, {
      action: "case.set.clear",
      entity: "Case",
      entityId: id,
      before: { setId: item.setId },
    });
    return NextResponse.json({ success: true });
  } catch (error) {
    return serverError(error);
  }
}

// AI date research can take minutes on first (uncached) generation — allow long runs on Vercel.
export const maxDuration = 300;
