import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardOffice } from "@/lib/office/guard";
import { caseScope } from "@/lib/office/case-access";
import { toJson } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

// Role-aware counts for /office. Booking office users only see their own
// office; cashier/attestation/super admin see everything.
export async function GET() {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;

  const scope = caseScope(session);

  const [byStatus, pendingPayments, pendingRemaining, recentCases] = await Promise.all([
    prisma.case.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    prisma.payment.count({ where: { status: "PENDING", case: scope } }),
    prisma.case.count({ where: { ...scope, claimedRemainingStatus: "PENDING" } }),
    prisma.case.findMany({
      where: scope,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: {
        id: true,
        caseNumber: true,
        clientName: true,
        status: true,
        expectedPrintingDate: true,
        createdAt: true,
        bookingOffice: { select: { name: true } },
        category: { select: { name: true } },
      },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  for (const row of byStatus) statusCounts[row.status] = row._count._all;

  return NextResponse.json(
    toJson({
      statusCounts,
      totalCases: byStatus.reduce((acc, row) => acc + row._count._all, 0),
      pendingPayments,
      pendingRemaining,
      recentCases,
    })
  );
}
