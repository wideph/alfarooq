import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { forbidden, guardOffice, serverError } from "@/lib/office/guard";
import { toJson } from "@/lib/office/serializers";
import { hasAnyDeptCommissionPermission } from "@/lib/office/dept-commission";

export const preferredRegion = ["sin1"];

const STATUSES = ["PENDING", "ACCEPTED", "REJECTED"] as const;

// §W52 — GET ?status=PENDING|ACCEPTED|REJECTED — department kharchon ka review.
// Super admin: sab users ke (Payments → "Department kharche"); dept user sirf
// apne. Har row ke saath user ka naam / role aur courier kharche par case ki
// pehchan (student, Roll / Reg, office). `counts` = har status ki ginti (tabs).
export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  const isAdmin = session.role === "admin";
  if (!isAdmin && !hasAnyDeptCommissionPermission(session)) return forbidden();

  const searchParams = new URL(request.url).searchParams;
  const raw = (searchParams.get("status") || "PENDING").toUpperCase();
  const status = (STATUSES as readonly string[]).includes(raw) ? raw : "PENDING";
  const scope: Prisma.DeptExpenseRequestWhereInput = isAdmin ? {} : { adminId: session.adminId };

  try {
    // ?countOnly=1 — sirf ginti (Payments page ke sub-tab ka badge).
    if (searchParams.get("countOnly") === "1") {
      const pending = await prisma.deptExpenseRequest.count({ where: { ...scope, status: "PENDING" } });
      return NextResponse.json({ ok: true, counts: { PENDING: pending } });
    }

    const [items, grouped] = await Promise.all([
      prisma.deptExpenseRequest.findMany({
        where: { ...scope, status },
        // Review baqi: purane pehle (pehle aaya pehle dekho); baqi: naye pehle.
        orderBy: { createdAt: status === "PENDING" ? "asc" : "desc" },
        take: status === "PENDING" ? 300 : 100,
      }),
      prisma.deptExpenseRequest.groupBy({ by: ["status"], where: scope, _count: { _all: true } }),
    ]);

    const adminIds = [...new Set(items.flatMap((row) => [row.adminId, row.decidedById]))].filter(
      (id): id is string => Boolean(id)
    );
    const caseIds = [...new Set(items.map((row) => row.caseId))].filter((id): id is string => Boolean(id));
    const [admins, cases] = await Promise.all([
      adminIds.length
        ? prisma.admin.findMany({ where: { id: { in: adminIds } }, select: { id: true, name: true, role: true } })
        : [],
      caseIds.length
        ? prisma.case.findMany({
            where: { id: { in: caseIds } },
            select: {
              id: true,
              caseNumber: true,
              clientName: true,
              rollNumber: true,
              registrationNumber: true,
              expenseDeductPercent: true,
              bookingOffice: { select: { name: true, type: true } },
            },
          })
        : [],
    ]);
    const adminById = new Map(admins.map((admin) => [admin.id, admin]));
    const caseById = new Map(cases.map((item) => [item.id, item]));

    const counts = { PENDING: 0, ACCEPTED: 0, REJECTED: 0 };
    for (const row of grouped) {
      if (row.status in counts) counts[row.status as keyof typeof counts] = row._count._all;
    }

    return NextResponse.json(
      toJson({
        ok: true,
        counts,
        items: items.map((row) => {
          const item = row.caseId ? caseById.get(row.caseId) : null;
          return {
            id: row.id,
            kind: row.kind,
            amount: row.amount,
            requestedAmount: row.requestedAmount,
            description: row.description,
            expenseDate: row.expenseDate,
            status: row.status,
            decisionNote: row.decisionNote,
            createdAt: row.createdAt,
            decidedAt: row.decidedAt,
            userId: row.adminId,
            userName: adminById.get(row.adminId)?.name ?? null,
            userRole: adminById.get(row.adminId)?.role ?? null,
            decidedByName: row.decidedById ? adminById.get(row.decidedById)?.name ?? null : null,
            caseId: row.caseId,
            caseNumber: item?.caseNumber ?? row.caseNumber,
            caseDeleted: Boolean(row.caseId) && !item,
            case: item
              ? {
                  clientName: item.clientName || null,
                  rollNumber: item.rollNumber,
                  registrationNumber: item.registrationNumber,
                  officeName: item.bookingOffice.name,
                  officeType: item.bookingOffice.type,
                  expenseDeductPercent: item.expenseDeductPercent,
                }
              : null,
          };
        }),
      })
    );
  } catch (error) {
    return serverError(error);
  }
}
