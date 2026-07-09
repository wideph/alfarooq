// Offline harness: runs real visitor questions through the exact live bot
// pipeline (general chat → whatsapp/sample short-circuits → saved knowledge →
// model) without HTTP, and reports which layer answered with what.
// Usage: npx tsx scripts/bot-harness.ts [--model] (--model also calls the LLM)
import { prisma } from "../src/lib/prisma";
import {
  answerCourseQuestionFromTree,
  answerFromSavedKnowledge,
  buildBotSystemPrompt,
  buildCourseBotContext,
  getGeneralChatAnswer,
  isRequirementQuestion,
  isSampleRequest,
  isWhatsappContactQuestion,
  parseBotJson,
  BOT_FALLBACK_ANSWER,
} from "../src/lib/bot";
import { callBotModel, type BotChatMessage } from "../src/lib/bot-ai";
import { fetchPrivateSiteSettingsFromDb } from "../src/lib/get-site-settings";
import { stripBotInstructions } from "../src/lib/strip-instructions";

const COURSE_ID = "cmq453f6o0000jj04foqutpoh"; // ٹیکنیکل ڈپلومہ (بلوچستان ٹیکنیکل بورڈ)
const USE_MODEL = process.argv.includes("--model");
// Extra questions can be passed on the command line after the flags.
const CLI_QUESTIONS = process.argv.slice(2).filter((arg) => !arg.startsWith("--"));

const QUESTIONS = [
  // Real production failures pulled from BotMessage history
  "attestation kon kon c kerwa k do gy?",
  "kon kon c attestion kerwa k do gy",
  "Matric science k sth ho or ap ko Matric ki ibcc ya agr mofa bhi khye toh genuine krwa kr di jaye?",
  "men 3 year ka mechaniacal ka diploma lena chahta hu, 2005 ka",
  "2018 ka diploma mil jay ga?",
  "Phr sample dykhy",
  "diploma ka sample dikhao",
  "kya mechanical ka 3 years diploma mil jay ga?",
  "instrumentation ka diploma mil jay ga?",
  "aviation ka diploma mil jay ga?",
  "supply chain ka diploma mil jay ga?",
  "matric arts k sath diploma mil jay ga?",
  "ager matric na ho ya matric k bager diploma hasil kiya ja sakta hai?",
  "kya balochistan technical board mojod hai?",
  "kin dates ka diploma mily ga?",
  "purani dates men diploma mil jay ga?",
  "Kitny time me mil jae ga?",
  "ٹائم کتنا لگے گا؟",
  "کتنا ٹائم لگے گا؟",
  "address kya hai apka?",
  "tum itna jaldi jawab kesy dy lety ho?",
  "tumara name kya hai?",
  // Greeting + real question mixed (hijack test)
  "Assalam o alaikum, 3 saal ke diploma ki fees kitni hai?",
  "salam bhai civil ka 3 sala diploma kitne ka?",
  // Urdu-script coverage
  "تین سالہ ڈپلومہ کی قیمت کیا ہے؟",
  "3 سال کا ڈپلومہ کتنے کا ہے؟",
  "قیمت کیا ہے؟",
  "پیمنٹ کیسے ہوگی؟",
  "ڈاکیومنٹس کیا چاہیے؟",
  // Core intents
  "documents kya chahiye?",
  "fees kitni hai?",
  "3 saal ka kitne ka hai?",
  "without embassy kitne ka milega?",
  "payment kesy lo gy?",
  "kya advance dena hoga?",
  "whatsapp number do",
  "kya ye diploma original hai ya fake?",
  "kya guarantee hai membership mil jaye gi?",
  "discount mil sakta hai?",
  "kya call per bat ho sakti hai?",
  "office kahan hai apka?",
  "saudi arabia courier kar dete ho?",
  "hec attestation karwa doge?",
  "punjab board ka diploma mil sakta hai?",
  "degree mil sakti hai bachelor ki?",
  "nebosh mil sakta hai?",
  // Vague single word (loose-match safety test)
  "diploma",
  "sample",
];

async function main() {
  const { course, context } = await buildCourseBotContext(COURSE_ID);
  if (!course) throw new Error("course not found");
  const settings = await fetchPrivateSiteSettingsFromDb();
  const systemPrompt = buildBotSystemPrompt(context, settings.botSystemNote);
  console.log(`Context size: ${context.length} chars, system prompt: ${systemPrompt.length} chars`);

  for (const q of CLI_QUESTIONS.length ? CLI_QUESTIONS : QUESTIONS) {
    let layer = "";
    let answer = "";

    const general = getGeneralChatAnswer(q, "Asad");
    if (general) {
      layer = "generalChat";
      answer = general;
    } else if (isWhatsappContactQuestion(q) && !isRequirementQuestion(q)) {
      layer = "whatsappContact";
      answer = "(fixed whatsapp guide + link)";
    } else if (isSampleRequest(q)) {
      layer = "sampleRequest";
      answer = "(sample intro + links)";
    } else {
      const saved = answerFromSavedKnowledge(q, course) || answerCourseQuestionFromTree(q, course);
      if (saved?.answer?.trim()) {
        layer = `saved:${saved.reason}${saved.offerWhatsapp ? " +whatsapp" : ""}${saved.queueForAdmin ? " +queue" : ""}`;
        answer = saved.answer;
      } else if (USE_MODEL) {
        const started = Date.now();
        try {
          const raw = await callBotModel(settings, [
            { role: "system", content: systemPrompt },
            { role: "user", content: q },
          ] satisfies BotChatMessage[]);
          const parsed = parseBotJson(raw);
          const trimmed = stripBotInstructions(parsed.answer);
          const usable = parsed.canAnswer && trimmed && trimmed !== BOT_FALLBACK_ANSWER;
          layer = `model(${Date.now() - started}ms)${usable ? "" : " -> FALLBACK"}`;
          answer = usable ? trimmed : `[canAnswer=${parsed.canAnswer}] ${trimmed || "(empty)"}`;
        } catch (error) {
          layer = `model ERROR(${Date.now() - started}ms)`;
          answer = error instanceof Error ? error.message : String(error);
        }
      } else {
        layer = "-> MODEL";
        answer = "(would call LLM)";
      }
    }

    const flat = answer.replace(/\s+/g, " ").slice(0, 200);
    console.log(`\nQ: ${q}\n   [${layer}] ${flat}`);
  }
}

main().finally(() => prisma.$disconnect());
