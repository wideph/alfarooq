import { prisma } from "@/lib/prisma";

export const BOT_FALLBACK_ANSWER =
  "aap k is swal ka jawab is waqt mery pass nahi hai, Senior assistant ap k swal ka jawab 24 hours men isi course k swal jawab k section men post ker den gy, ya 24 hours baad aap is swal ka jawab muj sy isi jaga per pochh sakty hen.";

export const BOT_WHATSAPP_CONTACT_GUIDE =
  "Aap ko sari zaroori malomat yahin par mil jayegi. Malomat lene ke baad apne documents share karne ke liye neeche diye gaye WhatsApp link par click karke hamare number par bhej dein.";

export const BOT_BLOCKED_ANSWER =
  "Aap ke alfaaz munasib nahi hain. Is IP ko block kiya ja raha hai.";

export const BOT_NAMES = ["Asad", "Hammad", "Ramiz", "Ahmed", "Haroon"] as const;

const REQUIREMENT_WORDS = [
  "requirement",
  "requirements",
  "document",
  "documents",
  "proceed",
  "chahye",
  "chahiye",
  "kya kya",
  "kya chahiye",
  "darkar",
  "kaghzat",
  "kaghazat",
  "papers",
  "apply",
  "admission",
  "daakhla",
  "dakhla",
  "register",
  "registration",
  "enroll",
  "enrollment",
  "درکار",
  "کاغذات",
  "دستاویز",
  "چاہیے",
  "پروسیڈ",
  "داخلہ",
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

// "Are you AI / a robot / human?" and "what is your name?" — identity questions.
// Only match when the question is clearly about the bot ("you/tum/aap"), so a
// course-name question like "course ka naam kya hai" is NOT hijacked.
const IDENTITY_PATTERNS =
  /\bwho are you\b|\btum (kon|kaun)\b|\b(your|tumhara|tmhara|tumhare|tera|aap ?ka|aapka|apka)\s*(naam|name)\b|\bwhat'?s your name\b|\b(are|r)\s*(you|u)\b[^.?!]*\b(a\.?i\.?|ai|robot|bot|human|insaan|insan|machine)\b|\bkya\b[^.?!]*\btum\b[^.?!]*\b(a\.?i\.?|ai|robot|insaan|insan|human|machine)\b|\btum\s*(a\.?i\.?|ai|robot|insaan|insan|human|machine)\s*ho\b/i;

// "How do you answer SO fast?" — requires the "so/itna/kitna fast" notion so it
// does not fire on requests like "jaldi jawab chahiye".
const SPEED_PATTERNS =
  /\b(itn[aeiy]|kitn[aeiy]|so|this)\b[^.?!]*\b(jaldi|jald|fast|quick(?:ly)?|speed)\b/i;

// "What is your WhatsApp number / how do I contact you?"
const WHATSAPP_CONTACT_PATTERNS = [
  /whats?\s?app/i,
  /\bwhatsap\b/i,
  /contact\s*(number|no|details)/i,
  /\b(aap ?ka|aapka|apka|tumhara|tmhara|tera|your)\s*number\b/i,
  /\bnumber\s*(kya|kia|btao|batao|do|den|den?gy|share)\b/i,
  /\brabta\s*(number|no|kaise|kese)\b/i,
];

const ABUSIVE_PATTERNS = [
  /\bfuck(?:ing)?\b/i,
  /\bshit\b/i,
  /\bbitch\b/i,
  /\basshole\b/i,
  /\bbastard\b/i,
  /\bchutiya\b/i,
  /\bchutia\b/i,
  /\bchutya\b/i,
  /\bmadar\s*chod\w*\b/i,
  /\bmother\s*fucker\b/i,
  /\bbhen\s*chod\w*\b/i,
  /\bbehen\s*chod\w*\b/i,
];

export function isRequirementQuestion(message: string) {
  const normalized = message.toLowerCase();
  return REQUIREMENT_WORDS.some((word) => normalized.includes(word));
}

export function isWhatsappContactQuestion(message: string) {
  return WHATSAPP_CONTACT_PATTERNS.some((pattern) => pattern.test(message));
}

export function isAbusiveMessage(message: string) {
  return ABUSIVE_PATTERNS.some((pattern) => pattern.test(message));
}

export function normalizeBotName(name: string | null | undefined) {
  const cleanName = (name || "").trim();
  return BOT_NAMES.includes(cleanName as (typeof BOT_NAMES)[number]) ? cleanName : "";
}

export function pickBotName(seed: string) {
  let hash = 0;
  for (const char of seed || `${Date.now()}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return BOT_NAMES[hash % BOT_NAMES.length];
}

export function getGeneralChatAnswer(message: string, botName = "Asad") {
  const normalized = message.trim().toLowerCase();
  if (!normalized) return "";

  const wordCount = normalized.split(/\s+/).filter(Boolean).length;
  if (wordCount > 14) return "";

  // Identity ("are you AI / a robot / your name?"). One consistent name per chat.
  if (IDENTITY_PATTERNS.test(normalized)) {
    return `Mera naam ${botName} hai. Main is course ke baare mein aapki madad kar sakta hoon.`;
  }

  // "How do you answer so fast?"
  if (SPEED_PATTERNS.test(normalized)) {
    return "aap k swalon k jawabat mery pass pehly sy mojod hen is liye men aap k sawal ka jawab jald az jald dy pata hu.";
  }

  const isGeneral = GENERAL_CHAT_PATTERNS.some((pattern) => pattern.test(normalized));
  if (!isGeneral) return "";

  const diplomaPrompt =
    "Aap ka diploma/certificate ke related koi question ho to aap pooch sakty hen.";

  if (/\bthanks?\b|\bthank you\b|\bshukriya\b/i.test(normalized)) {
    return `Aap ka shukriya. ${diplomaPrompt}`;
  }

  const askedWellbeing = /\bkya hal\b|\bkaise ho\b|\bkesy ho\b|\bkaisay ho\b/i.test(
    normalized
  );
  const greeted = /\bass?alam\b|\bsalam\b|\bhello\b|\bhi\b|\bhey\b/i.test(normalized);

  if (greeted && askedWellbeing) {
    return `Wa alaikum assalam. Main theek hun, shukriya. ${diplomaPrompt}`;
  }

  if (greeted) {
    return `Wa alaikum assalam. ${diplomaPrompt}`;
  }

  if (askedWellbeing) {
    return `Main theek hun, shukriya. ${diplomaPrompt}`;
  }

  return diplomaPrompt;
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

function clip(value: string | null | undefined, max = 2200) {
  const text = (value || "").trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max)}...`;
}

// Marks a Q&A entry whose answer has a sample (image/PDF) attached, so the model
// knows it must share that entry's Link when it answers from this entry.
function sampleAttachmentNote(
  mediaFilename: string | null | undefined,
  mediaType: string | null | undefined
) {
  if (!mediaFilename) return "  Sample attached to this answer: no";
  return `  Sample attached to this answer: yes (${mediaType || "file"}). If you answer using this entry, you MUST also give the Link above as a sample link.`;
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
    `CURRENT COURSE DESCRIPTION:\n${clip(course.description, 3500)}`,
    "",
    "SAMPLES / ATTACHED MATERIAL LINKS:",
    ...course.samples.map(
      (sample) =>
        `- ${sample.title} (${sample.type}) link: ${currentCourseUrl}#sample-${sample.id}`
    ),
    "",
    "PUBLISHED COURSE Q&A:",
    ...course.questions.map((item) =>
      [
        `- Q: ${clip(item.question, 900)}`,
        `  A: ${clip(item.answer, 2600)}`,
        `  Link: ${currentCourseUrl}#qa-${item.id}`,
        sampleAttachmentNote(item.answerMediaFilename, item.answerMediaType),
      ]
        .filter(Boolean)
        .join("\n")
    ),
    "",
    "ANSWERED USER Q&A AND TRAINING-ONLY ANSWERS:",
    ...course.userQuestions.map((item) =>
      [
        `- Q: ${clip(item.question, 900)}`,
        `  A: ${clip(item.answer, 2600)}`,
        `  Link: ${currentCourseUrl}#qa-user-${item.id}`,
        `  Training only: ${item.trainingOnly || item.status === "training"}`,
        sampleAttachmentNote(item.answerMediaFilename, item.answerMediaType),
      ]
        .filter(Boolean)
        .join("\n")
    ),
    "",
    "HIDDEN BOT TRAINING:",
    ...course.botTraining.map(
      (item) => `- Q: ${clip(item.question, 900)}\n  A: ${clip(item.answer, 2600)}`
    ),
    "",
    "OTHER COURSE LINKS:",
    ...(otherCourseLines.length ? otherCourseLines : ["- No other published courses."]),
  ].join("\n");

  return { course, context };
}

export function buildBotSystemPrompt(context: string, extraInstruction: string) {
  return [
    "You are the website course Q&A assistant. Your default behaviour is to HELP and ANSWER.",
    'Output format: return ONLY a single-line JSON object: {"canAnswer": boolean, "answer": string}.',
    'JSON rules: no markdown, no code fences, no text before or after the JSON. Inside the "answer" string escape newlines as \\n and quotes as \\". Keep the whole reply valid JSON.',
    "",
    "ANSWERING POLICY (read carefully):",
    "- Answer the question whenever the supplied data contains anything relevant, even partially. Lean strongly towards canAnswer=true.",
    "- Set canAnswer=false ONLY when the supplied data is completely silent about the topic. This must be the rare exception, not the default.",
    "- The fallback sentence is a last resort. Do NOT use it just because the wording differs, the question is informal, or you are slightly unsure.",
    "- Treat EVERY published Q&A answer, answered user Q&A, hidden bot training entry, and the course description as a knowledge base. Search across all of them, in both the questions and the answers.",
    "- Match by meaning, not exact words. The user may write in Roman Urdu, Urdu, English, or a mix, with typos, missing spaces, slang, plural/singular changes, reordered or shortened words. Infer the intent, then find the matching facts. Small wording changes to fit the user's language are allowed, but keep the meaning of admin answers unchanged.",
    "- Map synonyms to the same concept (e.g. documents = papers = kaghazat = darkar = requirements; proceed = aage barhna = apply = daakhla).",
    "- If the answer spans 2-3 entries, combine only the relevant pieces into one clear answer.",
    "- If you can answer part of it, answer that part (canAnswer=true) and append the fallback sentence only for the missing part.",
    "",
    "GROUNDING:",
    "- Use only the supplied data. Never invent documents, fees, dates, prices, promises, or requirements that are not in the data.",
    "",
    "SAMPLES, IMAGES & LINKS:",
    "- If the visitor asks about a sample, picture, image, PDF, photo, attachment, or any attached material, include the EXACT supplied link for that item so clicking it scrolls them to it.",
    "- If a Q&A answer has an attached image/PDF, share that Q&A's supplied link too.",
    "- IMPORTANT: whenever the Q&A entry you used to build your answer is marked 'Sample attached to this answer: yes', you MUST include that entry's Link in your reply (as a short labelled markdown link) so the visitor can open the attached sample — even if they did not explicitly ask for a sample.",
    "- KEEP your normal helpful message/explanation about the item. Do NOT shrink the answer down to only a link. Write the useful sentences first, then include the link.",
    "- Render the link itself with a short, suitable label using markdown link format, e.g. [Sample dekhein](LINK) or [Yahan dekhein](LINK). Only the link's visible text becomes the short label; never paste a raw long URL as the visible text, and never drop your message.",
    "- Bare domains such as bbte.edu.pk are valid links; preserve the domain/URL exactly inside the markdown link target.",
    "- If the visitor asks about a different course, do not answer from the current course; give a brief message and that other course's link as a short labelled markdown link.",
    "",
    "REQUIREMENTS / DOCUMENTS / PROCEEDING:",
    "- When the visitor asks what documents/requirements are needed, how to apply, how to proceed, where to send documents, how to send documents, or what they have to provide, find the saved documents/requirements answer in the supplied data and give that answer to the visitor (rephrased only to fit their language; keep its meaning).",
    "- Then read your own answer and continue the conversation: ask the visitor for any further details needed to proceed that the data does not already cover, and request anything still missing.",
    "- If the visitor already mentioned their course, session, program or similar details earlier in this chat, confirm those back to them (e.g. ask whether those details are correct for their case) instead of asking again.",
    "- Set canAnswer=true for these questions whenever the data lists any documents/requirements. Do not invent documents that are not in the data.",
    "",
    "PROCEDURE vs PROCEED (differentiate carefully):",
    "- If the visitor asks about the PROCEDURE / process / tareeqa-e-kaar / fee plan / installments / 'procedure kya hai' / 'tariqa kya hai' — give the saved PAYMENT SCHEDULE answer from the data.",
    "- If the visitor asks HOW TO PROCEED / how to apply / how to move forward / where & how to send documents / 'proceed kaise karein' / 'aage kaise barhein' — give the saved DOCUMENTS answer from the data.",
    "- These two are different questions with different saved answers. Read the data, pick the matching one, and do not swap a procedure (payment schedule) question for a proceed (documents) answer or vice versa.",
    "",
    "GENUINENESS / AUTHENTICITY:",
    "- If the visitor asks whether something is genuine, real, original, asli, authentic, verified, valid, ya jaali/fake, reply with the saved answer's wording from the data WORD FOR WORD. Do NOT add, remove, rephrase, translate, soften, or pad it with any wording of your own.",
    "- If no saved answer covers genuineness, use the fallback sentence as-is.",
    "",
    "CONTACT / WHATSAPP NUMBER:",
    "- If the visitor asks for your phone/WhatsApp number or how to contact you, do not paste a raw number. Tell them they will get all the information here in the chat, and that after getting the information they can click the WhatsApp link to share their documents on our number.",
    "",
    "SMALL TALK:",
    "- For greetings, your name, thanks, or casual chat, reply naturally and briefly. Never use the fallback sentence for casual chat.",
    "",
    `Fallback sentence (use sparingly, exact text): ${BOT_FALLBACK_ANSWER}`,
    extraInstruction ? `Extra admin instruction (follow this): ${extraInstruction}` : "",
    "",
    "COURSE CONTEXT START",
    context,
    "COURSE CONTEXT END",
  ]
    .filter(Boolean)
    .join("\n");
}

export type ParsedBotReply = {
  canAnswer: boolean;
  answer: string;
  parsed: boolean;
};

// Pull the first balanced {...} object out of a larger string. If the JSON was
// truncated (model hit the token limit) we still return from the first "{" so
// the recovery/sanitize steps can salvage a partial answer.
function extractJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start === -1) return "";

  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (char === "\\") {
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "{") depth++;
    else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return text.slice(start);
}

// Models frequently emit raw newlines / tabs / control characters inside JSON
// string values, which is invalid JSON. Escape them so JSON.parse succeeds.
// Also closes an unterminated string and balances braces when the reply was cut
// off mid-stream.
function sanitizeJsonText(text: string) {
  let out = "";
  let inString = false;
  let escape = false;
  let depth = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (escape) {
      out += char;
      escape = false;
      continue;
    }
    if (char === "\\") {
      out += char;
      escape = true;
      continue;
    }
    if (char === '"') {
      inString = !inString;
      out += char;
      continue;
    }
    if (inString) {
      if (char === "\n") out += "\\n";
      else if (char === "\r") out += "\\r";
      else if (char === "\t") out += "\\t";
      else if (char.charCodeAt(0) < 0x20)
        out += `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
      else out += char;
      continue;
    }
    if (char === "{") depth++;
    else if (char === "}") depth--;
    out += char;
  }

  if (inString) out += '"';
  while (depth-- > 0) out += "}";
  return out;
}

// Last-resort extraction of just the "answer" field from broken JSON.
function recoverAnswerField(text: string) {
  const match = text.match(/"answer"\s*:\s*"((?:[^"\\]|\\.)*)/);
  if (!match) return "";
  try {
    return (JSON.parse(`"${match[1]}"`) as string).trim();
  } catch {
    return match[1]
      .replace(/\\n/g, "\n")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .trim();
  }
}

export function parseBotJson(raw: string): ParsedBotReply {
  const trimmed = (raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  if (!trimmed) return { canAnswer: false, answer: "", parsed: false };

  const jsonText = extractJsonObject(trimmed);

  for (const candidate of [jsonText, sanitizeJsonText(jsonText)]) {
    if (!candidate) continue;
    try {
      const parsed = JSON.parse(candidate) as { canAnswer?: unknown; answer?: unknown };
      const answer = typeof parsed.answer === "string" ? parsed.answer.trim() : "";
      if (answer || typeof parsed.canAnswer === "boolean") {
        return { canAnswer: parsed.canAnswer === true, answer, parsed: true };
      }
    } catch {
      // fall through to the next candidate / recovery
    }
  }

  const recovered = recoverAnswerField(jsonText);
  if (recovered) return { canAnswer: true, answer: recovered, parsed: true };

  // The model ignored the JSON contract and replied in plain prose. Use it
  // rather than burning the turn on a fallback.
  if (!trimmed.includes("{") && !trimmed.includes("}")) {
    return { canAnswer: true, answer: trimmed, parsed: true };
  }

  return { canAnswer: false, answer: "", parsed: false };
}
