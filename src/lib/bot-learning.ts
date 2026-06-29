import { prisma } from "@/lib/prisma";
import { callBotJson } from "@/lib/bot-ai";
import { fetchPrivateSiteSettingsFromDb } from "@/lib/get-site-settings";

// How many source knowledge items (course description + each Q&A) one trigger
// processes. Keeps each run to a single model call within the request timeout;
// the admin clicks again for the rest.
const MAX_UNITS_PER_RUN = 12;
const MAX_PAIRS_PER_RUN = 80;

export type LearningResult = {
  created: number;
  processedUnits: number;
  remainingUnits: number;
  totalUnits: number;
};

type SourceUnit = {
  ref: string;
  label: string;
  question: string;
  answer: string;
};

type GeneratedPair = { ref?: unknown; question?: unknown; answer?: unknown };

function clip(value: string | null | undefined, max: number) {
  const text = (value || "").trim();
  return text.length <= max ? text : `${text.slice(0, max)}...`;
}

// Escape raw control characters (e.g. literal newlines left inside JSON string
// values) so JSON.parse can still succeed. Avoids a regex char-range literal.
function escapeControlChars(input: string) {
  let out = "";
  for (const char of input) {
    const code = char.charCodeAt(0);
    if (code >= 32) {
      out += char;
    } else if (char === "\n") {
      out += "\\n";
    } else if (char === "\t") {
      out += "\\t";
    } else if (char === "\r") {
      out += "\\r";
    } else {
      out += " ";
    }
  }
  return out;
}

// Tolerant parse of {"pairs":[{ref,question,answer}]} from the model output.
function parsePairs(raw: string): GeneratedPair[] {
  const text = (raw || "")
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return [];

  const slice = text.slice(start, end + 1);
  for (const candidate of [slice, escapeControlChars(slice)]) {
    try {
      const parsed = JSON.parse(candidate) as { pairs?: unknown };
      if (Array.isArray(parsed.pairs)) return parsed.pairs as GeneratedPair[];
    } catch {
      // try the next candidate
    }
  }
  return [];
}

const LEARNING_SYSTEM_PROMPT = [
  "You are preparing offline training Q&A for a course assistant bot. Your job is to turn each KNOWLEDGE ITEM into the real questions visitors would ask, each with a short correct answer.",
  "Grounding: use ONLY facts present inside that item. Never invent technologies, durations, fees, documents, dates, eligibility, or promises that are not in the item.",
  "Lists are important: if an item's content lists options (available technologies, diplomas, years, trades, fees, etc.), create ONE question per listed option — e.g. 'Kya Mechanical ka 3 saal ka diploma mil sakta hai?' with a yes/no answer strictly from the list — PLUS one summary question that lists all available options.",
  "Write questions exactly how real visitors type them: short, natural, Roman Urdu / Urdu / English mix, with common phrasings and synonyms. Keep answers concise and factual, in the same language style as the source answer.",
  "Generate 1 to 5 pairs per item (lists may produce more). Do not duplicate the same question.",
  "Tag every pair with the REF of the item it came from.",
  'Return ONLY a single-line JSON object: {"pairs":[{"ref":"...","question":"...","answer":"..."}]}. No markdown, no prose. Inside strings escape newlines as \\n and quotes as \\".',
].join("\n");

function buildUserPrompt(courseTitle: string, units: SourceUnit[]) {
  return [
    `COURSE TITLE: ${courseTitle}`,
    "",
    "KNOWLEDGE ITEMS — generate anticipated visitor Q&A for each and tag with its REF:",
    ...units.map((unit, index) =>
      [
        `--- ITEM ${index + 1} | REF=${unit.ref} | ${unit.label} ---`,
        unit.question ? `Saved question: ${unit.question}` : null,
        `Content: ${unit.answer}`,
      ]
        .filter(Boolean)
        .join("\n")
    ),
  ].join("\n");
}

export async function runBotLearning(
  courseId: string,
  options: { rebuild?: boolean } = {}
): Promise<LearningResult> {
  const settings = await fetchPrivateSiteSettingsFromDb();
  if (!settings.botApiKey || !settings.botModel) {
    throw new Error("Bot model (provider/model/API key) configure nahi hai.");
  }

  const course = await prisma.course.findUnique({
    where: { id: courseId },
    include: {
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
    },
  });

  if (!course) throw new Error("Course nahi mila.");

  if (options.rebuild) {
    await prisma.botTrainingEntry.deleteMany({ where: { courseId, source: "self" } });
  }

  const allUnits: SourceUnit[] = [];
  if (course.description?.trim()) {
    allUnits.push({
      ref: "description",
      label: "Course description",
      question: "",
      answer: clip(course.description, 3000),
    });
  }
  for (const item of course.questions) {
    if (!item.answer?.trim()) continue;
    allUnits.push({
      ref: `question:${item.id}`,
      label: "Published Q&A",
      question: clip(item.question, 600),
      answer: clip(item.answer, 2000),
    });
  }
  for (const item of course.userQuestions) {
    if (!item.answer?.trim()) continue;
    allUnits.push({
      ref: `userQuestion:${item.id}`,
      label: "Answered user Q&A",
      question: clip(item.question, 600),
      answer: clip(item.answer, 2000),
    });
  }

  const learned = await prisma.botTrainingEntry.findMany({
    where: { courseId, source: "self", sourceRef: { not: null } },
    select: { sourceRef: true },
  });
  const learnedRefs = new Set(learned.map((entry) => entry.sourceRef));

  const pending = allUnits.filter((unit) => !learnedRefs.has(unit.ref));
  const batch = pending.slice(0, MAX_UNITS_PER_RUN);

  if (batch.length === 0) {
    return {
      created: 0,
      processedUnits: 0,
      remainingUnits: 0,
      totalUnits: allUnits.length,
    };
  }

  const raw = await callBotJson(
    settings,
    LEARNING_SYSTEM_PROMPT,
    buildUserPrompt(course.title, batch),
    '{"pairs"'
  );
  const pairs = parsePairs(raw);

  const validRefs = new Set(batch.map((unit) => unit.ref));
  const refsWithPairs = new Set<string>();
  const toCreate: Array<{
    courseId: string;
    question: string;
    answer: string;
    source: string;
    sourceRef: string;
  }> = [];

  for (const pair of pairs) {
    const question = typeof pair.question === "string" ? pair.question.trim() : "";
    const answer = typeof pair.answer === "string" ? pair.answer.trim() : "";
    if (!question || !answer) continue;
    const ref =
      typeof pair.ref === "string" && validRefs.has(pair.ref) ? pair.ref : batch[0].ref;
    refsWithPairs.add(ref);
    toCreate.push({
      courseId,
      question: question.slice(0, 1000),
      answer: answer.slice(0, 3000),
      source: "self",
      sourceRef: ref,
    });
    if (toCreate.length >= MAX_PAIRS_PER_RUN) break;
  }

  // Every processed unit must end up with at least one entry, otherwise it would
  // be reprocessed on every future trigger. For units the model skipped, fall
  // back to a passthrough entry built from the source content itself.
  for (const unit of batch) {
    if (refsWithPairs.has(unit.ref)) continue;
    toCreate.push({
      courseId,
      question: (unit.question || `${course.title} — is ke baare mein batayein`).slice(0, 1000),
      answer: unit.answer.slice(0, 3000),
      source: "self",
      sourceRef: unit.ref,
    });
  }

  if (toCreate.length) {
    await prisma.botTrainingEntry.createMany({ data: toCreate });
  }

  return {
    created: toCreate.length,
    processedUnits: batch.length,
    remainingUnits: pending.length - batch.length,
    totalUnits: allUnits.length,
  };
}
