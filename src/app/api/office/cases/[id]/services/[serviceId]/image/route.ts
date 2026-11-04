import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardOffice, notFound, serverError } from "@/lib/office/guard";
import { findAccessibleCase, findDeptAccessibleCase } from "@/lib/office/case-access";
import { getOfficeFileSignedUrl } from "@/lib/office/r2";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ id: string; serviceId: string }> };

// §W56 — reissue ke saath booking office ki nayi tasveer: case dekh sakne wala
// (ya filing / department permission wala) signed R2 link par redirect.
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const { id, serviceId } = await params;
  try {
    const item = (await findAccessibleCase(session, id)) ?? (await findDeptAccessibleCase(session, id));
    if (!item) return notFound("Case nahi mila");
    const service = await prisma.caseService.findFirst({ where: { id: serviceId, caseId: id }, select: { imageKey: true } });
    if (!service?.imageKey) return notFound("Tasveer nahi mili");
    return NextResponse.redirect(await getOfficeFileSignedUrl(service.imageKey));
  } catch (error) {
    return serverError(error);
  }
}
