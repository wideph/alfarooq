import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { guardOffice, serverError } from "@/lib/office/guard";
import { dec, sum, toNumber } from "@/lib/office/money";

export const preferredRegion = ["sin1"];

// Member due ke earning types — finance/users routes ke sync mein rakhein
// (route files shared constants export nahi kar sakte).
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

// Per-office overview for /office (W16). Booking office users only see their
// own office and money-wise SIRF apna due (duesTotal = ownDue); cashier /
// super admin see everything. Member due formula same as
// /api/office/finance/users: due = earning − expenseShare − wasool.
export async function GET() {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  try {
    const isAdmin = session.role === "admin";
    const isBookingOffice = session.role === "booking_office";

    // §W20: offices list aur viewer ka apna member record independent hain —
    // ek hi batch mein (pehle ownMember doosre batch ka hissa tha jabke wo
    // officeIds par depend nahi karta → 1 extra round-trip).
    const [offices, ownMember] = await Promise.all([
      prisma.bookingOffice.findMany({
        where: isBookingOffice
          ? { id: session.bookingOfficeId || "__none__" }
          : { isActive: true },
        select: {
          id: true,
          name: true,
          type: true,
          _count: { select: { members: { where: { isActive: true } } } },
        },
        orderBy: { name: "asc" },
      }),
      // Viewer ka apna member record (due ke liye); admin ka aksar nahi hota.
      prisma.bookingOfficeMember.findUnique({
        where: { adminId: session.adminId },
        select: { id: true, bookingOfficeId: true },
      }),
    ]);
    const officeIds = offices.map((office) => office.id);

    const [statusGroups, caseRows, members, ledgerGroups] = await Promise.all([
      prisma.case.groupBy({
        by: ["bookingOfficeId", "status"],
        where: { bookingOfficeId: { in: officeIds } },
        _count: { _all: true },
      }),
      // Pending payments + received totals: per case, RECEIVED payments ka
      // sum vs agreedAmount (computeTotals wala established formula).
      prisma.case.findMany({
        where: { bookingOfficeId: { in: officeIds } },
        select: {
          bookingOfficeId: true,
          agreedAmount: true,
          payments: { where: { status: "RECEIVED" }, select: { amount: true } },
        },
      }),
      prisma.bookingOfficeMember.findMany({
        where: { bookingOfficeId: { in: officeIds }, isActive: true },
        select: { id: true, bookingOfficeId: true },
      }),
      // ONE grouped ledger query → per-member earning/expenseShare/wasool.
      prisma.ledgerEntry.groupBy({
        by: ["memberId", "type", "direction"],
        where: { bookingOfficeId: { in: officeIds }, memberId: { not: null } },
        _sum: { amount: true },
      }),
    ]);

    // -- Per-member money buckets ------------------------------------------
    const moneyByMember = new Map<string, MemberTotals>();
    for (const row of ledgerGroups) {
      if (!row.memberId) continue;
      const amount = row._sum.amount || new Prisma.Decimal(0);
      let target = moneyByMember.get(row.memberId);
      if (!target) {
        target = newBucket();
        moneyByMember.set(row.memberId, target);
      }
      if (EARNING_TYPES.includes(row.type)) {
        target.earning = row.direction === "CREDIT" ? target.earning.plus(amount) : target.earning.minus(amount);
      } else if (row.direction === "DEBIT" && row.type === "EXPENSE") {
        target.expenseShare = target.expenseShare.plus(amount);
      } else if (row.direction === "DEBIT" && row.type === "PAYOUT") {
        target.wasool = target.wasool.plus(amount);
      }
    }
    const memberDue = (memberId: string): Prisma.Decimal => {
      const row = moneyByMember.get(memberId) ?? newBucket();
      return row.earning.minus(row.expenseShare).minus(row.wasool);
    };

    // -- Per-office aggregates ---------------------------------------------
    const perOffice = new Map<
      string,
      {
        casesTotal: number;
        statusCounts: Record<string, number>;
        pendingPaymentsCount: number;
        pendingPaymentsAmount: Prisma.Decimal;
        receivedTotal: Prisma.Decimal;
        duesTotal: Prisma.Decimal;
      }
    >();
    const bucketOf = (officeId: string) => {
      let bucket = perOffice.get(officeId);
      if (!bucket) {
        bucket = {
          casesTotal: 0,
          statusCounts: {},
          pendingPaymentsCount: 0,
          pendingPaymentsAmount: new Prisma.Decimal(0),
          receivedTotal: new Prisma.Decimal(0),
          duesTotal: new Prisma.Decimal(0),
        };
        perOffice.set(officeId, bucket);
      }
      return bucket;
    };

    for (const row of statusGroups) {
      const bucket = bucketOf(row.bookingOfficeId);
      bucket.casesTotal += row._count._all;
      bucket.statusCounts[row.status] = row._count._all;
    }

    for (const item of caseRows) {
      const bucket = bucketOf(item.bookingOfficeId);
      const received = sum(item.payments.map((payment) => payment.amount));
      const agreed = dec(item.agreedAmount);
      bucket.receivedTotal = bucket.receivedTotal.plus(received);
      if (received.lessThan(agreed)) {
        bucket.pendingPaymentsCount += 1;
        bucket.pendingPaymentsAmount = bucket.pendingPaymentsAmount.plus(agreed.minus(received));
      }
    }

    for (const member of members) {
      const bucket = bucketOf(member.bookingOfficeId);
      bucket.duesTotal = bucket.duesTotal.plus(memberDue(member.id));
    }

    // Viewer ka apna due (0 jab koi member record nahi — e.g. admin).
    const ownDue = ownMember ? memberDue(ownMember.id) : new Prisma.Decimal(0);

    const rows = offices.map((office) => {
      const bucket = bucketOf(office.id);
      const officeOwnDue =
        ownMember && ownMember.bookingOfficeId === office.id ? ownDue : new Prisma.Decimal(0);
      return {
        id: office.id,
        name: office.name,
        type: office.type,
        memberCount: office._count.members,
        casesTotal: bucket.casesTotal,
        statusCounts: bucket.statusCounts,
        pendingPaymentsCount: bucket.pendingPaymentsCount,
        pendingPaymentsAmount: toNumber(bucket.pendingPaymentsAmount),
        receivedTotal: toNumber(bucket.receivedTotal),
        // booking_office viewer ko dusre members ka money data NAHI — office
        // duesTotal us ka apna due hai.
        duesTotal: toNumber(isBookingOffice ? officeOwnDue : bucket.duesTotal),
        ownDue: toNumber(officeOwnDue),
      };
    });

    const totalOf = (pick: (row: (typeof rows)[number]) => number) =>
      rows.reduce((acc, row) => acc + pick(row), 0);

    return NextResponse.json({
      ok: true,
      viewer: { isAdmin },
      offices: rows,
      totals: {
        offices: offices.length,
        casesTotal: totalOf((row) => row.casesTotal),
        pendingPaymentsAmount: totalOf((row) => row.pendingPaymentsAmount),
        receivedTotal: totalOf((row) => row.receivedTotal),
        duesTotal: totalOf((row) => row.duesTotal),
      },
    });
  } catch (error) {
    return serverError(error);
  }
}
