import { NextRequest, NextResponse } from "next/server";
import { callBotModel, type BotChatMessage } from "@/lib/bot-ai";
import {
  BOT_FALLBACK_ANSWER,
  BOT_BLOCKED_ANSWER,
  BOT_WHATSAPP_CONTACT_GUIDE,
  botExpiresAt,
  buildBotSystemPrompt,
  buildCourseBotContext,
  buildWhatsappUrl,
  cleanupExpiredBotConversations,
  getGeneralChatAnswer,
  isAbusiveMessage,
  isRequirementQuestion,
  isWhatsappContactQuestion,
  normalizeBotName,
  pickBotName,
  parseBotJson,
} from "@/lib/bot";
import { fetchPrivateSiteSettingsFromDb } from "@/lib/get-site-settings";
import { prisma } from "@/lib/prisma";
import {
  findBlockedVisitorByIp,
  findOrCreateMergedVisitor,
  getClientIpFromHeaders,
} from "@/lib/visitor-server";
import { sendVisitorSignal } from "@/lib/ad-signals";

function clean(value: unknown, max = 1000) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : "";
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
    const ipAddress = getClientIpFromHeaders(request.headers);
    const botName =
      normalizeBotName(clean(body.botName, 40)) ||
      pickBotName(conversationId || visitorKey || message);

    if (!message) {
      return NextResponse.json({ error: "Message zaroori hai" }, { status: 400 });
    }

    const visitor = await findOrCreateVisitor(visitorKey, previousVisitorKey, ipAddress);

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

    const generalAnswer = getGeneralChatAnswer(message, botName);
    if (generalAnswer) {
      await prisma.botMessage.create({
        data: {
          conversationId: conversation.id,
          role: "assistant",
          content: generalAnswer,
          metadata: { canAnswer: true, generalChat: true, botName },
        },
      });

      return NextResponse.json({
        conversationId: conversation.id,
        answer: generalAnswer,
        canAnswer: true,
        whatsappUrl: null,
        expiresAt: conversation.expiresAt,
        visitorKey: visitor?.visitorKey || visitorKey,
        botName,
      });
    }

    // "What is your WhatsApp number?" — never expose a raw number. Guide the
    // visitor and hand them the WhatsApp link to share documents. (Requirement
    // questions skip this and flow through the model so they still get the saved
    // documents answer alongside the link.)
    if (isWhatsappContactQuestion(message) && !isRequirementQuestion(message)) {
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
          metadata: { canAnswer: true, whatsappContact: true, whatsappUrl, botName },
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

    const { course, context } = await buildCourseBotContext(courseId);

    const recentMessages = await prisma.botMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    const systemPrompt = [
      buildBotSystemPrompt(context, settings.botSystemNote),
      `Conversation bot name: ${botName}. If the visitor asks your name, use this exact name for this conversation.`,
    ].join("\n");
    const providerMessages: BotChatMessage[] = [
      { role: "system", content: systemPrompt },
      ...recentMessages
        .reverse()
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: item.content,
        }) satisfies BotChatMessage),
    ];

    let parsed = { canAnswer: false, answer: "", parsed: false };
    let providerError: string | null = null;

    try {
      const raw = await callBotModel(settings, providerMessages);
      parsed = parseBotJson(raw);
    } catch (error) {
      providerError = error instanceof Error ? error.message : "Bot provider failed";
    }

    // A usable answer is any non-empty text that is not itself the fallback line.
    const trimmedAnswer = parsed.answer.trim();
    const hasUsableAnswer =
      trimmedAnswer.length > 0 && trimmedAnswer !== BOT_FALLBACK_ANSWER;

    // Trust a real answer even if the model conservatively flagged canAnswer=false.
    const canAnswer = parsed.canAnswer || hasUsableAnswer;
    const answerBody = hasUsableAnswer ? trimmedAnswer : BOT_FALLBACK_ANSWER;

    // Queue for admin whenever we could not fully answer (fallback used or partial).
    const shouldQueueForAdmin =
      !hasUsableAnswer || answerBody.includes(BOT_FALLBACK_ANSWER);

    if (shouldQueueForAdmin && course?.id) {
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

    // For requirement / proceed questions always offer the WhatsApp hand-off so
    // the visitor can share their documents — even when we fell back.
    const whatsappUrl =
      isRequirementQuestion(message) && course
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
          botName,
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
