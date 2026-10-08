import { NextRequest, NextResponse } from "next/server";
import { badRequest, forbidden, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { findAccessibleCase } from "@/lib/office/case-access";
import { generateSetDates } from "@/lib/office/date-engine";
import { toJson } from "@/lib/office/serializers";
import { getFreshAdminSession, hasPermission } from "@/lib/auth";

type RouteParams = { params: Promise<{ id: string }> };

// Admin / cashier / attestation office / atta department: (re)generate the set
// dates of a case. Missing inputs (no RECEIVED payment, empty 2019 pool) never
// fail the request: those steps just stay pending and the reason is returned (§N5/N6).
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const session = await getFreshAdminSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const allowed =
    hasPermission(session, "office:attestation:write") ||
    hasPermission(session, "office:atta:write") ||
    hasPermission(session, "office:payments:verify");
  if (!allowed) return forbidden();
  const { id } = await params;
  try {
    const item = await findAccessibleCase(session, id);
    if (!item) return notFound("Case nahi mila");
    if (!item.setId) return badRequest("Pehle set select karein");

    const result = await generateSetDates(id);
    await logOfficeAction(session, {
      action: "case.generate-dates",
      entity: "Case",
      entityId: id,
      after: {
        status: result.status,
        pendingReasons: result.pendingReasons,
        boardAttasNumber: result.boardAttasNumber,
        steps: result.steps.map((step) => ({
          stepKey: step.stepKey,
          scheduledDate: step.scheduledDate,
        })),
      },
    });
    return NextResponse.json(toJson(result));
  } catch (error) {
    return serverError(error);
  }
}

// AI date research can take minutes on first (uncached) generation — allow long runs on Vercel.
export const maxDuration = 300;
