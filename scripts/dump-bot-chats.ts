// Temporary analysis script: dumps recent bot conversations with per-message
// metadata (canAnswer, reason, providerError) to audit real production failures.
import { prisma } from "../src/lib/prisma";

async function main() {
  const conversations = await prisma.botConversation.findMany({
    orderBy: { updatedAt: "desc" },
    take: 40,
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });

  for (const convo of conversations) {
    console.log(`\n===== CONVO ${convo.id} course=${convo.courseId} updated=${convo.updatedAt.toISOString()} =====`);
    for (const m of convo.messages) {
      const meta = (m.metadata || {}) as Record<string, unknown>;
      const flags = [
        meta.canAnswer !== undefined ? `canAnswer=${meta.canAnswer}` : "",
        meta.reason ? `reason=${meta.reason}` : "",
        meta.savedKnowledge ? "savedKnowledge" : "",
        meta.generalChat ? "generalChat" : "",
        meta.sampleRequest ? "sampleRequest" : "",
        meta.whatsappContact ? "whatsappContact" : "",
        meta.blocked ? "blocked" : "",
        meta.providerError ? `providerError=${String(meta.providerError).slice(0, 160)}` : "",
        meta.model ? `model=${meta.model}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      const content = m.content.replace(/\s+/g, " ").slice(0, 220);
      console.log(`[${m.role}] ${content}`);
      if (flags) console.log(`    (${flags})`);
    }
  }
}

main().finally(() => prisma.$disconnect());
