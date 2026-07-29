import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  BOT_QUICK_TIMEOUT_MS,
  PROVIDER_TIMEOUT_MS,
  callBotJson,
  callBotModel,
  type BotChatMessage,
} from "@/lib/bot-ai";
import {
  BOT_FALLBACK_ANSWER,
  BOT_BLOCKED_ANSWER,
  BOT_WHATSAPP_CONTACT_GUIDE,
  BOT_SAMPLE_INTRO,
  answerFromSavedKnowledge,
  botExpiresAt,
  buildBotSystemPrompt,
  buildCourseBotContext,
  buildCandidateBotContext,
  buildGeneralChatSystemPrompt,
  buildSampleLinks,
  buildWhatsappUrl,
  findBotEvidenceCandidates,
  getGeneralChatAnswer,
  isAbusiveMessage,
  isRequirementQuestion,
  isSampleRequest,
  isWhatsappContactQuestion,
  normalizeBotName,
  pickBotName,
  parseBotJson,
  parseBotJsonObject,
} from "@/lib/bot";
import { understandVisitorMessage } from "@/lib/bot-understanding";
import { fetchPrivateSiteSettingsFromDb } from "@/lib/get-site-settings";
import { stripBotInstructions } from "@/lib/strip-instructions";
import { prisma } from "@/lib/prisma";
import {
  findBlockedVisitorByIp,
  findOrCreateMergedVisitor,
  getClientIpFromHeaders,
} from "@/lib/visitor-server";
import { sendVisitorSignal } from "@/lib/ad-signals";

export const maxDuration = 60;

function clean(value: unknown, max = 1000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";
}

async function callStrictBotModel(
  settings: Awaited<ReturnType<typeof fetchPrivateSiteSettingsFromDb>>,
  messages: BotChatMessage[],
  getTimeoutMs?: () => number
) {
  let last = parseBotJson("");
  for (let attempt = 0; attempt < 2; attempt++) {
    const timeoutMs = getTimeoutMs ? getTimeoutMs() : PROVIDER_TIMEOUT_MS;
    if (timeoutMs < 5_000) break;
    const raw = await callBotModel(settings, messages, timeoutMs);
    last = parseBotJson(raw);
    if (last.parsed) return last;
  }
  return last;
}

async function findOrCreateVisitor(
  visitorKey: string,
  previousVisitorKey: string,
  ipAddress: string | null
) {
  if (!visitorKey) return null;
  return findOrCreateMergedVisitor({
    visitorKey,
    previousVisitorKey,
    update: { lastSeenAt: new Date(), ...(ipAddress ? { ipAddress } : {}) },
    create: { source: "bot", lastSeenAt: new Date(), ipAddress },
  });
}

async function queueBotQuestionForAdmin({
  courseId,
  message,
  visitorId,
  conversationId,
}: {
  courseId: string;
  message: string;
  visitorId?: string | null;
  conversationId: string;
}) {
  const pending = await prisma.userQuestion.findMany({
    where: { courseId, status: "pending", source: "bot" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, question: true },
  });
  const normalize = (value: string) =>
    value.normalize("NFKC").toLocaleLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").replace(/\s+/g, " ").trim();
  const normalizedMessage = normalize(message);
  const existing = pending.find((item) => normalize(item.question) === normalizedMessage);
  if (existing) return;

  await prisma.userQuestion.create({
    data: {
      courseId,
      question: message,
      status: "pending",
      source: "bot",
      visitorId,
      botConversationId: conversationId,
      publishForUsers: true,
    },
  });
}

async function saveAiRecoveredTraining(
  courseId: string,
  question: string,
  answer: string,
  evidenceIds: string[],
  confidence: number
) {
  const normalizedQuestion = question.normalize("NFKC").toLocaleLowerCase().replace(/[^a-z0-9\u0600-\u06ff]+/g, " ").replace(/\s+/g, " ").trim();
  const fingerprint = createHash("sha256").update(`${courseId}\n${normalizedQuestion}`).digest("hex");
  const sourceRef = `live:${fingerprint}`;

  const data = { courseId, question, answer, source: "ai", sourceRef, reviewStatus: "pending", evidence: evidenceIds, confidence } as const;
  const existing = await prisma.botTrainingEntry.findFirst({ where: { courseId, source: "ai", sourceRef }, select: { id: true } });
  
  if (existing) {
    const entry = await prisma.botTrainingEntry.update({
      where: { id: existing.id },
      data: { question, answer, reviewStatus: "pending", evidence: evidenceIds, confidence, rejectedAt: null },
      select: { id: true },
    });
    return entry.id;
  }

  try {
    const entry = await prisma.botTrainingEntry.create({ data, select: { id: true } });
    return entry.id;
  } catch {
    const raced = await prisma.botTrainingEntry.findFirst({ where: { courseId, source: "ai", sourceRef }, select: { id: true } });
    if (raced) return raced.id;
    throw new Error("AI training entry save nahi ho saki.");
  }
}

async function generateGeneralChatReply(
  settings: Awaited<ReturnType<typeof fetchPrivateSiteSettingsFromDb>>,
  botName: string,
  chatHistory: BotChatMessage[]
) {
  const historyLines = chatHistory.map((item) =>
    item.role === "assistant" ? `You (${botName}): ${item.content}` : `Visitor: ${item.content}`
  );
  const userPrompt = [
    "RECENT CONVERSATION (oldest first):",
    ...historyLines,
    "",
    'Reply to the visitor\'s LATEST message with ONLY one JSON object: {"reply":"<your brief warm reply>"}.',
  ].join("\n");

  const raw = await callBotJson(settings, buildGeneralChatSystemPrompt(botName, settings.botSystemNote), userPrompt, '{"reply"', 500, BOT_QUICK_TIMEOUT_MS);
  const parsed = parseBotJsonObject(raw);
  const reply = parsed && typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  const cleaned = stripBotInstructions(reply);
  return cleaned === BOT_FALLBACK_ANSWER ? "" : cleaned;
}

export async function POST(request: NextRequest) {
  const startedAt = Date.now();
  const settings = await fetchPrivateSiteSettingsFromDb();
  if (!settings.botEnabled || !settings.botApiKey || !settings.botModel) {
    return NextResponse.json({ error: "Bot configured nahi hai" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const message = clean(body.message, 2000);
    const courseId = clean(body.courseId, 100) || null;
    const conversationId = clean(body.conversationId, 100);
    const visitorKey = clean(body.visitorKey, 160);
    const previousVisitorKey = clean(body.previousVisitorKey, 160);
    const ipAddress = getClientIpFromHeaders(request.headers);
    const botName = normalizeBotName(clean(body.botName, 40)) || pickBotName(conversationId || visitorKey || message);

    if (!message) {
      return NextResponse.json({ error: "Message zaroori hai" }, { status: 400 });
    }

    const visitor = await findOrCreateVisitor(visitorKey, previousVisitorKey, ipAddress);
    const requestedConversation = conversationId ? await prisma.botConversation.findUnique({ where: { id: conversationId } }) : null;
    const existingConversation = requestedConversation && visitor?.id && requestedConversation.visitorId === visitor.id ? requestedConversation : null;

    const conversation = existingConversation
      ? await prisma.botConversation.update({ where: { id: existingConversation.id }, data: { courseId, visitorId: visitor?.id, expiresAt: botExpiresAt() } })
      : await prisma.botConversation.create({ data: { courseId, visitorId: visitor?.id, expiresAt: botExpiresAt() } });

    await prisma.botMessage.create({ data: { conversationId: conversation.id, role: "user", content: message } });

    const blockedByIp = await findBlockedVisitorByIp(ipAddress);
    if (visitor?.status === "blocked" || blockedByIp) {
      if (visitor && visitor.status !== "blocked") {
        await prisma.visitor.update({ where: { id: visitor.id }, data: { status: "blocked", lastSeenAt: new Date() } });
      }
      const answer = "Aap ka IP blocked hai. Admin unblock kare to aap chat dobara use kar sakty hen.";
      await prisma.botMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: answer, metadata: { blocked: true, botName } } });
      return NextResponse.json({ conversationId: conversation.id, answer, canAnswer: false, whatsappUrl: null, expiresAt: conversation.expiresAt, visitorKey: visitor?.visitorKey || visitorKey, blocked: true, botName });
    }

    if (isAbusiveMessage(message)) {
      let blockedVisitor = visitor;
      if (visitor) {
        if (ipAddress) {
          await prisma.visitor.updateMany({ where: { ipAddress }, data: { status: "blocked", lastSeenAt: new Date() } });
        } else {
          await prisma.visitor.update({ where: { id: visitor.id }, data: { status: "blocked", lastSeenAt: new Date() } });
        }
        blockedVisitor = await prisma.visitor.findUnique({ where: { id: visitor.id } });
        if (blockedVisitor) {
          const signal = await sendVisitorSignal(blockedVisitor, "Blocked", { auto_block: true, reason: "abusive_bot_message" });
          await prisma.visitorEvent.create({ data: { visitorId: blockedVisitor.id, eventName: "Blocked", status: "blocked", payload: { auto_block: true, reason: "abusive_bot_message" }, sentToMeta: signal.sentToMeta, sentToGoogle: signal.sentToGoogle, sentToTikTok: signal.sentToTikTok, error: signal.error } });
        }
      }
      await prisma.botMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: BOT_BLOCKED_ANSWER, metadata: { blocked: true, botName } } });
      return NextResponse.json({ conversationId: conversation.id, answer: BOT_BLOCKED_ANSWER, canAnswer: false, whatsappUrl: null, expiresAt: conversation.expiresAt, visitorKey: blockedVisitor?.visitorKey || visitor?.visitorKey || visitorKey, blocked: true, botName });
    }

    const heuristicGeneralAnswer = getGeneralChatAnswer(message, botName);
    const understanding = await understandVisitorMessage(settings, message, Boolean(heuristicGeneralAnswer));
    const correctedMessage = understanding.corrected || message;
    const understandingMeta = { corrected: understanding.corrected, category: understanding.category, usedLlm: understanding.usedLlm, parts: understanding.parts };

    const recentMessages = await prisma.botMessage.findMany({ where: { conversationId: conversation.id }, orderBy: { createdAt: "desc" }, take: 10 });
    const chatHistory: BotChatMessage[] = recentMessages.reverse().map((item) => ({ role: item.role === "assistant" ? "assistant" : "user", content: item.content } satisfies BotChatMessage));

    if (understanding.category === "general") {
      let answer = "";
      try { answer = await generateGeneralChatReply(settings, botName, chatHistory); } catch { answer = ""; }
      if (!answer) {
        answer = heuristicGeneralAnswer || `Main ${botName}, aapki madad ke liye mojood hoon. Diploma/course ke baare mein koi bhi sawal yahan pooch sakty hen.`;
      }
      await prisma.botMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: answer, metadata: { canAnswer: true, generalChat: true, understoodBy: understanding.usedLlm ? "llm" : "heuristic", botName, understanding: understandingMeta } } });
      return NextResponse.json({ conversationId: conversation.id, answer, canAnswer: true, whatsappUrl: null, expiresAt: conversation.expiresAt, visitorKey: visitor?.visitorKey || visitorKey, botName });
    }

    if (isWhatsappContactQuestion(correctedMessage) && !isRequirementQuestion(correctedMessage)) {
      const contactCourse = courseId ? await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, title: true } }) : null;
      const whatsappUrl = buildWhatsappUrl(settings.whatsappNumber, ["Assalam o Alaikum, main apne documents share karna chahta/chahti hoon.", `Visitor ID: ${visitor?.visitorKey || visitorKey || "unknown"}`, contactCourse ? `Course: ${contactCourse.title}` : null, contactCourse ? `Course ID: ${contactCourse.id}` : null, `Chat ID: ${conversation.id}`]);
      await prisma.botMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: BOT_WHATSAPP_CONTACT_GUIDE, metadata: { canAnswer: true, whatsappContact: true, whatsappUrl, botName, understanding: understandingMeta } } });
      return NextResponse.json({ conversationId: conversation.id, answer: BOT_WHATSAPP_CONTACT_GUIDE, canAnswer: true, whatsappUrl, expiresAt: conversation.expiresAt, visitorKey: visitor?.visitorKey || visitorKey, botName });
    }

    if (isSampleRequest(correctedMessage) && courseId) {
      const sampleCourse = await prisma.course.findUnique({ where: { id: courseId }, select: { id: true, isPublished: true, samples: { orderBy: { order: "asc" }, select: { id: true, title: true } } } });
      if (sampleCourse?.isPublished && sampleCourse.samples.length > 0) {
        const answer = `${BOT_SAMPLE_INTRO}\n\n${buildSampleLinks(sampleCourse.id, sampleCourse.samples)}`;
        await prisma.botMessage.create({ data: { conversationId: conversation.id, role: "assistant", content: answer, metadata: { canAnswer: true, sampleRequest: true, botName, understanding: understandingMeta } } });
        return NextResponse.json({ conversationId: conversation.id, answer, canAnswer: true, whatsappUrl: null, expiresAt: conversation.expiresAt, visitorKey: visitor?.visitorKey || visitorKey, botName });
      }
    }

    const { course, context } = await buildCourseBotContext(courseId);
    const llmStageTimeoutMs = () => Math.min(PROVIDER_TIMEOUT_MS, Math.max(0, 55_000 - (Date.now() - startedAt)));

    // MULTI-PART PROCESSING
    const parts = understanding.parts && understanding.parts.length > 0 ? understanding.parts : [correctedMessage];
    const answeredParts: { part: string; answer: string; evidenceIds: string[] }[] = [];
    const unansweredParts: string[] = [];
    const allEvidenceIds: string[] = [];
    let totalConfidence = 0;
    let usedFullRecovery = false;
    let providerError: string | null = null;

    for (const part of parts) {
      const savedKnowledgeReply = answerFromSavedKnowledge(part, course);
      const candidates = findBotEvidenceCandidates(part, course, 8);
      
      if (savedKnowledgeReply && course) {
        const alreadyPresent = candidates.some((item) => stripBotInstructions(item.answer) === savedKnowledgeReply.answer);
        if (!alreadyPresent) {
          candidates.unshift({ id: `tree:${savedKnowledgeReply.reason}`, source: "botTraining", question: part, answer: savedKnowledgeReply.answer, score: 100 });
        }
      }

      let partParsed = { canAnswer: false, answer: "", evidenceIds: [] as string[], confidence: 0, parsed: false };
      
      try {
        if (course && candidates.length > 0) {
          const candidatePrompt = [
            buildBotSystemPrompt(buildCandidateBotContext(course, candidates), settings.botSystemNote),
            "This is verification stage 1. Set canAnswer=true only when a supplied candidate directly and completely resolves the visitor's question part.",
          ].filter(Boolean).join("\n");
          partParsed = await callStrictBotModel(settings, [{ role: "system", content: candidatePrompt }, { role: "user", content: part }], llmStageTimeoutMs);
        }

        const candidateAnswer = stripBotInstructions(partParsed.answer);
        const candidateIds = new Set(candidates.map((item) => item.id));
        const candidateEvidenceValid = partParsed.evidenceIds.length > 0 && partParsed.evidenceIds.every((id) => candidateIds.has(id));
        const candidateWorked = partParsed.canAnswer === true && candidateAnswer.length > 0 && candidateAnswer !== BOT_FALLBACK_ANSWER && candidateEvidenceValid && partParsed.confidence >= 0.65;

        if (!candidateWorked && course) {
          usedFullRecovery = true;
          const fullSystemPrompt = [
            buildBotSystemPrompt(context, settings.botSystemNote),
            `Conversation bot name: ${botName}.`,
            "Stage 2: Full Data Recovery. The tree search failed for this specific part of the question. Analyze ALL provided course data, QAs, and training entries to find an answer for this specific part.",
          ].filter(Boolean).join("\n");
          partParsed = await callStrictBotModel(settings, [{ role: "system", content: fullSystemPrompt }, { role: "user", content: part }], llmStageTimeoutMs);
        }
      } catch (error) {
        providerError = error instanceof Error ? error.message : "Bot provider failed";
      }

      const trimmedAnswer = stripBotInstructions(partParsed.answer);
      const fullEvidenceIdsSet = new Set<string>([
        ...(course ? [`${course.id}:description`] : []),
        ...(course?.questions || []).map((item) => item.id),
        ...(course?.userQuestions || []).map((item) => item.id),
        ...(course?.botTraining || []).map((item) => item.id),
        ...candidates.map((item) => item.id),
      ]);
      const evidenceIsValid = partParsed.evidenceIds.length > 0 && partParsed.evidenceIds.every((id) => fullEvidenceIdsSet.has(id));
      const hasUsableAnswer = partParsed.canAnswer === true && trimmedAnswer.length > 0 && trimmedAnswer !== BOT_FALLBACK_ANSWER && evidenceIsValid && partParsed.confidence >= 0.65;

      if (hasUsableAnswer) {
        answeredParts.push({ part, answer: trimmedAnswer, evidenceIds: partParsed.evidenceIds });
        allEvidenceIds.push(...partParsed.evidenceIds);
        totalConfidence += partParsed.confidence;
        
        // Save to tree if it was a full recovery
        if (usedFullRecovery && course?.id) {
          try {
            await saveAiRecoveredTraining(course.id, part, trimmedAnswer, partParsed.evidenceIds, partParsed.confidence);
          } catch {
            // Ignore save errors to not break the flow
          }
        }
      } else {
        unansweredParts.push(part);
      }
    }

    // Synthesize final answer
    let finalAnswer = "";
    let canAnswerOverall = false;

    if (answeredParts.length > 0) {
      canAnswerOverall = true;
      finalAnswer = answeredParts.map((p, i) => `**Part ${i + 1}:** ${p.answer}`).join("\n\n");
    }

    if (unansweredParts.length > 0) {
      canAnswerOverall = false; // If any part is unanswered, overall is not fully answered
      const fallbackMsg = `aap k in sawalat ka jawab is waqt mery pass nahi hai: "${unansweredParts.join('", "')}". Senior assistant ap k in sawalat ka jawab 24 hours men isi course k swal jawab k section men post ker den gy, ya 24 hours baad aap in sawalat ka jawab muj sy isi jaga per pochh sakty hen.`;
      
      if (finalAnswer) {
        finalAnswer += `\n\n---\n\n${fallbackMsg}`;
      } else {
        finalAnswer = fallbackMsg;
      }
      
      if (course?.id) {
        await queueBotQuestionForAdmin({ courseId: course.id, message: unansweredParts.join(" | "), visitorId: visitor?.id, conversationId: conversation.id });
      }
    }

    // Update usage counts for evidence
    const uniqueEvidenceIds = [...new Set(allEvidenceIds)];
    if (uniqueEvidenceIds.length > 0) {
      await prisma.botTrainingEntry.updateMany({
        where: { id: { in: uniqueEvidenceIds }, reviewStatus: "approved" },
        data: { usageCount: { increment: 1 } },
      });
    }

    const whatsappUrl = isRequirementQuestion(correctedMessage) && course
      ? buildWhatsappUrl(settings.whatsappNumber, ["Assalam o Alaikum, main course proceed karna chahta/chahti hoon.", `Visitor ID: ${visitor?.visitorKey || visitorKey || "unknown"}`, `Course: ${course.title}`, `Course ID: ${course.id}`, `Question: ${message}`, `Chat ID: ${conversation.id}`])
      : null;

    const answerBody = whatsappUrl ? `${finalAnswer}\n\nMazeed proceed kerny ke liye WhatsApp link par click karein aur apne baqi documents isi number par share karein.` : finalAnswer;

    await prisma.botMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: answerBody,
        metadata: {
          canAnswer: canAnswerOverall,
          provider: settings.botProvider,
          model: settings.botModel,
          whatsappUrl,
          providerError,
          retrievalStage: usedFullRecovery ? "full-recovery" : "tree-verified",
          evidenceIds: uniqueEvidenceIds,
          confidence: answeredParts.length > 0 ? totalConfidence / answeredParts.length : 0,
          botName,
          understanding: understandingMeta,
        },
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      answer: answerBody,
      canAnswer: canAnswerOverall,
      whatsappUrl,
      expiresAt: conversation.expiresAt,
      visitorKey: visitor?.visitorKey || visitorKey,
      botName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bot chat fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
