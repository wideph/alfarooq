import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardOffice, notFound, serverError } from "@/lib/office/guard";
import { caseScope } from "@/lib/office/case-access";
import { getOfficeFileSignedUrl } from "@/lib/office/r2";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string }> };

// Slips live in a private R2 bucket. Anyone who can see the case gets a
// short-lived signed URL (never cached: the URL expires).
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id } = await params;
  try {
    const payment = await prisma.payment.findFirst({
      where: { id, case: caseScope(session) },
      select: { slipKey: true },
    });
    if (!payment?.slipKey) return notFound("Slip nahi mili");
    const url = await getOfficeFileSignedUrl(payment.slipKey);
    return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return serverError(error);
  }
}
