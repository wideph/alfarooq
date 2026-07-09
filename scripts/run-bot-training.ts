// Runs the bot self-learning pass for every published course until every
// knowledge unit (description + each Q&A) has generated training entries —
// the same as the admin clicking "Learn" repeatedly.
import { prisma } from "../src/lib/prisma";
import { runBotLearning } from "../src/lib/bot-learning";

async function main() {
  const courses = await prisma.course.findMany({
    where: { isPublished: true },
    select: { id: true, title: true },
    orderBy: { order: "asc" },
  });

  for (const course of courses) {
    console.log(`\n=== Training: ${course.title} (${course.id}) ===`);
    for (let round = 1; round <= 20; round++) {
      const result = await runBotLearning(course.id);
      console.log(
        `round ${round}: created=${result.created} processed=${result.processedUnits} remaining=${result.remainingUnits} total=${result.totalUnits}`
      );
      if (result.remainingUnits === 0) break;
    }
  }
}

main().finally(() => prisma.$disconnect());
