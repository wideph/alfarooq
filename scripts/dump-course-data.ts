// Temporary analysis script: dumps every course, its Q&As, user questions,
// bot training entries and bot settings so the bot's knowledge can be audited.
import { prisma } from "../src/lib/prisma";

async function main() {
  const courses = await prisma.course.findMany({
    orderBy: [{ order: "asc" }],
    include: {
      samples: { orderBy: { order: "asc" } },
      questions: { orderBy: { order: "asc" } },
      userQuestions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      botTraining: { orderBy: { updatedAt: "desc" } },
    },
  });

  for (const c of courses) {
    console.log("=====================================================");
    console.log("COURSE:", c.id, "|", c.title, "| published:", c.isPublished);
    console.log("--- DESCRIPTION ---");
    console.log(c.description);
    console.log("--- SAMPLES:", c.samples.length, "---");
    for (const s of c.samples) console.log(` [${s.order}] ${s.title} (${s.type})`);
    console.log("--- PUBLISHED QUESTIONS:", c.questions.length, "---");
    for (const q of c.questions) {
      console.log(`\n[Q order=${q.order} id=${q.id} media=${q.answerMediaFilename ? q.answerMediaType : "no"}]`);
      console.log("Q:", q.question);
      console.log("A:", q.answer);
    }
    console.log("\n--- USER QUESTIONS:", c.userQuestions.length, "---");
    for (const q of c.userQuestions) {
      console.log(`\n[UQ id=${q.id} status=${q.status} publish=${q.publishForUsers} trainingOnly=${q.trainingOnly} source=${q.source} media=${q.answerMediaFilename ? q.answerMediaType : "no"}]`);
      console.log("Q:", q.question);
      console.log("A:", q.answer || "(no answer)");
    }
    console.log("\n--- BOT TRAINING ENTRIES:", c.botTraining.length, "---");
    for (const t of c.botTraining) {
      console.log(`\n[T source=${t.source} ref=${t.sourceRef || "-"}]`);
      console.log("Q:", t.question);
      console.log("A:", t.answer);
    }
  }

  const settings = await prisma.siteSettings.findUnique({ where: { id: "site" } });
  if (settings) {
    console.log("\n=== SETTINGS ===");
    console.log("botEnabled:", settings.botEnabled, "| provider:", settings.botProvider, "| model:", settings.botModel, "| apiKey set:", Boolean(settings.botApiKey));
    console.log("botSystemNote:", settings.botSystemNote);
    console.log("whatsappNumber:", settings.whatsappNumber ? "set" : "empty");
  }
}

main().finally(() => prisma.$disconnect());
