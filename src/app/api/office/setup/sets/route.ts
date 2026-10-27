import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, notFound, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { copyCategorySets } from "@/lib/office/category-sets";
import { toJson } from "@/lib/office/serializers";
import { dimmedSetNames } from "@/lib/office/rnumber";
import { getOfficeCategories, getOfficeCategorySets, revalidateOfficeSetup } from "@/lib/office/setup-cache";

export const preferredRegion = ["sin1"];

// Sets of Attestations of a category with their ordered steps. When
// ?rollNumber= is given, each set also carries {dimmed, reason} per the Roll
// Number suffix rules (§N5).
export async function GET(request: NextRequest) {
  const { denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId") || "";
    const rollNumber = searchParams.get("rollNumber");

    // §W20: dono reads cached (60s + tag invalidation); category/isActive
    // filters in-memory — order aur shape pehle jaisi hi.
    const [categories, allSets] = await Promise.all([
      categoryId ? getOfficeCategories() : Promise.resolve(null),
      getOfficeCategorySets(),
    ]);
    const category = categories?.find((row) => row.id === categoryId) ?? null;

    const sets = allSets.filter(
      (set) => set.isActive && (!categoryId || set.categoryId === categoryId)
    );

    const withDim = rollNumber
      ? dimmedSetNames(category?.name, rollNumber, sets)
      : sets.map((set) => ({ ...set, dimmed: false, reason: null }));

    return NextResponse.json(toJson(withDim));
  } catch (error) {
    return serverError(error);
  }
}

// §W42 — POST { fromCategoryId, toCategoryId }: ek category ke tamam active
// Sets of Attestations (steps samait) doosri category par copy (Setup →
// "Sets copy karein"). Target par usi naam ka set ho to skip. Dates ka formula
// steps se chalta hai, is liye copy wale sets ki dates bhi bilkul wahi.
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const body = (await request.json().catch(() => null)) as { fromCategoryId?: unknown; toCategoryId?: unknown } | null;
    const fromCategoryId = typeof body?.fromCategoryId === "string" ? body.fromCategoryId : "";
    const toCategoryId = typeof body?.toCategoryId === "string" ? body.toCategoryId : "";
    if (!fromCategoryId || !toCategoryId) return badRequest("Dono categories chunein");
    if (fromCategoryId === toCategoryId) return badRequest("Dono categories ek hi hain");
    const categories = await prisma.caseCategory.findMany({
      where: { id: { in: [fromCategoryId, toCategoryId] } },
      select: { id: true, name: true },
    });
    if (categories.length !== 2) return notFound("Category nahi mili");
    let result: { created: string[]; skipped: string[] };
    try {
      result = await prisma.$transaction((tx) => copyCategorySets({ fromCategoryId, toCategoryId }, tx), {
        maxWait: 10000,
        timeout: 30000,
      });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Sets copy nahi ho sake");
    }
    revalidateOfficeSetup();
    await logOfficeAction(session, {
      action: "category.sets.copy",
      entity: "CaseCategory",
      entityId: toCategoryId,
      after: {
        from: categories.find((category) => category.id === fromCategoryId)?.name,
        to: categories.find((category) => category.id === toCategoryId)?.name,
        ...result,
      },
    });
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return serverError(error);
  }
}
