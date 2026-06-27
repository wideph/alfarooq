import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVisitorSignal } from "@/lib/ad-signals";
import {
  canonicalizeTrackedUrl,
  findBlockedVisitorByIp,
  findOrCreateMergedVisitor,
  getClientIpFromHeaders,
} from "@/lib/visitor-server";

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

function sourceRank(source: string | null | undefined) {
  if (!source) return 0;
  const normalized = source.toLowerCase();
  if (normalized === "direct" || normalized === "unknown") return 1;
  return 2;
}

function chooseSource(current: string | null | undefined, incoming: string | null) {
  return sourceRank(incoming) > sourceRank(current) ? incoming : current || incoming;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const visitorKey = clean(body.visitorKey);
    const previousVisitorKey = clean(body.previousVisitorKey);

    if (!visitorKey) {
      return NextResponse.json({ error: "visitorKey zaroori hai" }, { status: 400 });
    }

    const timeDelta = Math.max(0, Math.min(Number(body.timeDeltaSeconds) || 0, 60));
    const now = new Date();
    const ipAddress = getClientIpFromHeaders(request.headers);
    const currentPath = canonicalizeTrackedUrl(clean(body.currentPath));
    const landingPage = canonicalizeTrackedUrl(clean(body.landingPage));
    const referrer = canonicalizeTrackedUrl(clean(body.referrer));
    const incomingSource = clean(body.source);
    const [existingBeforeMerge, previousBeforeMerge, blockedByIp] = await Promise.all([
      prisma.visitor.findUnique({ where: { visitorKey } }),
      previousVisitorKey && previousVisitorKey !== visitorKey
        ? prisma.visitor.findUnique({ where: { visitorKey: previousVisitorKey } })
        : Promise.resolve(null),
      findBlockedVisitorByIp(ipAddress),
    ]);
    const shouldBlock = Boolean(blockedByIp);
    const currentSource = existingBeforeMerge?.source || previousBeforeMerge?.source;

    const visitor = await findOrCreateMergedVisitor({
      visitorKey,
      previousVisitorKey,
      create: {
        source: incomingSource,
        medium: clean(body.medium),
        campaign: clean(body.campaign),
        referrer,
        landingPage,
        currentPath,
        userAgent: request.headers.get("user-agent"),
        ipAddress,
        ...(shouldBlock ? { status: "blocked" } : {}),
        timeSpentSeconds: timeDelta,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        source: chooseSource(currentSource, incomingSource),
        medium: existingBeforeMerge?.medium || clean(body.medium),
        campaign: existingBeforeMerge?.campaign || clean(body.campaign),
        referrer: existingBeforeMerge?.referrer || referrer,
        landingPage: existingBeforeMerge?.landingPage || landingPage,
        currentPath: currentPath || existingBeforeMerge?.currentPath,
        userAgent: existingBeforeMerge?.userAgent || request.headers.get("user-agent"),
        ipAddress: existingBeforeMerge?.ipAddress || previousBeforeMerge?.ipAddress || ipAddress,
        ...(shouldBlock ? { status: "blocked" } : {}),
        timeSpentSeconds: { increment: timeDelta },
        lastSeenAt: now,
      },
    });

    if (!shouldBlock && !existingBeforeMerge && !previousBeforeMerge) {
      const signal = await sendVisitorSignal(visitor, "PageView", {
        landing_page: visitor.landingPage,
      });

      await prisma.visitorEvent.create({
        data: {
          visitorId: visitor.id,
          eventName: "PageView",
          status: visitor.status,
          payload: {
            source: visitor.source,
            referrer: visitor.referrer,
            landingPage: visitor.landingPage,
          },
          sentToMeta: signal.sentToMeta,
          sentToGoogle: signal.sentToGoogle,
          sentToTikTok: signal.sentToTikTok,
          error: signal.error,
        },
      });
    }

    return NextResponse.json({
      visitorId: visitor.id,
      visitorKey: visitor.visitorKey,
      status: visitor.status,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visitor track fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
