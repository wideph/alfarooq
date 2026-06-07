import { prisma } from "@/lib/prisma";
import { SITE_SETTINGS_ID } from "@/lib/site-settings";

export async function isMediaFileAllowed(filename: string): Promise<boolean> {
  const [sample, question, userQuestion, settings] = await Promise.all([
    prisma.sample.findFirst({ where: { filename } }),
    prisma.question.findFirst({ where: { answerMediaFilename: filename } }),
    prisma.userQuestion.findFirst({ where: { answerMediaFilename: filename } }),
    prisma.siteSettings.findUnique({ where: { id: SITE_SETTINGS_ID } }),
  ]);

  if (sample) return true;
  if (question) return true;
  if (userQuestion) return true;
  if (settings?.logoFilename === filename) return true;

  return false;
}
