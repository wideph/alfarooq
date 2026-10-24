import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission, parsePermissions } from "@/lib/auth";
import { forbidden, guardOffice, serverError } from "@/lib/office/guard";
import { dec, toNumber } from "@/lib/office/money";
import {
  DEPT_COMMISSION_TYPE,
  deptCommissionKindsOf,
  hasAnyDeptCommissionPermission,
} from "@/lib/office/dept-commission";

export const preferredRegion = ["sin1"];

// F4 — per dept-user commission rollup (admin/cashier only):
//   earned    = net DEPT_COMMISSION entries (CREDIT − DEBIT) for the adminId
//   paid      = PAYOUT DEBIT entries carrying that adminId
//   remaining = earned − paid
// Listed: earned > 0 OR paid > 0 OR any rule OR (§W30) koi bhi dept user.
// §F22.3: office:ledger:read NA ho magar printing / attestation-dept write ho
// to dept user SIRF apni row dekh sakta hai (self-scoped response).
export async function GET() {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const fullAccess = hasPermission(session, "office:ledger:read");
  // §W30: courier dept user bhi apni row dekhe.
  const selfOnly = !fullAccess && hasAnyDeptCommissionPermission(session);
  if (!fullAccess && !selfOnly) return forbidden();

  try {
    const [ledgerRows, ruleRows, deptAdmins] = await Promise.all([
      prisma.ledgerEntry.findMany({
        where: {
          adminId: { not: null },
          OR: [{ type: DEPT_COMMISSION_TYPE }, { type: "PAYOUT", direction: "DEBIT" }],
        },
        select: { adminId: true, type: true, direction: true, amount: true },
      }),
      prisma.departmentCommissionRule.findMany({ select: { adminId: true } }),
      // §W30: har department user (printing / attestation-dept / courier) list
      // mein rahe — commission abhi 0 ho tab bhi (admin dekh sake ke kaun kaun
      // dept ka kaam karta hai; dept user ko apna 0 wala account dikhe).
      prisma.admin.findMany({
        where: { role: { not: "admin" } },
        select: { id: true, role: true, permissions: true },
      }),
    ]);

    const earnedBy = new Map<string, ReturnType<typeof dec>>();
    const paidBy = new Map<string, ReturnType<typeof dec>>();
    const ruleAdminIds = new Set<string>(ruleRows.map((row) => row.adminId));
    const deptUserIds = new Set(
      deptAdmins
        .filter((admin) => deptCommissionKindsOf(admin.role, parsePermissions(admin.permissions)).length > 0)
        .map((admin) => admin.id)
    );
    const adminIds = new Set<string>([...ruleAdminIds, ...deptUserIds]);

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
          row.earned.greaterThan(0) ||
          row.paid.greaterThan(0) ||
          ruleAdminIds.has(row.adminId) ||
          deptUserIds.has(row.adminId)
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

    // §F22.3: self-scoped dept user ko sirf apni row (empty array agar koi
    // earning/payout/rule nahi).
    const visible = selfOnly ? users.filter((row) => row.adminId === session.adminId) : users;

    return NextResponse.json({ ok: true, users: visible });
  } catch (error) {
    return serverError(error);
  }
}
