import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import {
  BOT_QUICK_TIMEOUT_MS,
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

// A rejected tree candidate can require a second, full-knowledge model pass.
export const maxDuration = 60;

function clean(value: unknown, max = 1000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";
}

async function callStrictBotModel(
  settings: Awaited<ReturnType<typeof fetchPrivateSiteSettingsFromDb>>,
  messages: BotChatMessage[]
) {
  let last = parseBotJson("");
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await callBotModel(settings, messages);
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
    create: {
      source: "bot",
      lastSeenAt: new Date(),
      ipAddress,
    },
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
    where: {
      courseId,
      status: "pending",
      source: "bot",
    },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, question: true },
  });
  const normalize = (value: string) =>
    value
      .normalize("NFKC")
      .toLocaleLowerCase()
      .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
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
  const normalizedQuestion = question
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const fingerprint = createHash("sha256")
    .update(`${courseId}\n${normalizedQuestion}`)
    .digest("hex");
  const sourceRef = `live:${fingerprint}`;

  const data = {
      courseId,
      question,
      answer,
      source: "ai",
      sourceRef,
      reviewStatus: "pending",
      evidence: evidenceIds,
      confidence,
  } as const;
  const existing = await prisma.botTrainingEntry.findFirst({
    where: { courseId, source: "ai", sourceRef },
    select: { id: true },
  });
  if (existing) {
    const entry = await prisma.botTrainingEntry.update({
      where: { id: existing.id },
      data: {
      question,
      answer,
      reviewStatus: "pending",
      evidence: evidenceIds,
      confidence,
      rejectedAt: null,
      },
      select: { id: true },
    });
    return entry.id;
  }

  try {
    const entry = await prisma.botTrainingEntry.create({
      data,
      select: { id: true },
    });
    return entry.id;
  } catch {
    // A concurrent identical question may have won the partial unique index.
    const raced = await prisma.botTrainingEntry.findFirst({
      where: { courseId, source: "ai", sourceRef },
      select: { id: true },
    });
    if (raced) return raced.id;
    throw new Error("AI training entry save nahi ho saki.");
  }
}

// Stage B helper — a dedicated LLM small-talk reply for messages the
// understanding stage classified as "general". Free-text reply wrapped in a
// tolerant {"reply":"..."} envelope; on any failure the caller falls back to
// the deterministic getGeneralChatAnswer heuristic.
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

  const raw = await callBotJson(
    settings,
    buildGeneralChatSystemPrompt(botName, settings.botSystemNote),
    userPrompt,
    '{"reply"',
    500,
    BOT_QUICK_TIMEOUT_MS
  );
  const parsed = parseBotJsonObject(raw);
  const reply = parsed && typeof parsed.reply === "string" ? parsed.reply.trim() : "";
  return stripBotInstructions(reply);
}

export async function POST(request: NextRequest) {
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
    const botName =
      normalizeBotName(clean(body.botName, 40)) ||
      pickBotName(conversationId || visitorKey || message);

    if (!message) {
      return NextResponse.json({ error: "Message zaroori hai" }, { status: 400 });
    }

    const visitor = await findOrCreateVisitor(visitorKey, previousVisitorKey, ipAddress);

    const requestedConversation = conversationId
      ? await prisma.botConversation.findUnique({ where: { id: conversationId } })
      : null;
    // A client-provided chat ID is not authority to access that conversation.
    // Reuse it only when it belongs to the resolved visitor.
    const existingConversation =
      requestedConversation && visitor?.id && requestedConversation.visitorId === visitor.id
        ? requestedConversation
        : null;

    const conversation = existingConversation
      ? await prisma.botConversation.update({
          where: { id: existingConversation.id },
          data: {
            courseId,
            visitorId: visitor?.id,
            expiresAt: botExpiresAt(),
          },
        })
      : await prisma.botConversation.create({
          data: {
            courseId,
            visitorId: visitor?.id,
            expiresAt: botExpiresAt(),
          },
        });

    await prisma.botMessage.create({
      data: {
        conversationId: conversation.id,
        role: "user",
        content: message,
      },
    });

    const blockedByIp = await findBlockedVisitorByIp(ipAddress);
    if (visitor?.status === "blocked" || blockedByIp) {
      if (visitor && visitor.status !== "blocked") {
        await prisma.visitor.update({
          where: { id: visitor.id },
          data: { status: "blocked", lastSeenAt: new Date() },
        });
      }

      const answer = "Aap ka IP blocked hai. Admin unblock kare to aap chat dobara use kar sakty hen.";
      await prisma.botMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: answer,
          metadata: { blocked: true, botName },
        },
      });

      return NextResponse.json({
        conversationId: conversation.id,
        answer,
        canAnswer: false,
        whatsappUrl: null,
        expiresAt: conversation.expiresAt,
        visitorKey: visitor?.visitorKey || visitorKey,
        blocked: true,
        botName,
      });
    }

    if (isAbusiveMessage(message)) {
      let blockedVisitor = visitor;
      if (visitor) {
        if (ipAddress) {
          await prisma.visitor.updateMany({
            where: { ipAddress },
            data: { status: "blocked", lastSeenAt: new Date() },
          });
        } else {
          await prisma.visitor.update({
            where: { id: visitor.id },
            data: { status: "blocked", lastSeenAt: new Date() },
          });
        }

        blockedVisitor = await prisma.visitor.findUnique({ where: { id: visitor.id } });
        if (blockedVisitor) {
          const signal = await sendVisitorSignal(blockedVisitor, "Blocked", {
            auto_block: true,
            reason: "abusive_bot_message",
          });
          await prisma.visitorEvent.create({
            data: {
              visitorId: blockedVisitor.id,
              eventName: "Blocked",
              status: "blocked",
              payload: { auto_block: true, reason: "abusive_bot_message" },
              sentToMeta: signal.sentToMeta,
              sentToGoogle: signal.sentToGoogle,
              sentToTikTok: signal.sentToTikTok,
              error: signal.error,
            },
          });
        }
      }

      await prisma.botMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: BOT_BLOCKED_ANSWER,
          metadata: { blocked: true, botName },
        },
      });

      return NextResponse.json({
        conversationId: conversation.id,
        answer: BOT_BLOCKED_ANSWER,
        canAnswer: false,
        whatsappUrl: null,
        expiresAt: conversation.expiresAt,
        visitorKey: blockedVisitor?.visitorKey || visitor?.visitorKey || visitorKey,
        blocked: true,
        botName,
      });
    }

    // Stage A — LLM understanding: ONE quick call spell-fixes the message and
    // classifies it (course vs general). On failure it degrades gracefully to
    // the raw message plus the deterministic getGeneralChatAnswer heuristic.
    const heuristicGeneralAnswer = getGeneralChatAnswer(message, botName);
    const understanding = await understandVisitorMessage(
      settings,
      message,
      Boolean(heuristicGeneralAnswer)
    );
    const correctedMessage = understanding.corrected || message;
    const understandingMeta = {
      corrected: understanding.corrected,
      category: understanding.category,
      usedLlm: understanding.usedLlm,
    };

    const recentMessages = await prisma.botMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    // Conversation history keeps the visitor's RAW words (K3); retrieval and
    // verification below run on the corrected message instead (K1).
    const chatHistory: BotChatMessage[] = recentMessages
      .reverse()
      .map((item) => ({
        role: item.role === "assistant" ? "assistant" : "user",
        content: item.content,
      }) satisfies BotChatMessage);

    // Stage B — general chit-chat gets a dedicated LLM reply with the recent
    // conversation history. No tree search, no admin queue, no WhatsApp link.
    if (understanding.category === "general") {
      let answer = "";
      try {
        answer = await generateGeneralChatReply(settings, botName, chatHistory);
      } catch {
        answer = "";
      }
      if (!answer) {
        // Last resort: the deterministic heuristic, then a neutral short line.
        answer =
          heuristicGeneralAnswer ||
          `Main ${botName}, aapki madad ke liye mojood hoon. Diploma/course ke baare mein koi bhi sawal yahan pooch sakty hen.`;
      }

      await prisma.botMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: answer,
          metadata: {
            canAnswer: true,
            generalChat: true,
            understoodBy: understanding.usedLlm ? "llm" : "heuristic",
            botName,
            understanding: understandingMeta,
          },
        },
      });

      return NextResponse.json({
        conversationId: conversation.id,
        answer,
        canAnswer: true,
        whatsappUrl: null,
        expiresAt: conversation.expiresAt,
        visitorKey: visitor?.visitorKey || visitorKey,
        botName,
      });
    }

    // Stage C — course question. Deterministic fast paths run on the
    // LLM-corrected message (K1) so typos no longer skip them.

    // "What is your WhatsApp number?" — never expose a raw number. Guide the
    // visitor and hand them the WhatsApp link to share documents. (Requirement
    // questions skip this and flow through the model so they still get the saved
    // documents answer alongside the link.)
    if (isWhatsappContactQuestion(correctedMessage) && !isRequirementQuestion(correctedMessage)) {
      const contactCourse = courseId
        ? await prisma.course.findUnique({
            where: { id: courseId },
            select: { id: true, title: true },
          })
        : null;

      const whatsappUrl = buildWhatsappUrl(settings.whatsappNumber, [
        "Assalam o Alaikum, main apne documents share karna chahta/chahti hoon.",
        `Visitor ID: ${visitor?.visitorKey || visitorKey || "unknown"}`,
        contactCourse ? `Course: ${contactCourse.title}` : null,
        contactCourse ? `Course ID: ${contactCourse.id}` : null,
        `Chat ID: ${conversation.id}`,
      ]);

      await prisma.botMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: BOT_WHATSAPP_CONTACT_GUIDE,
          metadata: {
            canAnswer: true,
            whatsappContact: true,
            whatsappUrl,
            botName,
            understanding: understandingMeta,
          },
        },
      });

      return NextResponse.json({
        conversationId: conversation.id,
        answer: BOT_WHATSAPP_CONTACT_GUIDE,
        canAnswer: true,
        whatsappUrl,
        expiresAt: conversation.expiresAt,
        visitorKey: visitor?.visitorKey || visitorKey,
        botName,
      });
    }

    // "Show me a sample / send the sample" — fixed reply + the course sample
    // link(s). Only short-circuits when the course actually has samples;
    // otherwise it falls through to the normal flow.
    if (isSampleRequest(correctedMessage) && courseId) {
      const sampleCourse = await prisma.course.findUnique({
        where: { id: courseId },
        select: {
          id: true,
          isPublished: true,
          samples: {
            orderBy: { order: "asc" },
            select: { id: true, title: true },
          },
        },
      });

      if (sampleCourse?.isPublished && sampleCourse.samples.length > 0) {
        const answer = `${BOT_SAMPLE_INTRO}\n\n${buildSampleLinks(
          sampleCourse.id,
          sampleCourse.samples
        )}`;

        await prisma.botMessage.create({
          data: {
            conversationId: conversation.id,
            role: "assistant",
            content: answer,
            metadata: {
              canAnswer: true,
              sampleRequest: true,
              botName,
              understanding: understandingMeta,
            },
          },
        });

        return NextResponse.json({
          conversationId: conversation.id,
          answer,
          canAnswer: true,
          whatsappUrl: null,
          expiresAt: conversation.expiresAt,
          visitorKey: visitor?.visitorKey || visitorKey,
          botName,
        });
      }
    }

    const { course, context } = await buildCourseBotContext(courseId);

    // Stage 1: retrieve a small tree/search result and ask the LLM to verify
    // semantic fit. A high keyword score is never sent directly to a customer.
    // Retrieval runs on the LLM-corrected message (K1) so typos no longer miss
    // saved tree answers.
    const savedKnowledgeReply = answerFromSavedKnowledge(correctedMessage, course);
    const candidates = findBotEvidenceCandidates(correctedMessage, course, 8);
    if (savedKnowledgeReply && course) {
      const alreadyPresent = candidates.some(
        (item) => stripBotInstructions(item.answer) === savedKnowledgeReply.answer
      );
      if (!alreadyPresent) {
        candidates.unshift({
          id: `tree:${savedKnowledgeReply.reason}`,
          source: "botTraining",
          question: correctedMessage,
          answer: savedKnowledgeReply.answer,
          score: 100,
        });
      }
    }

    const fullSystemPrompt = [
      buildBotSystemPrompt(context, settings.botSystemNote),
      `Conversation bot name: ${botName}. If the visitor asks your name, use this exact name for this conversation.`,
    ].join("\n");
    const conversationMessages: BotChatMessage[] = [...chatHistory];
    // K2: the history carries the visitor's raw words while retrieval ran on
    // the corrected message — the verification note below bridges that gap.
    const correctionNote =
      correctedMessage !== message
        ? `Visitor ka message spell-correct hua: '${correctedMessage}' (original: '${message}'). Judge the answer against BOTH forms.`
        : "";

    let parsed = {
      canAnswer: false,
      answer: "",
      evidenceIds: [] as string[],
      confidence: 0,
      parsed: false,
    };
    let providerError: string | null = null;
    let usedFullRecovery = candidates.length === 0;

    try {
      if (course && candidates.length > 0) {
        const candidatePrompt = [
          buildBotSystemPrompt(
            buildCandidateBotContext(course, candidates),
            settings.botSystemNote
          ),
          "This is verification stage 1. Set canAnswer=true only when a supplied candidate directly and completely resolves the visitor's question.",
          correctionNote,
        ]
          .filter(Boolean)
          .join("\n");
        parsed = await callStrictBotModel(settings, [
          { role: "system", content: candidatePrompt },
          ...conversationMessages,
        ]);
      }

      const candidateAnswer = stripBotInstructions(parsed.answer);
      const candidateIds = new Set(candidates.map((item) => item.id));
      const candidateEvidenceValid =
        parsed.evidenceIds.length > 0 &&
        parsed.evidenceIds.every((id) => candidateIds.has(id));
      const candidateWorked =
        parsed.canAnswer === true &&
        candidateAnswer.length > 0 &&
        candidateAnswer !== BOT_FALLBACK_ANSWER &&
        candidateEvidenceValid &&
        parsed.confidence >= 0.65;

      // Stage 2: if retrieval was absent or rejected, give the model the full
      // course description, every QA and all training entries for recovery.
      if (!candidateWorked) {
        usedFullRecovery = true;
        parsed = await callStrictBotModel(settings, [
          { role: "system", content: fullSystemPrompt },
          ...conversationMessages,
        ]);
      }
    } catch (error) {
      providerError = error instanceof Error ? error.message : "Bot provider failed";
    }

    // Strip any @@ ... @@ private instructions that may have leaked into the
    // model output — the visitor must never see them. A usable answer is any
    // non-empty text that is not itself the fallback line, and only when the
    // model says the selected evidence directly answers the visitor.
    const trimmedAnswer = stripBotInstructions(parsed.answer);
    const fullEvidenceIds = new Set<string>([
      ...(course ? [`${course.id}:description`] : []),
      ...(course?.questions || []).map((item) => item.id),
      ...(course?.userQuestions || []).map((item) => item.id),
      ...(course?.botTraining || []).map((item) => item.id),
      ...candidates.map((item) => item.id),
    ]);
    const evidenceIsValid =
      parsed.evidenceIds.length > 0 &&
      parsed.evidenceIds.every((id) => fullEvidenceIds.has(id));
    const hasUsableAnswer =
      parsed.canAnswer === true &&
      trimmedAnswer.length > 0 &&
      trimmedAnswer !== BOT_FALLBACK_ANSWER &&
      evidenceIsValid &&
      parsed.confidence >= 0.65;

    const canAnswer = hasUsableAnswer;
    const answerBody = hasUsableAnswer ? trimmedAnswer : BOT_FALLBACK_ANSWER;

    // A successful full-data recovery becomes a reusable, admin-editable tree
    // entry. It is visibly marked as AI-posted in the training panel.
    let learnedEntryId: string | null = null;
    if (hasUsableAnswer && usedFullRecovery && course?.id) {
      try {
        learnedEntryId = await saveAiRecoveredTraining(
          course.id,
          message,
          trimmedAnswer,
          parsed.evidenceIds,
          parsed.confidence
        );
      } catch (error) {
        providerError = [
          providerError,
          `AI training save failed: ${error instanceof Error ? error.message : "unknown"}`,
        ]
          .filter(Boolean)
          .join(" | ");
      }
    }

    if (hasUsableAnswer && parsed.evidenceIds.length) {
      await prisma.botTrainingEntry.updateMany({
        where: {
          id: { in: parsed.evidenceIds },
          reviewStatus: "approved",
        },
        data: { usageCount: { increment: 1 } },
      });
    }

    // Queue for admin whenever we could not fully answer (fallback used or partial).
    const shouldQueueForAdmin =
      !hasUsableAnswer || answerBody.includes(BOT_FALLBACK_ANSWER);

    if (shouldQueueForAdmin && course?.id) {
      await queueBotQuestionForAdmin({
        courseId: course.id,
        message,
        visitorId: visitor?.id,
        conversationId: conversation.id,
      });
    }

    // For requirement / proceed questions always offer the WhatsApp hand-off so
    // the visitor can share their documents — even when we fell back. The
    // intent check runs on the corrected message (K1); the hand-off text keeps
    // the visitor's original words.
    const whatsappUrl =
      isRequirementQuestion(correctedMessage) && course
        ? buildWhatsappUrl(settings.whatsappNumber, [
            "Assalam o Alaikum, main course proceed karna chahta/chahti hoon.",
            `Visitor ID: ${visitor?.visitorKey || visitorKey || "unknown"}`,
            `Course: ${course.title}`,
            `Course ID: ${course.id}`,
            `Question: ${message}`,
            `Chat ID: ${conversation.id}`,
          ])
        : null;

    const answer = whatsappUrl
      ? `${answerBody}\n\nMazeed proceed kerny ke liye WhatsApp link par click karein aur apne baqi documents isi number par share karein.`
      : answerBody;

    await prisma.botMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: answer,
        metadata: {
          canAnswer,
          provider: settings.botProvider,
          model: settings.botModel,
          whatsappUrl,
          providerError,
          retrievalStage: usedFullRecovery ? "full-recovery" : "tree-verified",
          learnedEntryId,
          evidenceIds: parsed.evidenceIds,
          confidence: parsed.confidence,
          botName,
          understanding: understandingMeta,
        },
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      answer,
      canAnswer,
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
