import { prisma } from "@/lib/prisma";
import { stripBotInstructions } from "@/lib/strip-instructions";

export const BOT_FALLBACK_ANSWER =
  "aap k is swal ka jawab is waqt mery pass nahi hai, Senior assistant ap k swal ka jawab 24 hours men isi course k swal jawab k section men post ker den gy, ya 24 hours baad aap is swal ka jawab muj sy isi jaga per pochh sakty hen.";

export const BOT_WHATSAPP_CONTACT_GUIDE =
  "Aap ko sari zaroori malomat yahin par mil jayegi. Malomat lene ke baad apne documents share karne ke liye neeche diye gaye WhatsApp link par click karke hamare number par bhej dein.";

export const BOT_SAMPLE_INTRO =
  "har technology aur har year ka sample save kerna possible nahi hota hai, lakin format samajany k liye sample k nechy diye huye link per click karen";

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

// "Show me a sample / send the sample / can you show a sample?"
const SAMPLE_REQUEST_PATTERNS = [
  /\bsample\b[^.?!]*\b(dikh\w*|dekh\w*|show|send|bhej\w*|chahiy?e|de\s*do|de\s*sakt\w*)\b/i,
  /\b(dikh\w*|dekh\w*|show|send|bhej\w*)\b[^.?!]*\bsample\b/i,
  /\b(namoona|namuna|nmoona)\b/i,
  /نمونہ/,
  /سیمپل/,
];

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

export function isSampleRequest(message: string) {
  return SAMPLE_REQUEST_PATTERNS.some((pattern) => pattern.test(message));
}

export function buildSampleLinks(
  courseId: string,
  samples: Array<{ id: string; title: string | null }>
) {
  return samples
    .map((sample) => {
      const label = (sample.title || "").trim() || "Sample";
      return `[${label} dekhein](/courses/${courseId}#sample-${sample.id})`;
    })
    .join("\n");
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

export type BotDecisionTreeAnswer = {
  answer: string;
  reason: string;
  canAnswer: true;
  offerWhatsapp?: boolean;
  queueForAdmin?: boolean;
};

type CourseDecisionData = {
  id: string;
  title: string;
  description: string | null;
  samples?: Array<{ id: string; title: string | null }>;
  questions?: Array<{
    id: string;
    question: string;
    answer: string;
    order: number;
    answerMediaFilename?: string | null;
    answerMediaType?: string | null;
  }>;
  userQuestions?: Array<{
    id: string;
    question: string;
    answer: string | null;
    status: string;
    trainingOnly?: boolean;
    answerMediaFilename?: string | null;
    answerMediaType?: string | null;
  }>;
  botTraining?: Array<{
    question: string;
    answer: string;
    source?: string;
  }>;
};

const PRICE_WORDS = [
  "price",
  "fee",
  "fees",
  "charges",
  "qeemat",
  "qimat",
  "kitne ka",
  "kitny ka",
  "kitna ka",
  "rate",
  "paisy",
  "paise",
];

const PAYMENT_WORDS = [
  "payment",
  "advance",
  "half payment",
  "installment",
  "installments",
  "schedule",
  "pement",
  "pay",
  "paise kab",
  "paisy kab",
];

const TIME_WORDS = [
  "time",
  "kitna time",
  "kitny time",
  "kitne time",
  "kitny din",
  "kitne din",
  "kab tak",
  "mil jae ga",
  "mil jayega",
  "mil jaye ga",
];

const ATTESTATION_WORDS = [
  "attestation",
  "attestations",
  "tasdeeq",
  "tasdeeqat",
  "verify",
  "verification",
  "mofa",
  "embassy",
  "ibcc",
  "sticker",
  "foreign office",
  "سعودی ایمبیسی",
  "موفا",
  "تصدیق",
];

const GENUINE_WORDS = [
  "genuine",
  "original",
  "fake",
  "asli",
  "jaali",
  "jenuine",
  "جنون",
  "اصلی",
  "جعلی",
];

const SEC_WORDS = [
  "saudi engineering council",
  "sec",
  "sce",
  "membership",
  "technician",
  "engineering council",
];

const OLD_DATE_WORDS = [
  "back date",
  "back dates",
  "backdated",
  "old date",
  "old year",
  "purani",
  "porani",
  "tareekh",
  "tareekhon",
  "tarikh",
  "treekh",
  "treekhon",
  "result year",
  "final result",
];

const TECHNOLOGY_ALIASES = [
  {
    aliases: ["civil", "construction", "quality control", "quantity survey"],
    preferred: "Civil Technology",
  },
  {
    aliases: ["mechanical", "machanical", "mechaniacal", "macheniacal"],
    preferred: "Mechanical Technology",
  },
  {
    aliases: ["electrical", "electric"],
    preferred: "Electrical Technology",
  },
  {
    aliases: ["instrumentation", "instrument"],
    preferred: "Instrumentation Technology",
  },
  {
    aliases: ["aviation", "avionics", "avionic"],
    preferred: "Avionics Technology",
    note:
      "Aviation naam se exact diploma list mein nahi, lekin Avionics Technology list mein mojood hai.",
  },
  {
    aliases: ["telecom", "telecommunication"],
    preferred: "Telecommunication Technology",
  },
  {
    aliases: ["electronics", "electronic"],
    preferred: "Electronics Technology",
  },
  {
    aliases: ["computer", "cit", "it", "information technology"],
    preferred: "Computer Information Technology",
  },
  {
    aliases: ["chemical"],
    preferred: "Chemical Technology",
  },
  {
    aliases: ["petroleum", "petrochemical"],
    preferred: "Petroleum Technology",
  },
  {
    aliases: ["biomedical", "bio medical", "medical"],
    preferred: "Bio-Medical Technology",
  },
  {
    aliases: ["environmental", "environment", "hse", "health and safety", "safety"],
    preferred: "Environmental Technology",
    note:
      "Health and Safety / HSE ke liye BBTE list mein Quality Control and HSE specialization aur Environmental Technology mojood hain.",
  },
  { aliases: ["mining", "mine"], preferred: "Mining Technology" },
  { aliases: ["textile"], preferred: "Textile Weaving Technology" },
  { aliases: ["garment"], preferred: "Garment Technology" },
  { aliases: ["furniture"], preferred: "Furniture Design & Technology" },
  { aliases: ["leather"], preferred: "Leather Technology" },
  { aliases: ["footwear"], preferred: "Footwear Technology" },
  { aliases: ["automation"], preferred: "Automation Technology" },
  { aliases: ["food"], preferred: "Food Technology" },
  { aliases: ["printing", "graphic"], preferred: "Printing and Graphic Arts Technology" },
  { aliases: ["gis", "geographic"], preferred: "Geographic Information System (GIS) Technology" },
  { aliases: ["agriculture"], preferred: "Agriculture Technology" },
] as const;

function normalizeLookup(value: string | null | undefined) {
  return (value || "")
    .toLowerCase()
    .replace(/[\u064b-\u065f]/g, "")
    .replace(/[^a-z0-9+\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function includesAny(normalized: string, words: readonly string[]) {
  return words.some((word) => normalized.includes(normalizeLookup(word)));
}

function hasYear(normalized: string) {
  return /\b(?:19|20)\d{2}\b/.test(normalized);
}

function detectDuration(normalized: string) {
  if (/\b(?:3|three|teen|tin)\s*(?:year|years|saal|sala|سال)\b/.test(normalized)) {
    return 3;
  }
  if (/\b(?:2|two|do)\s*(?:year|years|saal|sala|سال)\b/.test(normalized)) {
    return 2;
  }
  if (/\b(?:1|one|aik|ek)\s*(?:year|years|saal|sala|سال)\b/.test(normalized)) {
    return 1;
  }
  return null;
}

function publicQuestionByOrder(course: CourseDecisionData, order: number) {
  return course.questions?.find((item) => Math.round(item.order) === order) || null;
}

function publicQuestionMatching(
  course: CourseDecisionData,
  matcher: (text: string, item: NonNullable<CourseDecisionData["questions"]>[number]) => boolean
) {
  return (
    course.questions?.find((item) =>
      matcher(normalizeLookup(`${item.question}\n${item.answer}`), item)
    ) || null
  );
}

function trainingMatching(
  course: CourseDecisionData,
  matcher: (text: string) => boolean
) {
  return (
    course.botTraining?.find((item) =>
      matcher(normalizeLookup(`${item.question}\n${item.answer}`))
    ) || null
  );
}

function qaAnswer(
  course: CourseDecisionData,
  item: {
    id: string;
    answer: string | null;
    answerMediaFilename?: string | null;
    answerMediaType?: string | null;
  },
  options: { linkMedia?: boolean; userQuestion?: boolean } = {}
) {
  const answer = stripBotInstructions(item.answer || "");
  if (!answer) return "";
  if (options.linkMedia && item.answerMediaFilename) {
    const prefix = options.userQuestion ? "qa-user" : "qa";
    return `${answer}\n\n[Sample dekhein](/courses/${course.id}#${prefix}-${item.id})`;
  }
  return answer;
}

function findAvailabilityQuestion(course: CourseDecisionData) {
  return (
    publicQuestionMatching(
      course,
      (text) => text.includes("disciplines") && text.includes("mechanical technology")
    ) || publicQuestionByOrder(course, 29)
  );
}

function technologyNames(course: CourseDecisionData) {
  const source = findAvailabilityQuestion(course)?.answer || "";
  return source
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !/^disciplines:?$/i.test(line));
}

function findTechnology(message: string, course: CourseDecisionData) {
  const normalized = normalizeLookup(message);
  const names = technologyNames(course);
  const normalizedNames = names.map((name) => ({
    name,
    normalized: normalizeLookup(name),
  }));

  for (const item of TECHNOLOGY_ALIASES) {
    if (!includesAny(normalized, item.aliases)) continue;
    const found =
      normalizedNames.find((candidate) =>
        candidate.normalized.includes(normalizeLookup(item.preferred))
      ) || normalizedNames.find((candidate) => includesAny(candidate.normalized, item.aliases));
    if (found) {
      return { name: found.name, note: "note" in item ? item.note : "" };
    }
  }

  for (const candidate of normalizedNames) {
    const tokens = candidate.normalized
      .split(" ")
      .filter(
        (token) =>
          token.length >= 4 &&
          !["technology", "with", "specialization", "and", "the"].includes(token)
      );
    if (tokens.some((token) => normalized.includes(token))) {
      return { name: candidate.name, note: "" };
    }
  }

  return null;
}

function isAvailabilityQuestion(normalized: string) {
  return (
    includesAny(normalized, [
      "mil",
      "mily",
      "milay",
      "available",
      "provide",
      "dety",
      "dilwa",
      "chahiye",
      "chaye",
      "diploma",
      "technology",
      "dae",
    ]) && includesAny(normalized, ["diploma", "technology", "certificate", "mil", "available"])
  );
}

function documentsAnswer(): string {
  return [
    "Diploma process karne ke liye ye documents/details chahiye:",
    "CNIC front/back ki picture",
    "Aakhri taleemi sanad, kam az kam matric",
    "Trade/technology ka naam",
    "Duration: 1, 2 ya 3 years",
    "Final result kis year ka chahiye",
    "Passport size photo",
    "",
    "Agar aap information se mutmain hain aur proceed karna chahte hain to ye details WhatsApp par share kar dein.",
  ].join("\n");
}

function priceAnswer(duration: number | null, withoutEmbassy: boolean) {
  if (withoutEmbassy) {
    if (duration === 3) return "Without Embassy aur MOFA attestation 3 years diploma 70000 rupees mein milega.";
    if (duration === 2) return "Without Embassy aur MOFA attestation 2 years diploma 55000 rupees mein milega.";
    if (duration === 1) return "Without Embassy aur MOFA attestation 1 year diploma 40000 rupees mein milega.";
    return [
      "Without Embassy aur MOFA attestation rates:",
      "3 years: 70000 rupees",
      "2 years: 55000 rupees",
      "1 year: 40000 rupees",
    ].join("\n");
  }

  if (duration === 3) return "3 years Balochistan Technical Board diploma 90000 rupees mein milega.";
  if (duration === 2) return "2 years Balochistan Technical Board diploma 70000 rupees mein milega.";
  if (duration === 1) return "1 year Balochistan Technical Board diploma 55000 rupees mein milega.";
  return [
    "Balochistan Technical Board diploma rates:",
    "3 years: 90000 rupees",
    "2 years: 70000 rupees",
    "1 year: 55000 rupees",
  ].join("\n");
}

function oldDateAnswer(normalized: string): BotDecisionTreeAnswer {
  if (hasYear(normalized)) {
    return {
      canAnswer: true,
      reason: "specific-old-year-partial",
      queueForAdmin: true,
      answer:
        "Final result ka year documents/details mein aap se liya jata hai, aur saved data ke mutabiq IBCC UV light security wala sticker back dates mein hota hai. Lekin jo specific year aap ne poocha hai, uski availability admin confirm karega. Aap trade/technology aur duration bhi bata dein taake confirm jawab mil jaye.",
    };
  }

  return {
    canAnswer: true,
    reason: "old-date-general",
    answer:
      "Saved details ke mutabiq final result ka year aap se liya jata hai, aur IBCC UV light security wala sticker back dates mein hota hai. Aap jis year ka result chahte hain wo year, trade aur duration bata dein.",
  };
}

export function answerCourseQuestionFromTree(
  message: string,
  course: CourseDecisionData | null
): BotDecisionTreeAnswer | null {
  if (!course) return null;

  const normalized = normalizeLookup(message);
  if (!normalized) return null;

  if (isRequirementQuestion(message)) {
    return {
      canAnswer: true,
      reason: "requirements",
      offerWhatsapp: true,
      answer: documentsAnswer(),
    };
  }

  const duration = detectDuration(normalized);
  const withoutEmbassy =
    includesAny(normalized, ["without embassy", "without mofa", "bina embassy", "baghair embassy"]) ||
    (includesAny(normalized, ["embassy", "mofa"]) && includesAny(normalized, ["bina", "without", "baghair"]));

  if (
    includesAny(normalized, ["matric"]) &&
    (includesAny(normalized, ["mofa", "embassy", "ibcc", "genuine", "original"]) ||
      includesAny(normalized, ATTESTATION_WORDS))
  ) {
    const secMatric = trainingMatching(course, (text) => text.includes("matric tech nahi mangti"));
    const packageDetails = publicQuestionByOrder(course, 3);
    return {
      canAnswer: true,
      reason: "matric-attestation-partial",
      queueForAdmin: true,
      answer: [
        secMatric
          ? stripBotInstructions(secMatric.answer)
          : "Saudi Engineering Council aam tor par matric tech nahi mangti; woh diploma check karte hain.",
        "",
        packageDetails
          ? qaAnswer(course, packageDetails)
          : "DAE package mein board attestation, IBCC sticker, Foreign Office Pakistan, Saudi Embassy aur MOFA Saudi Arabia sticker ki details saved hain.",
        "",
        "Matric ki separate IBCC/MOFA/Embassy attestation ya extra charges ki detail saved data mein clear nahi hai, is liye is part ko admin confirm karega.",
      ].join("\n"),
    };
  }

  if (includesAny(normalized, PRICE_WORDS)) {
    return {
      canAnswer: true,
      reason: "price",
      answer: priceAnswer(duration, withoutEmbassy),
    };
  }

  if (includesAny(normalized, PAYMENT_WORDS)) {
    const item = publicQuestionByOrder(course, 4);
    return {
      canAnswer: true,
      reason: "payment",
      answer:
        qaAnswer(course, item || { id: "", answer: "" }) ||
        "Documents ke sath advance nahi liya jata. Result bbte.edu.pk par online hone ke baad 24 hours mein half payment hoti hai; diploma/attestations ki photo ya video ke baad remaining payment hoti hai.",
    };
  }

  if (includesAny(normalized, TIME_WORDS) && !includesAny(normalized, ["sample", "namuna"])) {
    const item = publicQuestionByOrder(course, 10);
    return {
      canAnswer: true,
      reason: "timeline",
      answer:
        qaAnswer(course, item || { id: "", answer: "" }) ||
        "2-3 din mein result online hota hai; half payment ke baad 7 din mein diploma issue hota hai; attestations hon to mazeed taqreeban 10 din lagte hain. Total approx 20 din.",
    };
  }

  if (includesAny(normalized, OLD_DATE_WORDS) || hasYear(normalized)) {
    return oldDateAnswer(normalized);
  }

  const technology = findTechnology(message, course);
  if (technology && isAvailabilityQuestion(normalized)) {
    const note = technology.note ? `${technology.note}\n` : "";
    return {
      canAnswer: true,
      reason: "technology-availability",
      offerWhatsapp: includesAny(normalized, ["proceed", "apply", "chahiye", "chaye", "lena", "process"]),
      answer: `${note}G bilkul, ${technology.name} ka diploma BBTE available list mein mojood hai. Agar aap process karwana chahte hain to trade ka naam, duration aur final result year ke sath documents share kar dein.`,
    };
  }

  if (includesAny(normalized, ["nebosh", "iosh", "osha"])) {
    const item = publicQuestionByOrder(course, 25);
    return { canAnswer: true, reason: "outside-certification", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, ["degree", "graduation", "bachelor", "bs ", "master"])) {
    const item = publicQuestionByOrder(course, 20);
    return { canAnswer: true, reason: "degree-unavailable", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, ["punjab", "sindh", "kpk", "khyber", "another board", "aur board"])) {
    const item = publicQuestionByOrder(course, 12);
    return { canAnswer: true, reason: "other-board", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (
    includesAny(normalized, ATTESTATION_WORDS) &&
    includesAny(normalized, ["kon kon", "konsi", "konsy", "which", "details", "kerwa", "karwa", "do gy", "doge"])
  ) {
    const item = publicQuestionByOrder(course, 3);
    return {
      canAnswer: true,
      reason: "attestation-package",
      answer:
        qaAnswer(course, item || { id: "", answer: "" }) ||
        "3 years package mein board attestation, IBCC UV light security wala without-record sticker back dates mein, Foreign Office Pakistan edit-link attestation, Saudi Embassy attestation aur MOFA Saudi Arabia sticker shamil hain.",
    };
  }

  if (includesAny(normalized, ["edit link", "foreign office", "fo ", "mofa pakistan"])) {
    const item = publicQuestionByOrder(course, 6);
    return { canAnswer: true, reason: "edit-link", answer: qaAnswer(course, item || { id: "", answer: "" }, { linkMedia: true }) };
  }

  if (includesAny(normalized, ["ibcc", "sticker", "without record", "uv light"])) {
    const item = publicQuestionByOrder(course, 8);
    return { canAnswer: true, reason: "ibcc-sticker", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, GENUINE_WORDS)) {
    const diplomaOriginal = trainingMatching(course, (text) => text.includes("diploma original"));
    const item =
      includesAny(normalized, ["attestation", "attestations", "mofa", "embassy"])
        ? publicQuestionByOrder(course, 7) || publicQuestionByOrder(course, 3)
        : null;
    return {
      canAnswer: true,
      reason: "genuine-original",
      answer:
        (item ? qaAnswer(course, item) : "") ||
        (diplomaOriginal ? stripBotInstructions(diplomaOriginal.answer) : "") ||
        "Diploma online record ke sath hota hai; agar koi idara Balochistan Technical Board ko verification ke liye email kare to board verify karta hai.",
    };
  }

  if (includesAny(normalized, SEC_WORDS)) {
    if (includesAny(normalized, ["guarantee", "garranty", "zaroor", "confirm mil", "pakka"])) {
      const item = publicQuestionByOrder(course, 13);
      return { canAnswer: true, reason: "sec-guarantee", answer: qaAnswer(course, item || { id: "", answer: "" }) };
    }
    if (includesAny(normalized, ["apply", "membership ly", "membership le", "karwa", "kerwa"])) {
      const training = trainingMatching(course, (text) => text.includes("membership") && text.includes("aap khud"));
      return {
        canAnswer: true,
        reason: "sec-apply",
        answer:
          (training ? stripBotInstructions(training.answer) : "") ||
          "Is diploma aur attestations ke baad Saudi Engineering Council ki Technician membership aap khud Saudi Arabia se apply karenge. Board verification email par board diploma verify karta hai.",
      };
    }
    const item = publicQuestionByOrder(course, 5);
    return { canAnswer: true, reason: "sec-acceptance", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, ["matric", "science", "arts", "certificate"])) {
    if (includesAny(normalized, ["saudi engineering", "sec", "sce", "mang", "demand"])) {
      const training = trainingMatching(course, (text) => text.includes("matric tech nahi mangti"));
      return {
        canAnswer: true,
        reason: "matric-sec",
        queueForAdmin: includesAny(normalized, ["mofa", "embassy", "ibcc", "genuine"]),
        answer:
          (training ? stripBotInstructions(training.answer) : "") ||
          "Saudi Engineering Council aam tor par matric tech nahi mangti, woh diploma check karte hain. Behtar ye hai ke agar matric science nahi hai to pehle Matric Tech ki information lein.",
      };
    }
    const item = publicQuestionByOrder(course, 18);
    return { canAnswer: true, reason: "matric-eligibility", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, ["physical", "qvp"])) {
    const item = publicQuestionByOrder(course, 11);
    return { canAnswer: true, reason: "physical-verification", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, ["musaddaq", "mosadqa", "مصدقہ"])) {
    const item = publicQuestionByOrder(course, 14);
    return { canAnswer: true, reason: "musaddaq", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, ["hec"])) {
    const item = publicQuestionByOrder(course, 15);
    return { canAnswer: true, reason: "hec", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, ["office", "mulaqat", "meeting", "milna"])) {
    const item = publicQuestionByOrder(course, 16);
    return { canAnswer: true, reason: "office-meeting", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, ["call", "phone par", "bat ho sakti"])) {
    const item = publicQuestionByOrder(course, 19);
    return { canAnswer: true, reason: "call-policy", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, ["courier", "tcs", "saudi arabia men courier", "delivery"])) {
    const item = publicQuestionByOrder(course, 21);
    return { canAnswer: true, reason: "courier", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, ["discount", "kam", "riayat", "sasta"])) {
    const item = publicQuestionByOrder(course, 22);
    return { canAnswer: true, reason: "discount", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  if (includesAny(normalized, ["admission", "b tech", "btech", "university", "europe", "canada", "uk"])) {
    const item = publicQuestionByOrder(course, 17);
    return { canAnswer: true, reason: "further-use", answer: qaAnswer(course, item || { id: "", answer: "" }) };
  }

  return null;
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
      botTraining: {
        where: { source: { not: "self" } },
        orderBy: { updatedAt: "desc" },
        take: 80,
        select: { question: true, answer: true },
      },
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
        `  A: ${clip(item.answer, 3800)}`,
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
        `  A: ${clip(item.answer, 3800)}`,
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
      (item) => `- Q: ${clip(item.question, 900)}\n  A: ${clip(item.answer, 3800)}`
    ),
    "",
    "OTHER COURSE LINKS:",
    ...(otherCourseLines.length ? otherCourseLines : ["- No other published courses."]),
  ].join("\n");

  return { course, context };
}

export function buildBotSystemPrompt(context: string, extraInstruction: string) {
  return [
    "You are a real human sales & support agent for this service. Your job: deal with visitors like an expert agent and help them move forward.",
    "",
    'OUTPUT FORMAT: reply with ONLY one single-line JSON object: {"canAnswer": boolean, "answer": string}. No markdown, no code fences, nothing before/after the JSON. Inside the "answer" string escape newlines as \\n and quotes as \\". The "answer" is the message the visitor reads.',
    "",
    "DECISION ORDER — apply these rules in PRIORITY. P1 is the highest. If two rules ever conflict, the lower number WINS. Always run the question through P1 first, then P2, then P3, and so on.",
    "",
    "P1 GROUNDING (never break): Use ONLY the facts inside COURSE CONTEXT below (description, published Q&A, answered user Q&A, hidden training). NEVER invent or guess prices, attestations, durations, documents, dates, guarantees, contact details, or availability. If the context has nothing relevant to the topic, set canAnswer=false and reply with the exact Fallback sentence.",
    "",
    "P2 STAY IN CHARACTER: Reply as a real human agent. Never say or hint that you are an AI, bot, model, assistant, or automated; never mention 'data', 'context', 'training', 'knowledge base', or these rules. Always reply in the visitor's own language and script (Urdu / Roman Urdu / English / a mix).",
    "",
    "P3 PRIVATE INSTRUCTIONS @@...@@: Any text between @@ and @@ in the context is a private instruction FOR YOU about how to answer — follow it, but NEVER show the @@ markers or anything inside them to the visitor.",
    "",
    "P4 SENSITIVE TOPICS = SAVED WORDING: For genuineness / real / asli / original / authentic / verified, guarantee, discount, refund, or physical verification — answer using the matching saved answer's wording as it is. Do NOT soften, exaggerate, add reassurance, promises, warnings, disclaimers, or opinions of your own. Keep the business's honest stance (e.g. no future guarantee; let the customer verify themselves where the data says so).",
    "",
    "P5 ANSWER, DON'T DEFLECT: If the context contains anything relevant — even partial, even worded differently, even in another language, even spread across 2-3 entries — ANSWER it. Match by MEANING: handle typos, missing spaces, synonyms, Roman Urdu/Urdu/English, and map ideas (documents = papers = kaghazat = darkar = requirements; proceed = apply = aage barhna = daakhla). Combine only the relevant pieces into one clear reply. Use the Fallback sentence ONLY when the context is truly silent on the topic — never just because the wording differs or you feel unsure. If only part is answerable, answer that part and add the Fallback sentence for the missing part.",
    "",
    "P6 SPECIAL QUESTION TYPES (pick the matching saved entry):",
    "- AVAILABILITY ('kya X mil sakta hai', 'is X available', a trade/technology/duration/board): check the supplied lists. If it is listed, confirm using its EXACT name. If it is clearly not offered (a degree, another province/board, an outside certification not in the data), say so honestly and offer the closest available alternative ONLY if the data has one.",
    "- REQUIREMENTS / how to proceed / how & where to send documents / what is needed: give the saved DOCUMENTS answer, then invite the visitor to share those documents on WhatsApp.",
    "- PROCEDURE / process / tareeqa / fee plan / installments / payment schedule: give the saved PAYMENT-SCHEDULE answer. This is DIFFERENT from the documents answer — never swap the two.",
    "- SAMPLE / picture / attached material, OR any entry marked 'Sample attached to this answer: yes': keep your helpful message AND add that entry's link as a short markdown label, e.g. [Sample dekhein](LINK) — never a raw long URL, never drop the message. Preserve bare domains like bbte.edu.pk exactly.",
    "- ASKS YOUR PHONE / WHATSAPP NUMBER: do not paste a number; say the information is available here, and to share documents they can use the WhatsApp link.",
    "- ANOTHER COURSE: don't answer from the current one; give that other course's link as a short labelled markdown link.",
    "",
    "P7 DEALING STYLE: Warm, respectful, and concise — lead with the answer, keep it human-length (no wall of text). Be consultative: if you genuinely cannot answer without ONE missing detail (which trade, how many years, the purpose), ask one short friendly question; otherwise answer directly. Confirm details the visitor already shared. Gently guide them to the next step (share documents on WhatsApp) without pressure or repetition. Answer multiple questions briefly, one at a time.",
    "",
    "P8 SMALL TALK: For greetings, thanks, or your name, reply briefly and naturally — never use the Fallback sentence for casual chat.",
    "",
    `Fallback sentence (exact text, use only per P1/P5): ${BOT_FALLBACK_ANSWER}`,
    extraInstruction
      ? `ADMIN INSTRUCTION (obey this; it ranks just under P1-P4 and overrides P5-P8): ${extraInstruction}`
      : "",
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
