import { NextRequest, NextResponse } from "next/server";
import { callBotModel, type BotChatMessage } from "@/lib/bot-ai";
import {
  BOT_FALLBACK_ANSWER,
  botExpiresAt,
  buildBotSystemPrompt,
  buildCourseBotContext,
  buildWhatsappUrl,
  cleanupExpiredBotConversations,
  getGeneralChatAnswer,
  isRequirementQuestion,
  parseBotJson,
} from "@/lib/bot";
import { fetchPrivateSiteSettingsFromDb } from "@/lib/get-site-settings";
import { prisma } from "@/lib/prisma";
import { findOrCreateMergedVisitor } from "@/lib/visitor-server";

function clean(value: unknown, max = 1000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";
}

async function findOrCreateVisitor(visitorKey: string, previousVisitorKey: string) {
  if (!visitorKey) return null;

  return findOrCreateMergedVisitor({
    visitorKey,
    previousVisitorKey,
    update: { lastSeenAt: new Date() },
    create: {
      source: "bot",
      lastSeenAt: new Date(),
    },
  });
}

export async function POST(request: NextRequest) {
  await cleanupExpiredBotConversations();

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

    if (!message) {
      return NextResponse.json({ error: "Message zaroori hai" }, { status: 400 });
    }

    const visitor = await findOrCreateVisitor(visitorKey, previousVisitorKey);

    const existingConversation = conversationId
      ? await prisma.botConversation.findUnique({ where: { id: conversationId } })
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

    const generalAnswer = getGeneralChatAnswer(message);
    if (generalAnswer) {
      await prisma.botMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: generalAnswer,
          metadata: { canAnswer: true, generalChat: true },
        },
      });

      return NextResponse.json({
        conversationId: conversation.id,
        answer: generalAnswer,
        canAnswer: true,
        whatsappUrl: null,
        expiresAt: conversation.expiresAt,
        visitorKey: visitor?.visitorKey || visitorKey,
      });
    }

    const { course, context } = await buildCourseBotContext(courseId);

    const recentMessages = await prisma.botMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const systemPrompt = buildBotSystemPrompt(context, settings.botSystemNote);
    const providerMessages: BotChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...recentMessages
        .reverse()
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content,
        }) satisfies BotChatMessage),
    ];

    let parsed = { canAnswer: false, answer: BOT_FALLBACK_ANSWER };
    let providerError: string | null = null;

    try {
      const raw = await callBotModel(settings, providerMessages);
      parsed = parseBotJson(raw);
      if (!parsed.answer) parsed.answer = BOT_FALLBACK_ANSWER;
    } catch (error) {
      providerError = error instanceof Error ? error.message : "Bot provider failed";
    }

    const shouldQueueForAdmin =
      !parsed.canAnswer || parsed.answer.includes(BOT_FALLBACK_ANSWER);

    if (!parsed.canAnswer) {
      parsed.answer = BOT_FALLBACK_ANSWER;
    }

    if (shouldQueueForAdmin) {
      if (course?.id) {
        await prisma.userQuestion.create({
          data: {
            courseId: course.id,
            question: message,
            status: "pending",
            source: "bot",
            visitorId: visitor?.id,
            botConversationId: conversation.id,
            publishForUsers: true,
          },
        });
      }
    }

    const whatsappUrl =
      parsed.canAnswer && isRequirementQuestion(message) && course
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
      ? `${parsed.answer}\n\nMazeed proceed kerny ke liye WhatsApp link par click karein aur apne baqi documents isi number par share karein.`
      : parsed.answer;

    await prisma.botMessage.create({
      data: {
        conversationId: conversation.id,
        role: "assistant",
        content: answer,
        metadata: {
          canAnswer: parsed.canAnswer,
          provider: settings.botProvider,
          model: settings.botModel,
          whatsappUrl,
          providerError,
        },
      },
    });

    return NextResponse.json({
      conversationId: conversation.id,
      answer,
      canAnswer: parsed.canAnswer,
      whatsappUrl,
      expiresAt: conversation.expiresAt,
      visitorKey: visitor?.visitorKey || visitorKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Bot chat fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
