import { NextRequest, NextResponse, after } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { hasPermission } from "@/lib/auth";
import { badRequest, forbidden, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { parseAmount, round2, toNumber } from "@/lib/office/money";
import { toJson } from "@/lib/office/serializers";
import { getOfficeCategories, getOfficeCategorySets } from "@/lib/office/setup-cache";

export const preferredRegion = ["sin1"];

// ---------------------------------------------------------------------------
// F4 — department commission rules grid (DepartmentCommissionRule).
// GET  ?adminId= → that admin's rules with category/set names.
// PUT  { adminId, rules: [{ categoryId, setId?, printAmount, attestationAmount, courierAmount }] }
//      (§W30: courierAmount — courier slip se case DELIVERED hone par).
//      Rate badalna sirf AAGE ke events par lagta hai — pehle se credit hui
//      DEPT_COMMISSION ledger entries ko yahan koi nahi chhuta.
//      → replace that admin's ENTIRE grid in one transaction (upsert per row
//        by the (adminId, categoryId, setId) unique key; rows missing from the
//        payload are deleted). setId "" / omitted = category-level fallback row.
// ---------------------------------------------------------------------------

async function serializeRules(adminId: string) {
  const [rules, categories, sets] = await Promise.all([
    prisma.departmentCommissionRule.findMany({
      where: { adminId },
      orderBy: [{ categoryId: "asc" }, { setId: "asc" }],
    }),
    getOfficeCategories(),
    getOfficeCategorySets(),
  ]);
  const categoryNames = new Map(categories.map((row) => [row.id, row.name]));
  const setNames = new Map(sets.map((row) => [row.id, row.name]));
  return rules.map((rule) => ({
    categoryId: rule.categoryId,
    categoryName: categoryNames.get(rule.categoryId) ?? null,
    // setId "" = category-level fallback row → null in the API shape.
    setId: rule.setId || null,
    setName: rule.setId ? (setNames.get(rule.setId) ?? null) : null,
    printAmount: toNumber(rule.printAmount),
    attestationAmount: toNumber(rule.attestationAmount),
    courierAmount: toNumber(rule.courierAmount),
  }));
}

export async function GET(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  // Admin only (office:ledger:read covers super admin; cashier included).
  if (!hasPermission(session, "office:ledger:read")) return forbidden();

  const adminId = new URL(request.url).searchParams.get("adminId") || "";
  if (!adminId) return badRequest("adminId zaroori hai");

  try {
    return NextResponse.json(toJson({ ok: true, rules: await serializeRules(adminId) }));
  } catch (error) {
    return serverError(error);
  }
}

export async function PUT(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  // Grid mutation is super-admin only.
  if (session.role !== "admin") return forbidden("Rules sirf super admin badal sakta hai");

  try {
    const body = await request.json();
    const adminId = typeof body.adminId === "string" ? body.adminId : "";
    if (!adminId) return badRequest("adminId zaroori hai");
    const admin = await prisma.admin.findUnique({ where: { id: adminId }, select: { id: true } });
    if (!admin) return notFound("User nahi mila");

    const rows: unknown[] = Array.isArray(body.rules) ? body.rules : [];
    const [categories, sets] = await Promise.all([getOfficeCategories(), getOfficeCategorySets()]);
    const categoryIds = new Set(categories.map((row) => row.id));
    const setById = new Map(sets.map((row) => [row.id, row]));

    // Validate + normalize; dedupe by the (categoryId, setId) unique key.
    const normalized = new Map<
      string,
      {
        categoryId: string;
        setId: string;
        printAmount: Prisma.Decimal;
        attestationAmount: Prisma.Decimal;
        courierAmount: Prisma.Decimal;
      }
    >();
    for (const row of rows) {
      const input = row as {
        categoryId?: unknown;
        setId?: unknown;
        printAmount?: unknown;
        attestationAmount?: unknown;
        courierAmount?: unknown;
      };
      const categoryId = typeof input.categoryId === "string" ? input.categoryId.trim() : "";
      if (!categoryId || !categoryIds.has(categoryId)) return badRequest("Category nahi mili");
      const setId = typeof input.setId === "string" && input.setId.trim() ? input.setId.trim() : "";
      if (setId) {
        const set = setById.get(setId);
        if (!set) return badRequest("Set of Attestations nahi mila");
        if (set.categoryId !== categoryId) return badRequest("Set of Attestations is category ka nahi hai");
      }
      const printAmount = parseAmount(input.printAmount ?? 0);
      const attestationAmount = parseAmount(input.attestationAmount ?? 0);
      const courierAmount = parseAmount(input.courierAmount ?? 0);
      if (printAmount === null || attestationAmount === null || courierAmount === null) {
        return badRequest("Amounts 0 ya positive hone chahiye");
      }
      normalized.set(`${categoryId}:${setId}`, {
        categoryId,
        setId,
        printAmount: round2(printAmount),
        attestationAmount: round2(attestationAmount),
        courierAmount: round2(courierAmount),
      });
    }
    const desired = [...normalized.values()];

    const updated = await prisma.$transaction(async (tx) => {
      // Replace semantics: rows missing from the payload get deleted.
      await tx.departmentCommissionRule.deleteMany({
        where: {
          adminId,
          NOT: desired.length
            ? desired.map((row) => ({ categoryId: row.categoryId, setId: row.setId }))
            : undefined,
        },
      });
      for (const row of desired) {
        await tx.departmentCommissionRule.upsert({
          where: { adminId_categoryId_setId: { adminId, categoryId: row.categoryId, setId: row.setId } },
          create: {
            adminId,
            categoryId: row.categoryId,
            setId: row.setId,
            printAmount: row.printAmount,
            attestationAmount: row.attestationAmount,
            courierAmount: row.courierAmount,
          },
          update: {
            printAmount: row.printAmount,
            attestationAmount: row.attestationAmount,
            courierAmount: row.courierAmount,
          },
        });
      }
      return tx.departmentCommissionRule.findMany({ where: { adminId } });
    }, { maxWait: 10000, timeout: 30000 });

    after(async () => {
      await logOfficeAction(session, {
        action: "dept-commission.rules.update",
        entity: "DepartmentCommissionRule",
        entityId: adminId,
        after: { rules: updated },
      });
    });

    return NextResponse.json(toJson({ ok: true, rules: await serializeRules(adminId) }));
  } catch (error) {
    return serverError(error);
  }
}
