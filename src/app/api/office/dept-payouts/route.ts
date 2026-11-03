import { NextRequest, NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission, parsePermissions } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { notifyUsers } from "@/lib/office/notifications";
import { parseAmount, toNumber } from "@/lib/office/money";
import { PAYMENT_METHODS, type PaymentMethod } from "@/lib/office/permissions";
import { cleanText, parseDateOnly, todayPakistan, toJson } from "@/lib/office/serializers";
import { deptCommissionKindsOf, hasAnyDeptCommissionPermission } from "@/lib/office/dept-commission";
import { DEPT_PAYOUT_STATUSES, deptExpenseTotals, isDeptPayoutKind } from "@/lib/office/dept-expenses";
import { DEPT_PAYOUT_KIND_LABELS } from "@/lib/office/labels";

export const preferredRegion = ["sin1"];

// §W51 — department user ko payment REQUEST (commission / courier kharcha /
// other kharcha — teeno alag). Yahan sirf PENDING request banti hai; user
// /api/office/dept-payouts/[id] par accept kare tab paid (commission ki
// PAYOUT ledger row bhi tabhi).

// GET ?status=&adminId= — admin / cashier (office:ledger:read) sab; dept user
// sirf apni.
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const fullAccess = hasPermission(session, "office:ledger:read");
  if (!fullAccess && !hasAnyDeptCommissionPermission(session)) return forbidden();

  const { searchParams } = new URL(request.url);
  const where: Prisma.DeptPayoutRequestWhereInput = {};
  const status = (searchParams.get("status") || "").toUpperCase();
  if ((DEPT_PAYOUT_STATUSES as readonly string[]).includes(status)) where.status = status;
  where.adminId = fullAccess ? searchParams.get("adminId") || undefined : session.adminId;

  try {
    const items = await prisma.deptPayoutRequest.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
    const ids = [...new Set(items.flatMap((row) => [row.adminId, row.createdById, row.decidedById]))].filter(
      (id): id is string => Boolean(id)
    );
    const admins = ids.length
      ? await prisma.admin.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })
      : [];
    const names = Object.fromEntries(admins.map((admin) => [admin.id, admin.name]));
    return NextResponse.json(
      toJson(
        items.map((row) => ({
          ...row,
          userName: names[row.adminId] || null,
          createdByName: names[row.createdById] || null,
          decidedByName: row.decidedById ? names[row.decidedById] || null : null,
        }))
      )
    );
  } catch (error) {
    return serverError(error);
  }
}

// POST { adminId, kind, amount, method?, entryDate, remarks? } (office:ledger:write)
// → PENDING + user ko notification. §W54: koi had nahi — commission ki tarah
// kharchon ki wapsi bhi advance mein (baqi minus) ho sakti hai.
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:ledger:write");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const adminId = typeof body.adminId === "string" ? body.adminId : "";
    const user = adminId
      ? await prisma.admin.findUnique({ where: { id: adminId }, select: { id: true, name: true, role: true, permissions: true } })
      : null;
    if (!user) return notFound("User nahi mila");
    if (user.role === "admin") return badRequest("Super admin ko payment request nahi bheji ja sakti");

    const kind = typeof body.kind === "string" ? body.kind.toUpperCase() : "";
    if (!isDeptPayoutKind(kind)) return badRequest("Payment ki qism sahi nahi hai");
    const amount = parseAmount(body.amount, { allowZero: false });
    if (amount === null) return badRequest("Amount sahi nahi hai (0 se zyada)");
    const method = String(body.method || "CASH").toUpperCase() as PaymentMethod;
    if (!PAYMENT_METHODS.includes(method)) return badRequest("Method sahi nahi hai");
    const entryDate = parseDateOnly(body.entryDate) ?? todayPakistan();
    const remarks = cleanText(body.remarks, 500);

    // §W54: teeno qismon mein advance mumkin (baqi se zyada → user ka hisaab
    // minus). Sirf ye pakka ke user department ka hai (ya pehle se hisaab hai).
    if (deptCommissionKindsOf(user.role, parsePermissions(user.permissions)).length === 0) {
      const [earned, totals] = await Promise.all([
        prisma.ledgerEntry.count({ where: { adminId, type: "DEPT_COMMISSION" } }),
        deptExpenseTotals([adminId]),
      ]);
      if (earned === 0 && !totals.has(adminId)) return badRequest("Ye department user nahi hai");
    }

    const payout = await prisma.deptPayoutRequest.create({
      data: { adminId, kind, amount, method, entryDate, remarks, status: "PENDING", createdById: session.adminId },
    });

    after(async () => {
      await logOfficeAction(session, {
        action: "dept-payout.request",
        entity: "DeptPayoutRequest",
        entityId: payout.id,
        after: { ...payout, userName: user.name },
      });
      await notifyUsers([adminId], {
        type: "request",
        title: `${DEPT_PAYOUT_KIND_LABELS[kind]} ki payment: Rs ${toNumber(amount).toLocaleString("en-PK")} — accept karein`,
        body: remarks,
        link: "/office/finance",
      });
    });

    return NextResponse.json(toJson(payout), { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
