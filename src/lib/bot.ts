import { prisma } from "@/lib/prisma";

export const BOT_FALLBACK_ANSWER =
  "men aap k swal ka jawab fori nahi dy sakta, 24 hourse tak apk swal ka jawab isi course k swal jawab k section men mojod hoga aur ager wahan per iska jawab na hua to aap 24 hours tak yahi swal muj sy dubara ker sakty hen.";

const REQUIREMENT_WORDS = [
  "requirement",
  "requirements",
  "document",
  "documents",
  "proceed",
  "chahye",
  "chahiye",
  "kya kya",
  "درکار",
  "کاغذات",
  "دستاویز",
  "چاہیے",
  "پروسیڈ",
];

const GENERAL_CHAT_PATTERNS = [
  /\bass?alam\b/i,
  /\bsalam\b/i,
  /\bhello\b/i,
  /\bhi\b/i,
  /\bhey\b/i,
  /\bkya hal\b/i,
  /\bkaise ho\b/i,
  /\bkesy ho\b/i,
  /\bkaisay ho\b/i,
  /\bthanks?\b/i,
  /\bthank you\b/i,
  /\bshukriya\b/i,
];

export function isRequirementQuestion(message: string) {
  const normalized = message.toLowerCase();
  return REQUIREMENT_WORDS.some((word) => normalized.includes(word));
}

export function getGeneralChatAnswer(message: string) {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return "";

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  const isGeneral = GENERAL_CHAT_PATTERNS.some((pattern) => pattern.test(normalized));

  if (!isGeneral || wordCount > 8) return "";

  if (/\bthanks?\b|\bthank you\b|\bshukriya\b/i.test(normalized)) {
    return "Aap ka shukriya. Course se related sawal likhein, main available data ke mutabiq jawab doon ga.";
  }

  return "Wa alaikum assalam. Main theek hoon. Aap course se related sawal likhein, main available data ke mutabiq jawab doon ga.";
}

export function shouldQueueUnansweredQuestion(message: string) {
  return !getGeneralChatAnswer(message);
}

export function botExpiresAt() {
  return new Date(Date.now() + 96 * 60 * 60 * 1000);
}

export async function cleanupExpiredBotConversations() {
  await prisma.botConversation.deleteMany({
    where: {
      isPinned: false,
      expiresAt: { lt: new Date() },
    },
  });
}

export function remainingSeconds(expiresAt: Date) {
  return Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000));
}

export function buildWhatsappUrl(
  whatsappNumber: string,
  parts: Array<string | null | undefined>
) {
  const phone = whatsappNumber.replace(/\D/g, "");
  if (!phone) return null;
  const text = parts.filter(Boolean).join("\n");
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

function clip(value: string | null | undefined, max = 1400) {
  const text = (value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

export async function buildCourseBotContext(courseId: string | null) {
  const otherCourses = await prisma.course.findMany({
    where: { isPublished: true },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true },
  });

  if (!courseId) {
    return {
      course: null,
      context: [
        "CURRENT COURSE: none selected.",
        "The visitor is not on a course detail page. Do not answer course-specific questions.",
        "Published course links:",
        ...otherCourses.map((course) => `- ${course.title}: /courses/${course.id}`),
      ].join("\n"),
    };
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
      samples: { orderBy: { order: "asc" } },
      questions: { orderBy: { order: "asc" } },
      userQuestions: {
        where: {
          OR: [
            { status: "answered", publishForUsers: true },
            { status: "training" },
            { trainingOnly: true },
          ],
        },
        orderBy: [{ order: "asc" }, { answeredAt: "desc" }],
      },
      botTraining: { orderBy: { updatedAt: "desc" }, take: 80 },
    },
  });

  if (!course || !course.isPublished) {
    return {
      course: null,
      context: [
        "CURRENT COURSE: unavailable.",
        "Published course links:",
        ...otherCourses.map((item) => `- ${item.title}: /courses/${item.id}`),
      ].join("\n"),
    };
  }

  const currentCourseUrl = `/courses/${course.id}`;
  const otherCourseLines = otherCourses
    .filter((item) => item.id !== course.id)
    .map((item) => `- ${item.title}: /courses/${item.id}`);

  const context = [
    `CURRENT COURSE TITLE: ${course.title}`,
    `CURRENT COURSE URL: ${currentCourseUrl}`,
    `CURRENT COURSE DESCRIPTION:\n${clip(course.description, 2500)}`,
    "",
    "SAMPLES / ATTACHED MATERIAL LINKS:",
    ...course.samples.map(
      (sample) =>
        `- ${sample.title} (${sample.type}) link: ${currentCourseUrl}#sample-${sample.id}`
    ),
    "",
    "PUBLISHED COURSE Q&A:",
    ...course.questions.map(
      (item) =>
        `- Q: ${clip(item.question, 600)}\n  A: ${clip(item.answer)}\n  Link: ${currentCourseUrl}#qa-${item.id}`
    ),
    "",
    "ANSWERED USER Q&A AND TRAINING-ONLY ANSWERS:",
    ...course.userQuestions.map(
      (item) =>
        `- Q: ${clip(item.question, 600)}\n  A: ${clip(item.answer)}\n  Link: ${currentCourseUrl}#qa-user-${item.id}\n  Training only: ${item.trainingOnly || item.status === "training"}`
    ),
    "",
    "HIDDEN BOT TRAINING:",
    ...course.botTraining.map(
      (item) => `- Q: ${clip(item.question, 600)}\n  A: ${clip(item.answer)}`
    ),
    "",
    "OTHER COURSE LINKS:",
    ...(otherCourseLines.length ? otherCourseLines : ["- No other published courses."]),
  ].join("\n");

  return { course, context };
}

export function buildBotSystemPrompt(context: string, extraInstruction: string) {
  return [
    "You are the website course Q&A bot.",
    "Return JSON only with this shape: {\"canAnswer\": boolean, \"answer\": string}.",
    "Use only the supplied course context, published Q&A, samples, answered user Q&A, and hidden bot training.",
    "Never add outside facts. Never invent documents, fees, dates, promises, or requirements.",
    "Keep the meaning of admin-provided answers unchanged. Small wording changes for the user's language are allowed.",
    "Search BOTH questions and answers. The user's wording may match answer text even when it does not match a saved question.",
    "Handle Roman Urdu, Urdu, English, spelling mistakes, missing spaces, and close synonyms by matching the intended meaning against the supplied data.",
    "If one user question has multiple parts and answers are present across 2 or 3 saved Q&A/training entries, combine only the relevant pieces into one answer.",
    "If part of the answer is present, answer that part and then add the fallback sentence only for the missing part. In that case set canAnswer=true.",
    "Set canAnswer=false only when no useful course-related answer is present at all in the supplied data.",
    "If the visitor asks about another course, do not answer from the current course. Give the other course link only.",
    "If the visitor asks about samples, pictures, PDFs, or attached material, include the exact supplied link.",
    "If the visitor asks about requirements/documents/proceeding, answer only from course data, then ask them to confirm any course/session/details already mentioned in the chat. Do not invent missing documents.",
    "For greetings or casual small talk, answer briefly and do not use the fallback sentence.",
    `Fallback sentence: ${BOT_FALLBACK_ANSWER}`,
    extraInstruction ? `Extra admin instruction: ${extraInstruction}` : "",
    "",
    "COURSE CONTEXT START",
    context,
    "COURSE CONTEXT END",
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseBotJson(raw: string) {
  const trimmed = raw.trim();
  const jsonText =
    trimmed.startsWith("{") && trimmed.endsWith("}")
      ? trimmed
      : trimmed.match(/\{[\s\S]*\}/)?.[0] || "";

  try {
    const parsed = JSON.parse(jsonText) as { canAnswer?: unknown; answer?: unknown };
    return {
      canAnswer: parsed.canAnswer === true,
      answer: typeof parsed.answer === "string" ? parsed.answer.trim() : "",
    };
  } catch {
    return {
      canAnswer: false,
      answer: BOT_FALLBACK_ANSWER,
    };
  }
}
