import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchSiteSettingsFromDb } from "@/lib/get-site-settings";

export async function GET() {
  const settings = await fetchSiteSettingsFromDb();
  const courses = await prisma.course.findMany({
    where: { isPublished: true },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    select: { id: true, title: true },
  });

  return NextResponse.json({
    enabled: settings.botEnabled,
    provider: settings.botProvider,
    model: settings.botModel,
    courses,
  });
}
