/**
 * Office module defaults: case categories, category sets + steps (wave 2 §N5),
 * attestation types (superset of step labels) and Pakistan holiday seeds 2019-2026.
 * Idempotent (upsert by unique keys; existing rows are never modified).
 * Run: npx tsx scripts/seed-office-defaults.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Original wave-1 categories are kept; wave-2 categories (06_NEW_REQUIREMENTS.md §N5)
// are created if missing.
const LEGACY_CATEGORIES = ["Matric", "Intermediate (FA/FSc)", "Bachelor (BA/BSc)", "Master (MA/MSc)", "Diploma", "Other"];
const WAVE2_CATEGORIES = ["M Tech", "Dip BBTE DAE 3Y", "BBTE DBA 3Y", "BBTE Dip 1-2", "Medical Bmfq", "CPLS", "APAC"];

const STEP_LABELS: Record<string, string> = {
  BORD: "Bord",
  UV_IDCC: "UV idcc",
  QR_IDCC: "QR code idcc",
  SPECIAL_MOOFA: "Special Moofa",
  SAUD_MBC: "Saud MBC",
  MOOFA_SAUD: "Moofa Saud",
  BACK_NEVTCC: "Back Nevtcc",
  CURRENT_NEVTCC: "Current Nevtcc",
  BMFQ_VER: "bmfq ver",
  MOH_ATTA: "MoH atta",
  CPLS_ATTA: "CPLS atta",
  APAC_ATTA: "APAC atta",
  NEVTCC: "nevtcc",
};

const ROMAN = ["i", "ii", "iii", "iv", "v", "vi", "vii"];

// §N5: Dip BBTE DAE 3Y = "category 4" with 7 sets; BBTE DBA 3Y uses the same.
const BBTE_SETS: string[][] = [
  ["BORD", "UV_IDCC", "SPECIAL_MOOFA", "SAUD_MBC", "MOOFA_SAUD"],
  ["BORD", "QR_IDCC", "SPECIAL_MOOFA", "SAUD_MBC", "MOOFA_SAUD"],
  ["BORD", "UV_IDCC", "SPECIAL_MOOFA"],
  ["BORD", "QR_IDCC", "SPECIAL_MOOFA"],
  ["BORD", "UV_IDCC"],
  ["BORD", "QR_IDCC"],
  ["BORD"],
];

const CATEGORY_SETS: Record<string, string[][]> = {
  "M Tech": [
    ["BORD", "UV_IDCC", "SPECIAL_MOOFA"],
    ["BORD", "QR_IDCC", "SPECIAL_MOOFA"],
    ["BORD", "UV_IDCC"],
    ["BORD", "QR_IDCC"],
    ["BORD"],
  ],
  "Dip BBTE DAE 3Y": BBTE_SETS,
  "BBTE DBA 3Y": BBTE_SETS,
  "BBTE Dip 1-2": [
    ["BORD", "BACK_NEVTCC", "SPECIAL_MOOFA", "SAUD_MBC", "MOOFA_SAUD"],
    ["BORD", "CURRENT_NEVTCC", "SPECIAL_MOOFA", "SAUD_MBC", "MOOFA_SAUD"],
  ],
  "Medical Bmfq": [
    ["BMFQ_VER", "MOH_ATTA", "SPECIAL_MOOFA"],
    ["BMFQ_VER", "MOH_ATTA"],
    ["BMFQ_VER"],
  ],
  CPLS: [
    ["CPLS_ATTA", "NEVTCC", "SPECIAL_MOOFA"],
    ["CPLS_ATTA", "NEVTCC"],
    ["CPLS_ATTA"],
  ],
  APAC: [
    ["APAC_ATTA", "NEVTCC", "SPECIAL_MOOFA"],
    ["APAC_ATTA", "NEVTCC"],
    ["APAC_ATTA"],
  ],
};

// Wave-1 attestation types kept; every set step label must also exist as a type.
const LEGACY_ATTESTATIONS = ["Board / University", "IBCC", "HEC", "MOFA", "Notary", "Embassy"];

// Fixed Pakistan public holidays (scope PAKISTAN), same dates every year.
const FIXED_HOLIDAYS: Array<[number, number, string]> = [
  [2, 5, "Kashmir Day"],
  [3, 23, "Pakistan Day"],
  [5, 1, "Labour Day"],
  [8, 14, "Independence Day"],
  [9, 6, "Defence Day"],
  [11, 9, "Iqbal Day"],
  [12, 25, "Quaid-e-Azam Day"],
];

// Moon-based holidays: approximate Gregorian dates, editable by admin
// (reason carries "approx - verify").
const APPROX_HOLIDAYS: Record<
  number,
  { milad: [number, number]; fitr: Array<[number, number]>; adha: Array<[number, number]> }
> = {
  2019: { milad: [11, 10], fitr: [[6, 4], [6, 5], [6, 6]], adha: [[8, 11], [8, 12], [8, 13]] },
  2020: { milad: [10, 30], fitr: [[5, 24], [5, 25], [5, 26]], adha: [[7, 31], [8, 1], [8, 2]] },
  2021: { milad: [10, 19], fitr: [[5, 13], [5, 14], [5, 15]], adha: [[7, 20], [7, 21], [7, 22]] },
  2022: { milad: [10, 9], fitr: [[5, 2], [5, 3], [5, 4]], adha: [[7, 9], [7, 10], [7, 11]] },
  2023: { milad: [9, 28], fitr: [[4, 21], [4, 22], [4, 23]], adha: [[6, 28], [6, 29], [6, 30]] },
  2024: { milad: [9, 16], fitr: [[4, 10], [4, 11], [4, 12]], adha: [[6, 17], [6, 18], [6, 19]] },
  2025: { milad: [9, 5], fitr: [[3, 30], [3, 31], [4, 1]], adha: [[6, 7], [6, 8], [6, 9]] },
  2026: { milad: [8, 26], fitr: [[3, 20], [3, 21], [3, 22]], adha: [[5, 27], [5, 28], [5, 29]] },
};

async function seedCategories() {
  for (const [index, name] of LEGACY_CATEGORIES.entries()) {
    await prisma.caseCategory.upsert({
      where: { name },
      update: {},
      create: { name, order: index + 1 },
    });
  }
  for (const [index, name] of WAVE2_CATEGORIES.entries()) {
    await prisma.caseCategory.upsert({
      where: { name },
      update: {},
      create: { name, order: LEGACY_CATEGORIES.length + index + 1 },
    });
  }
}

async function seedSets() {
  let createdSets = 0;
  let createdSteps = 0;
  for (const [categoryName, sets] of Object.entries(CATEGORY_SETS)) {
    const category = await prisma.caseCategory.findUnique({ where: { name: categoryName } });
    if (!category) continue;
    for (const [setIndex, stepKeys] of sets.entries()) {
      const setName = `Set (${ROMAN[setIndex]}): ${stepKeys.map((key) => STEP_LABELS[key]).join(" + ")}`;
      let set = await prisma.categorySet.findUnique({
        where: { categoryId_name: { categoryId: category.id, name: setName } },
      });
      if (!set) {
        set = await prisma.categorySet.create({
          data: { categoryId: category.id, name: setName, order: setIndex + 1 },
        });
        createdSets += 1;
      }
      for (const [stepIndex, stepKey] of stepKeys.entries()) {
        const existing = await prisma.categorySetStep.findFirst({
          where: { setId: set.id, stepKey },
        });
        if (!existing) {
          await prisma.categorySetStep.create({
            data: { setId: set.id, stepKey, label: STEP_LABELS[stepKey], order: stepIndex + 1 },
          });
          createdSteps += 1;
        }
      }
    }
  }
  return { createdSets, createdSteps };
}

async function seedAttestationTypes() {
  const names = [...LEGACY_ATTESTATIONS, ...Object.values(STEP_LABELS)];
  for (const [index, name] of names.entries()) {
    await prisma.attestationType.upsert({
      where: { name },
      update: {},
      create: { name, order: index + 1 },
    });
  }
  return names.length;
}

async function seedHolidays() {
  let count = 0;
  const upsertHoliday = async (year: number, month: number, day: number, reason: string) => {
    const date = new Date(Date.UTC(year, month - 1, day));
    await prisma.holidayClosure.upsert({
      where: { date_scope: { date, scope: "PAKISTAN" } },
      update: {},
      create: { date, scope: "PAKISTAN", reason },
    });
    count += 1;
  };
  for (let year = 2019; year <= 2026; year += 1) {
    for (const [month, day, reason] of FIXED_HOLIDAYS) {
      await upsertHoliday(year, month, day, reason);
    }
    const approx = APPROX_HOLIDAYS[year];
    await upsertHoliday(year, approx.milad[0], approx.milad[1], "Eid Milad-un-Nabi (12 Rabi-ul-Awwal) (approx - verify)");
    for (const [month, day] of approx.fitr) {
      await upsertHoliday(year, month, day, "Eid al-Fitr (approx - verify)");
    }
    for (const [month, day] of approx.adha) {
      await upsertHoliday(year, month, day, "Eid al-Adha (approx - verify)");
    }
  }
  return count;
}

async function main() {
  await seedCategories();
  const { createdSets, createdSteps } = await seedSets();
  const attestationCount = await seedAttestationTypes();
  const holidayCount = await seedHolidays();
  await prisma.boardAttasCounter.upsert({
    where: { id: "global" },
    update: {},
    create: { id: "global" },
  });
  console.log(
    `Seeded categories (${WAVE2_CATEGORIES.length} wave-2), ` +
      `${createdSets} new sets / ${createdSteps} new steps, ` +
      `${attestationCount} attestation types, ${holidayCount} holidays (2019-2026). ` +
      `WorkingDatePool left empty (admin-managed).`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
