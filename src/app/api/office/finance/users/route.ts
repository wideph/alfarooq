import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { forbidden, guardOffice, serverError } from "@/lib/office/guard";
import { toNumber } from "@/lib/office/money";

export const preferredRegion = ["sin1"];

// §W12.3/W16 — Finance page users table: booking-office members with EARNING
// (net credits of share types), EXPENSE SHARE (EXPENSE debits — office general
// expenses ka member-wise hissa), WASOOL (PAYOUT debits) and
// DUE = earning − expenseShare − wasool. Salaries are separate — only PAYOUT
// counts as wasool.
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

type MemberTotals = {
  earning: Prisma.Decimal;
  expenseShare: Prisma.Decimal;
  wasool: Prisma.Decimal;
};

function newBucket(): MemberTotals {
  return {
    earning: new Prisma.Decimal(0),
    expenseShare: new Prisma.Decimal(0),
    wasool: new Prisma.Decimal(0),
  };
}

export async function GET() {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  // admin / office:ledger:read → sab members; booking_office without that
  // permission → SIRF apna member record (dusre members ka money data kabhi
  // nahi). Baqi roles ko ye endpoint allowed nahi.
  const canSeeAll = hasPermission(session, "office:ledger:read");
  const isRestrictedBooking = session.role === "booking_office" && !canSeeAll;
  if (!canSeeAll && !isRestrictedBooking) return forbidden();

  try {
    // Restricted viewer: apna member record (adminId link + apni office).
    let ownMemberId: string | null = null;
    if (isRestrictedBooking) {
      const ownMember = await prisma.bookingOfficeMember.findFirst({
        where: {
          adminId: session.adminId,
          bookingOfficeId: session.bookingOfficeId || "__none__",
        },
        select: { id: true },
      });
      if (!ownMember) {
        return NextResponse.json({
          ok: true,
          rows: [],
          totals: { earning: 0, expenseShare: 0, wasool: 0, due: 0 },
        });
      }
      ownMemberId = ownMember.id;
    }

    const members = await prisma.bookingOfficeMember.findMany({
      where: ownMemberId ? { id: ownMemberId } : { isActive: true },
      select: {
        id: true,
        name: true,
        profitPercent: true,
        admin: { select: { name: true } },
        bookingOffice: { select: { id: true, name: true, type: true } },
      },
      orderBy: [{ bookingOffice: { name: "asc" } }, { name: "asc" }],
    });

    // ONE grouped query over the ledger; balances computed in JS.
    const sums = await prisma.ledgerEntry.groupBy({
      by: ["memberId", "type", "direction"],
      where: { memberId: { in: members.map((member) => member.id) } },
      _sum: { amount: true },
    });

    const totals = new Map<string, MemberTotals>();
    for (const row of sums) {
      if (!row.memberId) continue;
      const amount = row._sum.amount || new Prisma.Decimal(0);
      let target = totals.get(row.memberId);
      if (!target) {
        target = newBucket();
        totals.set(row.memberId, target);
      }
      if (EARNING_TYPES.includes(row.type)) {
        // Net earning: credits minus downward adjustments (ADJUSTMENT debits).
        target.earning = row.direction === "CREDIT" ? target.earning.plus(amount) : target.earning.minus(amount);
      } else if (row.direction === "DEBIT" && row.type === "EXPENSE") {
        target.expenseShare = target.expenseShare.plus(amount);
      } else if (row.direction === "DEBIT" && row.type === "PAYOUT") {
        target.wasool = target.wasool.plus(amount);
      }
    }

    const rows = members.map((member) => {
      const row = totals.get(member.id) ?? newBucket();
      return {
        memberId: member.id,
        memberName: member.name,
        userName: member.admin?.name ?? member.name,
        officeId: member.bookingOffice.id,
        officeName: member.bookingOffice.name,
        officeType: member.bookingOffice.type,
        percent: toNumber(member.profitPercent),
        earning: toNumber(row.earning),
        expenseShare: toNumber(row.expenseShare),
        wasool: toNumber(row.wasool),
        due: toNumber(row.earning.minus(row.expenseShare).minus(row.wasool)),
      };
    });

    const zero = () => new Prisma.Decimal(0);
    const grand = rows.reduce(
      (acc, row) => ({
        earning: acc.earning.plus(row.earning),
        expenseShare: acc.expenseShare.plus(row.expenseShare),
        wasool: acc.wasool.plus(row.wasool),
        due: acc.due.plus(row.due),
      }),
      { earning: zero(), expenseShare: zero(), wasool: zero(), due: zero() }
    );

    return NextResponse.json({
      ok: true,
      rows,
      totals: {
        earning: toNumber(grand.earning),
        expenseShare: toNumber(grand.expenseShare),
        wasool: toNumber(grand.wasool),
        due: toNumber(grand.due),
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
