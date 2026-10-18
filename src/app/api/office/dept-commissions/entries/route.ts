import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, serverError } from "@/lib/office/guard";
import { toNumber } from "@/lib/office/money";
import { toJson } from "@/lib/office/serializers";
import { DEPT_COMMISSION_TYPE, type DeptCommissionKind } from "@/lib/office/dept-commission";

export const preferredRegion = ["sin1"];

// F4 — one dept user's commission statement (admin/cashier only):
//   entries = their DEPT_COMMISSION ledger rows (newest first), kind parsed
//             back from the remarks prefix written by creditDeptCommission.
//   payouts = PAYOUT DEBIT ledger rows carrying the same adminId.
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (!hasPermission(session, "office:ledger:read")) return forbidden();

  const adminId = new URL(request.url).searchParams.get("adminId") || "";
  if (!adminId) return badRequest("adminId zaroori hai");

  try {
    const [entries, payouts] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: { type: DEPT_COMMISSION_TYPE, adminId },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        include: {
          case: { select: { id: true, caseNumber: true, category: { select: { name: true } } } },
        },
      }),
      prisma.ledgerEntry.findMany({
        where: { type: "PAYOUT", direction: "DEBIT", adminId },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
      }),
    ]);

    return NextResponse.json(
      toJson({
        ok: true,
        entries: entries.map((entry) => ({
          id: entry.id,
          entryDate: entry.entryDate,
          kind: parseKind(entry.remarks),
          amount: toNumber(entry.amount),
          caseId: entry.caseId,
          caseNumber: entry.case?.caseNumber ?? null,
          caseCategory: entry.case?.category?.name ?? null,
        })),
        payouts: payouts.map((entry) => ({
          id: entry.id,
          entryDate: entry.entryDate,
          amount: toNumber(entry.amount),
          method: entry.method,
          remarks: entry.remarks,
        })),
      })
    );
  } catch (error) {
    return serverError(error);
  }
}

function parseKind(remarks: string | null): DeptCommissionKind | null {
  if (remarks?.startsWith("PRINTING commission")) return "PRINTING";
  if (remarks?.startsWith("ATTESTATION commission")) return "ATTESTATION";
  return null;
}
