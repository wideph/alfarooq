/**
 * AI se working-date pool bharta hai (docs/office-module/06 §N6 — owner's brief:
 * "AI research ker ke 2019 ki working dates ka pool banaye, admin edit/delete
 * ker sakta hai").
 *
 * Run (env exported first):
 *   export DATABASE_URL="..." && export DIRECT_URL="$DATABASE_URL"
 *   npx tsx scripts/ai-fill-date-pool.ts [year=2019] [target=30]
 *
 * Agar AI call fail ho jaye (network/quota) to pool ko waise hi chhora jata
 * hai — koi date manually fabricate NAHI ki jati — aur exit code 2 milta hai.
 */
import { PrismaClient } from "@prisma/client";
import { aiResearchWorkingDates } from "../src/lib/office/ai-dates";
import { formatDateOnly } from "../src/lib/office/serializers";

const prisma = new PrismaClient();

const MAX_ROUNDS = 4;

async function main() {
  const year = Number(process.argv[2]) || 2019;
  const target = Number(process.argv[3]) || 30;
  if (!Number.isFinite(year) || year < 1900 || !Number.isFinite(target) || target <= 0) {
    console.error("Usage: npx tsx scripts/ai-fill-date-pool.ts [year=2019] [target=30]");
    process.exitCode = 1;
    return;
  }

  let rows = await prisma.workingDatePool.findMany({
    where: { year },
    orderBy: { date: "asc" },
  });
  console.log(`[ai-fill-date-pool] Pool ${year}: ${rows.length}/${target} mojooda`);

  for (let round = 1; rows.length < target && round <= MAX_ROUNDS; round += 1) {
    const existing = rows.map((row) => formatDateOnly(row.date));
    const needed = target - rows.length;
    console.log(`[ai-fill-date-pool] Round ${round}: AI se ${needed} working dates research ho rahi hain...`);
    // Reasoning model (deepseek-v4-pro) ko poora budget dein — 150s per call.
    const researched = await aiResearchWorkingDates(year, needed, existing, prisma, 150_000);
    if (researched.length === 0) {
      console.error(
        `[ai-fill-date-pool] AI ne koi valid date nahi di (round ${round}). Pool waise ka waisa chhora gaya (${rows.length}/${target}).`
      );
      break;
    }
    console.log(`[ai-fill-date-pool] AI ne ${researched.length} dates di. Pehli entries:`);
    for (const item of researched.slice(0, 5)) {
      console.log(`  ${formatDateOnly(item.date)} — ${item.reason ?? "(no reason)"}`);
    }
    let inserted = 0;
    for (const item of researched) {
      try {
        await prisma.workingDatePool.create({
          data: {
            year,
            date: item.date,
            note: item.reason ? `AI: ${item.reason}` : "AI research",
          },
        });
        inserted += 1;
      } catch {
        // year+date unique — pehle se mojood, skip
      }
    }
    console.log(`[ai-fill-date-pool] ${inserted} dates insert hui.`);
    if (inserted === 0) break;
    rows = await prisma.workingDatePool.findMany({
      where: { year },
      orderBy: { date: "asc" },
    });
  }

  console.log(`[ai-fill-date-pool] FINAL Pool ${year}: ${rows.length}/${target}`);
  if (rows.length < target) {
    console.error("[ai-fill-date-pool] Pool poora nahi bhar saka — AI failure ya kam valid dates.");
    process.exitCode = 2;
  }
}

main()
  .catch((error) => {
    console.error("[ai-fill-date-pool] FAIL:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
