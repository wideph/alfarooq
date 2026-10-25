import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hasPermission, parsePermissions } from "@/lib/auth";
import { forbidden, guardOffice, serverError } from "@/lib/office/guard";
import { deptCommissionKindsOf } from "@/lib/office/dept-commission";

export const preferredRegion = ["sin1"];

// §W30 — tamam department commission users (printing / attestation-dept /
// courier — role ya explicit permission), chahe woh kisi booking office se
// jure hon ya nahi. Pehle setup ka "Department commission rates" panel sirf
// booking office ke users dikhata tha — office ke baghair bana dept user
// (maslan "attestation" role + printing/attestation/courier permissions)
// wahan aata hi nahi tha, is liye us ka commission set hi nahi ho sakta tha.
// Har user ke kinds (kaun se kaam karta hai) + kitne rules set hain.
export async function GET() {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  if (!hasPermission(session, "office:ledger:read")) return forbidden();

  try {
    const [admins, ruleCounts, settings] = await Promise.all([
      prisma.admin.findMany({
        where: { role: { not: "admin" } },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          permissions: true,
          isActive: true,
          bookingOffice: { select: { id: true, name: true } },
        },
        orderBy: [{ isActive: "desc" }, { name: "asc" }],
      }),
      prisma.departmentCommissionRule.groupBy({ by: ["adminId"], _count: { _all: true } }),
      // §W31: courier ki ek raqam alag table mein.
      prisma.departmentCommissionSetting.findMany({ select: { adminId: true, courierAmount: true } }),
    ]);
    const rulesBy = new Map(ruleCounts.map((row) => [row.adminId, row._count._all]));
    const courierBy = new Map(settings.map((row) => [row.adminId, Number(row.courierAmount)]));

    const users = admins
      .map((admin) => ({
        id: admin.id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        isActive: admin.isActive,
        officeName: admin.bookingOffice?.name ?? null,
        kinds: deptCommissionKindsOf(admin.role, parsePermissions(admin.permissions)),
        ruleCount: rulesBy.get(admin.id) ?? 0,
        courierAmount: courierBy.get(admin.id) ?? 0,
        // Koi bhi commission set hai? (printing / attestation rule ya courier)
        configured: (rulesBy.get(admin.id) ?? 0) > 0 || (courierBy.get(admin.id) ?? 0) > 0,
      }))
      .filter((user) => user.kinds.length > 0);

    return NextResponse.json({ ok: true, users });
  } catch (error) {
    return serverError(error);
  }
}
