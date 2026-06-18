import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import { SITE_SETTINGS_ID } from "@/lib/site-settings";

async function checkMediaFileAllowed(filename: string): Promise<boolean> {
  const [sample, question, userQuestion, settings] = await Promise.all([
    prisma.sample.findFirst({ where: { filename }, select: { id: true } }),
    prisma.question.findFirst({
      where: { answerMediaFilename: filename },
      select: { id: true },
    }),
    prisma.userQuestion.findFirst({
      where: { answerMediaFilename: filename },
      select: { id: true },
    }),
    prisma.siteSettings.findUnique({
      where: { id: SITE_SETTINGS_ID },
      select: { logoFilename: true },
    }),
  ]);

  if (sample) return true;
  if (question) return true;
  if (userQuestion) return true;
  if (settings?.logoFilename === filename) return true;

  return false;
}

/**
 * Har media request (logo/image/PDF) par pehle yeh access-check chalta tha jo
 * 4 DB queries karta tha — is se loading slow hoti thi. Ab natija cache hota hai
 * (per-filename), aur content badalne par "courses" / "media-access" tags se
 * invalidate ho jata hai. Is se media kaafi tezi se load hota hai.
 */
export function isMediaFileAllowed(filename: string): Promise<boolean> {
  const getCached = unstable_cache(
    () => checkMediaFileAllowed(filename),
    ["media-access", filename],
    { revalidate: 1800, tags: ["courses", "media-access"] }
  );
  return getCached();
}
