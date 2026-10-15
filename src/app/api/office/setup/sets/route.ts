import { NextRequest, NextResponse } from "next/server";
import { guardOffice, serverError } from "@/lib/office/guard";
import { toJson } from "@/lib/office/serializers";
import { dimmedSetNames } from "@/lib/office/rnumber";
import { getOfficeCategories, getOfficeCategorySets } from "@/lib/office/setup-cache";

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
