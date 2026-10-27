import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

// §W42 — ek category ke Sets of Attestations (naam, order, steps — stepKey /
// label / order) doosri category par copy. Sets pehle sirf seed script se bante
// the; Setup se nayi category (maslan "Medical Bmfq 2Y") banti to us par koi set
// hi nahi hota tha aur case par "Set of Attestations" dikhta hi nahi tha. Date
// engine stepKeys par chalta hai (BMFQ_VERIFICATION → medical formula), is liye
// same steps = same dates ka formula. Target par usi naam ka set ho to skip.
export async function copyCategorySets(
  input: { fromCategoryId: string; toCategoryId: string },
  db: Db = prisma
): Promise<{ created: string[]; skipped: string[] }> {
  if (input.fromCategoryId === input.toCategoryId) throw new Error("Dono categories ek hi hain");
  const [source, target] = await Promise.all([
    db.categorySet.findMany({
      where: { categoryId: input.fromCategoryId, isActive: true },
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: { steps: { orderBy: { order: "asc" } } },
    }),
    db.categorySet.findMany({ where: { categoryId: input.toCategoryId }, select: { name: true } }),
  ]);
  if (source.length === 0) throw new Error("Jis category se copy karna hai us par koi set nahi");
  const existing = new Set(target.map((set) => set.name));
  const created: string[] = [];
  const skipped: string[] = [];
  for (const set of source) {
    if (existing.has(set.name)) {
      skipped.push(set.name);
      continue;
    }
    await db.categorySet.create({
      data: {
        categoryId: input.toCategoryId,
        name: set.name,
        order: set.order,
        isActive: true,
        steps: { create: set.steps.map((step) => ({ stepKey: step.stepKey, label: step.label, order: step.order })) },
      },
    });
    created.push(set.name);
  }
  return { created, skipped };
}
