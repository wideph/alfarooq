import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardOffice, serverError } from "@/lib/office/guard";
import { toNumber } from "@/lib/office/money";

export const preferredRegion = ["sin1"];

// §W12.3 — Finance page users table: ALL active booking-office members across
// offices with TOTAL EARNING (credits of share types), WASOOL (PAYOUT debits),
// DUE (earning − wasool). Salaries are separate — only PAYOUT counts as wasool.
// NOTE: route files may only export HTTP handlers/config, so this constant is
// duplicated in ./[memberId]/route.ts — keep both in sync.
const EARNING_TYPES = [
  "COMMISSION_HALF",
  "COMMISSION_FINAL",
  "COMMISSION_ADJUST",
  "EXTRA_SHARE",
  "PROFIT_SHARE",
  "ADJUSTMENT",
  "BONUS",
];

export async function GET() {
  const { denied } = await guardOffice("office:finance:read");
  if (denied) return denied;
  try {
    const [members, sums] = await Promise.all([
      prisma.bookingOfficeMember.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          adminId: true,
          bookingOffice: { select: { id: true, name: true, type: true } },
        },
        orderBy: { name: "asc" },
      }),
      // ONE grouped query over the whole ledger; balances computed in JS.
      prisma.ledgerEntry.groupBy({
        by: ["memberId", "type", "direction"],
        where: { memberId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    const totals = new Map<string, { earning: Prisma.Decimal; wasool: Prisma.Decimal }>();
    const bucket = (memberId: string) => {
      let row = totals.get(memberId);
      if (!row) {
        row = { earning: new Prisma.Decimal(0), wasool: new Prisma.Decimal(0) };
        totals.set(memberId, row);
      }
      return row;
    };
    for (const row of sums) {
      if (!row.memberId) continue;
      const amount = row._sum.amount || new Prisma.Decimal(0);
      const target = bucket(row.memberId);
      if (EARNING_TYPES.includes(row.type)) {
        // Net earning: credits minus downward adjustments (ADJUSTMENT debits).
        target.earning = row.direction === "CREDIT" ? target.earning.plus(amount) : target.earning.minus(amount);
      } else if (row.direction === "DEBIT" && row.type === "PAYOUT") {
        target.wasool = target.wasool.plus(amount);
      }
    }

    return NextResponse.json({
      users: members.map((member) => {
        const row = totals.get(member.id);
        const earning = row?.earning ?? new Prisma.Decimal(0);
        const wasool = row?.wasool ?? new Prisma.Decimal(0);
        return {
          memberId: member.id,
          name: member.name,
          officeId: member.bookingOffice.id,
          officeName: member.bookingOffice.name,
          officeType: member.bookingOffice.type,
          totalEarning: toNumber(earning),
          wasool: toNumber(wasool),
          due: toNumber(earning.minus(wasool)),
          adminId: member.adminId,
        };
      }),
    });
  } catch (error) {
    return serverError(error);
  }
}
