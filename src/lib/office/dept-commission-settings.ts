import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parseAmount, round2, toNumber } from "@/lib/office/money";

// §W31 — department commission ka SEEDHA form (owner: purana row/dropdown grid
// confusing aur mehnat talab tha):
//   printing    — har case category ki ek raqam
//   attestation — har Set of Attestations ki ek raqam (category ke neeche);
//                 jis category ka koi set nahi us ki ek category-level raqam
//   courier     — har delivered case ki ek raqam (category se azad)
// Storage: DepartmentCommissionRule (category row: printAmount + bina-set
// attestationAmount; set row: attestationAmount) + DepartmentCommissionSetting
// (courierAmount). Khali / 0 = commission 0. Save sirf aage ke events par
// lagta hai — pehle se credit hui ledger entries ko koi nahi chhuta.

type Db = Prisma.TransactionClient | typeof prisma;

export type DeptCommissionForm = {
  printing: Array<{ categoryId: string; categoryName: string; isActive: boolean; amount: number }>;
  attestation: Array<{
    categoryId: string;
    categoryName: string;
    isActive: boolean;
    // Koi set nahi → categoryAmount input dikhta hai (bina set wale cases).
    categoryAmount: number;
    sets: Array<{ setId: string; setName: string; isActive: boolean; amount: number }>;
  }>;
  courierAmount: number;
};

export type DeptCommissionFormInput = {
  printing?: Array<{ categoryId?: unknown; amount?: unknown }>;
  attestation?: Array<{ categoryId?: unknown; setId?: unknown; amount?: unknown }>;
  courierAmount?: unknown;
};

export async function loadDeptCommissionForm(adminId: string, db: Db = prisma): Promise<DeptCommissionForm> {
  const [categories, sets, rules, setting] = await Promise.all([
    db.caseCategory.findMany({ orderBy: [{ order: "asc" }, { name: "asc" }], select: { id: true, name: true, isActive: true } }),
    db.categorySet.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      select: { id: true, name: true, categoryId: true, isActive: true },
    }),
    db.departmentCommissionRule.findMany({ where: { adminId } }),
    db.departmentCommissionSetting.findUnique({ where: { adminId } }),
  ]);
  const categoryRow = new Map(rules.filter((rule) => rule.setId === "").map((rule) => [rule.categoryId, rule]));
  const setRow = new Map(rules.filter((rule) => rule.setId !== "").map((rule) => [rule.setId, rule]));

  // Inactive category / set sirf tab jab us par pehle se raqam ho.
  const printing = categories
    .map((category) => ({
      categoryId: category.id,
      categoryName: category.name,
      isActive: category.isActive,
      amount: toNumber(categoryRow.get(category.id)?.printAmount ?? 0),
    }))
    .filter((row) => row.isActive || row.amount > 0);

  const attestation = categories
    .map((category) => {
      const categorySets = sets
        .filter((set) => set.categoryId === category.id)
        .map((set) => ({
          setId: set.id,
          setName: set.name,
          isActive: set.isActive,
          amount: toNumber(setRow.get(set.id)?.attestationAmount ?? 0),
        }))
        .filter((row) => row.isActive || row.amount > 0);
      return {
        categoryId: category.id,
        categoryName: category.name,
        isActive: category.isActive,
        categoryAmount: toNumber(categoryRow.get(category.id)?.attestationAmount ?? 0),
        sets: categorySets,
      };
    })
    .filter((row) => row.isActive || row.categoryAmount > 0 || row.sets.some((set) => set.amount > 0));

  return { printing, attestation, courierAmount: toNumber(setting?.courierAmount ?? 0) };
}

export class DeptCommissionInputError extends Error {}

// Replace semantics (is user ke liye): bheji gayi raqamen hi rehti hain; jo
// category / set na bheja ya 0 → rule hat jata hai (= commission 0).
export async function saveDeptCommissionForm(
  adminId: string,
  input: DeptCommissionFormInput,
  db: Db = prisma
): Promise<DeptCommissionForm> {
  const amountOf = (value: unknown) => {
    const parsed = parseAmount(value === "" || value === null || value === undefined ? 0 : value);
    if (parsed === null) throw new DeptCommissionInputError("Commission 0 ya positive raqam honi chahiye");
    return round2(parsed);
  };

  const [categories, sets] = await Promise.all([
    db.caseCategory.findMany({ select: { id: true } }),
    db.categorySet.findMany({ select: { id: true, categoryId: true } }),
  ]);
  const categoryIds = new Set(categories.map((row) => row.id));
  const setById = new Map(sets.map((row) => [row.id, row]));

  // categoryId → { print, attestation (bina set) }, setId → attestation
  const categoryAmounts = new Map<string, { print: Prisma.Decimal; attestation: Prisma.Decimal }>();
  const ensure = (categoryId: string) => {
    let row = categoryAmounts.get(categoryId);
    if (!row) {
      row = { print: round2(amountOf(0)), attestation: round2(amountOf(0)) };
      categoryAmounts.set(categoryId, row);
    }
    return row;
  };
  for (const entry of input.printing ?? []) {
    const categoryId = typeof entry?.categoryId === "string" ? entry.categoryId : "";
    if (!categoryIds.has(categoryId)) throw new DeptCommissionInputError("Category nahi mili");
    ensure(categoryId).print = amountOf(entry.amount);
  }
  const setAmounts = new Map<string, { categoryId: string; amount: Prisma.Decimal }>();
  for (const entry of input.attestation ?? []) {
    const setId = typeof entry?.setId === "string" ? entry.setId : "";
    if (setId) {
      const set = setById.get(setId);
      if (!set) throw new DeptCommissionInputError("Set of Attestations nahi mila");
      setAmounts.set(setId, { categoryId: set.categoryId, amount: amountOf(entry.amount) });
    } else {
      const categoryId = typeof entry?.categoryId === "string" ? entry.categoryId : "";
      if (!categoryIds.has(categoryId)) throw new DeptCommissionInputError("Category nahi mili");
      ensure(categoryId).attestation = amountOf(entry.amount);
    }
  }
  const courierAmount = amountOf(input.courierAmount);

  const desired: Array<{ categoryId: string; setId: string; printAmount: Prisma.Decimal; attestationAmount: Prisma.Decimal }> = [];
  for (const [categoryId, row] of categoryAmounts) {
    if (row.print.greaterThan(0) || row.attestation.greaterThan(0)) {
      desired.push({ categoryId, setId: "", printAmount: row.print, attestationAmount: row.attestation });
    }
  }
  for (const [setId, row] of setAmounts) {
    if (row.amount.greaterThan(0)) {
      desired.push({ categoryId: row.categoryId, setId, printAmount: round2(amountOf(0)), attestationAmount: row.amount });
    }
  }

  const write = async (tx: Db) => {
    await tx.departmentCommissionRule.deleteMany({
      where: {
        adminId,
        NOT: desired.length ? desired.map((row) => ({ categoryId: row.categoryId, setId: row.setId })) : undefined,
      },
    });
    for (const row of desired) {
      await tx.departmentCommissionRule.upsert({
        where: { adminId_categoryId_setId: { adminId, categoryId: row.categoryId, setId: row.setId } },
        // courierAmount ab DepartmentCommissionSetting mein — rule par 0.
        create: { adminId, ...row, courierAmount: 0 },
        update: { printAmount: row.printAmount, attestationAmount: row.attestationAmount, courierAmount: 0 },
      });
    }
    await tx.departmentCommissionSetting.upsert({
      where: { adminId },
      create: { adminId, courierAmount },
      update: { courierAmount },
    });
  };

  if ("$transaction" in db && typeof (db as typeof prisma).$transaction === "function") {
    await (db as typeof prisma).$transaction((tx) => write(tx), { maxWait: 10000, timeout: 30000 });
  } else {
    await write(db);
  }
  return loadDeptCommissionForm(adminId, db);
}
