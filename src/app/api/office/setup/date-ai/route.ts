import { NextRequest, NextResponse, after } from "next/server";
import { prisma } from "@/lib/prisma";
import { badRequest, guardOffice, serverError } from "@/lib/office/guard";
import { logOfficeAction } from "@/lib/office/audit";
import { addDays, todayPakistan } from "@/lib/office/serializers";
import { tavilyKey, tavilySearch } from "@/lib/office/day-news";
import { verifyAllOpenDates } from "@/lib/office/date-verify";

export const preferredRegion = ["sin1"];
export const maxDuration = 300;

// §W61 — dates ke ONLINE check ki settings: Tavily key (owner ka chuna hua
// zariya; khabrein Tavily se, faisla attached AI). Key kabhi poori wapas nahi
// bheji jati — sirf aakhri 4 huroof.

function mask(key: string) {
  return key ? `••••${key.slice(-4)}` : null;
}

export async function GET() {
  const { denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const [row, bot, last, counts] = await Promise.all([
      prisma.officeDateConfig.findUnique({ where: { id: "global" } }),
      prisma.siteSettings.findFirst({ select: { botEnabled: true, botProvider: true, botModel: true, botApiKey: true } }),
      prisma.officeDayCheck.findFirst({ orderBy: { checkedAt: "desc" }, select: { checkedAt: true, online: true, model: true } }),
      prisma.officeDayCheck.groupBy({ by: ["online"], _count: true, where: { checkedAt: { gte: addDays(new Date(), -7) } } }),
    ]);
    const envKey = process.env.TAVILY_API_KEY || "";
    return NextResponse.json({
      tavilyKey: mask(row?.tavilyApiKey || ""),
      tavilyFromEnv: !row?.tavilyApiKey && Boolean(envKey),
      ai: bot
        ? { enabled: bot.botEnabled, provider: bot.botProvider, model: bot.botModel, hasKey: Boolean(bot.botApiKey) }
        : null,
      lastCheck: last,
      weekChecks: {
        online: counts.find((item) => item.online)?._count ?? 0,
        offline: counts.find((item) => !item.online)?._count ?? 0,
      },
    });
  } catch (error) {
    return serverError(error);
  }
}

// PUT { tavilyApiKey } — save ("" = hata do).
export async function PUT(request: NextRequest) {
  const { session, denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const key = typeof body.tavilyApiKey === "string" ? body.tavilyApiKey.trim() : "";
    if (key && !/^tvly-[A-Za-z0-9_-]{8,}$/.test(key)) return badRequest("Tavily key 'tvly-' se shuru hoti hai — dobara check karein");
    await prisma.officeDateConfig.upsert({
      where: { id: "global" },
      update: { tavilyApiKey: key },
      create: { id: "global", tavilyApiKey: key },
    });
    await logOfficeAction(session, {
      action: "dates.tavily-key",
      entity: "OfficeDateConfig",
      entityId: "global",
      after: { tavilyKey: mask(key) },
    });
    // Nayi key → foran tamam aane wali dates ka online check (response ke baad).
    if (key) after(() => verifyAllOpenDates({ actor: { adminId: session.adminId, role: session.role } }).then(() => undefined));
    return NextResponse.json({ success: true, tavilyKey: mask(key) });
  } catch (error) {
    return serverError(error);
  }
}

// POST — test: ek Tavily search chala kar dikhao ke key chal rahi hai.
export async function POST() {
  const { denied } = await guardOffice("office:setup:write");
  if (denied) return denied;
  try {
    const key = await tavilyKey();
    if (!key) return badRequest("Tavily key nahi lagi — pehle key save karein");
    const today = todayPakistan();
    try {
      const items = await tavilySearch(key, "Pakistan public holiday announced", { from: addDays(today, -30), to: today });
      return NextResponse.json({
        ok: true,
        count: items.length,
        sample: items.slice(0, 5).map((item) => ({ title: item.title, url: item.url, seen: item.seen })),
      });
    } catch (error) {
      return badRequest(error instanceof Error ? error.message : "Tavily test fail");
    }
  } catch (error) {
    return serverError(error);
  }
}
