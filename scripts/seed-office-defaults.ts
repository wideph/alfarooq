/**
 * Office module defaults: a few case categories and attestation types.
 * Idempotent (upsert by name). Run: npx tsx scripts/seed-office-defaults.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATEGORIES = ["Matric", "Intermediate (FA/FSc)", "Bachelor (BA/BSc)", "Master (MA/MSc)", "Diploma", "Other"];
const ATTESTATIONS = ["Board / University", "IBCC", "HEC", "MOFA", "Notary", "Embassy"];

async function main() {
  for (const [index, name] of CATEGORIES.entries()) {
    await prisma.caseCategory.upsert({
      where: { name },
      update: {},
      create: { name, order: index + 1 },
    });
  }
  for (const [index, name] of ATTESTATIONS.entries()) {
    await prisma.attestationType.upsert({
      where: { name },
      update: {},
      create: { name, order: index + 1 },
    });
  }
  console.log(`Seeded ${CATEGORIES.length} categories and ${ATTESTATIONS.length} attestation types.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
