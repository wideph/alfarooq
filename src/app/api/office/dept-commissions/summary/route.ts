import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { forbidden, guardOffice, serverError } from "@/lib/office/guard";
import { dec, toNumber } from "@/lib/office/money";
import { DEPT_COMMISSION_TYPE } from "@/lib/office/dept-commission";

export const preferredRegion = ["sin1"];

// F4 — per dept-user commission rollup (admin/cashier only):
//   earned    = net DEPT_COMMISSION entries (CREDIT − DEBIT) for the adminId
//   paid      = PAYOUT DEBIT entries carrying that adminId
//   remaining = earned − paid
// Only users with earned > 0 OR paid > 0 OR any rule defined are listed.
export async function GET() {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (!hasPermission(session, "office:ledger:read")) return forbidden();

  try {
    const [ledgerRows, ruleRows] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: {
          adminId: { not: null },
          OR: [{ type: DEPT_COMMISSION_TYPE }, { type: "PAYOUT", direction: "DEBIT" }],
        },
        select: { adminId: true, type: true, direction: true, amount: true },
      }),
      prisma.departmentCommissionRule.findMany({ select: { adminId: true } }),
    ]);

    const earnedBy = new Map<string, ReturnType<typeof dec>>();
    const paidBy = new Map<string, ReturnType<typeof dec>>();
    const ruleAdminIds = new Set<string>(ruleRows.map((row) => row.adminId));
    const adminIds = new Set<string>(ruleAdminIds);

    for (const row of ledgerRows) {
      if (!row.adminId) continue;
      adminIds.add(row.adminId);
      if (row.type === DEPT_COMMISSION_TYPE) {
        const current = earnedBy.get(row.adminId) ?? dec(0);
        earnedBy.set(
          row.adminId,
          row.direction === "CREDIT" ? current.plus(row.amount) : current.minus(row.amount)
        );
      } else {
        paidBy.set(row.adminId, (paidBy.get(row.adminId) ?? dec(0)).plus(row.amount));
      }
    }

    const totals = [...adminIds]
      .map((adminId) => {
        const earned = earnedBy.get(adminId) ?? dec(0);
        const paid = paidBy.get(adminId) ?? dec(0);
        return { adminId, earned, paid, remaining: earned.minus(paid) };
      })
      .filter(
        (row) =>
          row.earned.greaterThan(0) || row.paid.greaterThan(0) || ruleAdminIds.has(row.adminId)
      );

    const admins = totals.length
      ? await prisma.admin.findMany({
          where: { id: { in: totals.map((row) => row.adminId) } },
          select: { id: true, name: true, role: true },
        })
      : [];
    const adminById = new Map(admins.map((admin) => [admin.id, admin]));

    const users = totals
      .map((row) => ({
        adminId: row.adminId,
        name: adminById.get(row.adminId)?.name ?? null,
        role: adminById.get(row.adminId)?.role ?? null,
        earned: toNumber(row.earned),
        paid: toNumber(row.paid),
        remaining: toNumber(row.remaining),
      }))
      .sort((a, b) => b.remaining - a.remaining);

    return NextResponse.json({ ok: true, users });
  } catch (error) {
    return serverError(error);
  }
}
