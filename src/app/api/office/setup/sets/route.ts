import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardOffice, serverError } from "@/lib/office/guard";
import { toJson } from "@/lib/office/serializers";
import { dimmedSetNames } from "@/lib/office/rnumber";

// Sets of a category with their ordered steps. When ?rollNumber= is given, each
// set also carries {dimmed, reason} per the r-number suffix rules (§N5).
export async function GET(request: NextRequest) {
  const { denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  try {
    const { searchParams } = new URL(request.url);
    const categoryId = searchParams.get("categoryId") || "";
    const rollNumber = searchParams.get("rollNumber");

    const category = categoryId
      ? await prisma.caseCategory.findUnique({ where: { id: categoryId }, select: { name: true } })
      : null;

    const sets = await prisma.categorySet.findMany({
      where: {
        isActive: true,
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: { steps: { orderBy: { order: "asc" } } },
    });

    const withDim = rollNumber
      ? dimmedSetNames(category?.name, rollNumber, sets)
      : sets.map((set) => ({ ...set, dimmed: false, reason: null }));

    return NextResponse.json(toJson(withDim));
  } catch (error) {
    return serverError(error);
  }
}
