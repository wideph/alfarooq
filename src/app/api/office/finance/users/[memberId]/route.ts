import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardOffice, notFound, serverError } from "@/lib/office/guard";
import { sum, toNumber } from "@/lib/office/money";
import { formatDateOnly } from "@/lib/office/serializers";

export const preferredRegion = ["sin1"];

type RouteParams = { params: Promise<{ memberId: string }> };

// Keep in sync with ../route.ts (route files cannot export shared constants).
const EARNING_TYPES = [
  "COMMISSION_HALF",
  "COMMISSION_FINAL",
  "COMMISSION_ADJUST",
  "EXTRA_SHARE",
  "PROFIT_SHARE",
  "ADJUSTMENT",
  "BONUS",
];

// §W12.3 — Finance user detail: member info + har earning entry (type, case,
// date, amount, remarks) + har payout (date, method, amount, remarks) + totals.
export async function GET(_request: Request, { params }: RouteParams) {
  const { denied } = await guardOffice("office:finance:read");
  if (denied) return denied;
  const { memberId } = await params;
  try {
    const [member, earningRows, payoutRows] = await Promise.all([
      prisma.bookingOfficeMember.findUnique({
        where: { id: memberId },
        select: {
          id: true,
          name: true,
          adminId: true,
          profitPercent: true,
          bookingOffice: { select: { id: true, name: true, type: true } },
        },
      }),
      // Earning rows include ADJUSTMENT debits (downward re-calc) so the
      // detail list explains the net total; direction is shown per row.
      prisma.ledgerEntry.findMany({
        where: { memberId, type: { in: EARNING_TYPES } },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        select: {
          id: true,
          type: true,
          direction: true,
          amount: true,
          entryDate: true,
          remarks: true,
          case: { select: { id: true, caseNumber: true } },
        },
      }),
      prisma.ledgerEntry.findMany({
        where: { memberId, direction: "DEBIT", type: "PAYOUT" },
        orderBy: [{ entryDate: "desc" }, { createdAt: "desc" }],
        select: { id: true, amount: true, entryDate: true, method: true, remarks: true },
      }),
    ]);
    if (!member) return notFound("Member nahi mila");

    // Net earning = credits − debits (downward ADJUSTMENT rows).
    const totalEarning = earningRows.reduce(
      (acc, row) => (row.direction === "CREDIT" ? acc.plus(row.amount) : acc.minus(row.amount)),
      new Prisma.Decimal(0)
    );
    const wasool = sum(payoutRows.map((row) => row.amount));

    return NextResponse.json({
      member: {
        memberId: member.id,
        name: member.name,
        adminId: member.adminId,
        profitPercent: toNumber(member.profitPercent),
        officeId: member.bookingOffice.id,
        officeName: member.bookingOffice.name,
        officeType: member.bookingOffice.type,
      },
      earnings: earningRows.map((row) => ({
        id: row.id,
        date: formatDateOnly(row.entryDate),
        type: row.type,
        direction: row.direction,
        amount: toNumber(row.amount),
        caseId: row.case?.id ?? null,
        caseNumber: row.case?.caseNumber ?? null,
        remarks: row.remarks,
      })),
      payouts: payoutRows.map((row) => ({
        id: row.id,
        date: formatDateOnly(row.entryDate),
        method: row.method,
        amount: toNumber(row.amount),
        remarks: row.remarks,
      })),
      totals: {
        totalEarning: toNumber(totalEarning),
        wasool: toNumber(wasool),
        due: toNumber(totalEarning.minus(wasool)),
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
