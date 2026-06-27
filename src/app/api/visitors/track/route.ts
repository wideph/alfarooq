import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVisitorSignal } from "@/lib/ad-signals";
import {
  canonicalizeTrackedUrl,
  findOrCreateMergedVisitor,
} from "@/lib/visitor-server";

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
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
    const currentPath = canonicalizeTrackedUrl(clean(body.currentPath));
    const landingPage = canonicalizeTrackedUrl(clean(body.landingPage));
    const referrer = canonicalizeTrackedUrl(clean(body.referrer));
    const [existingBeforeMerge, previousBeforeMerge] = await Promise.all([
      prisma.visitor.findUnique({ where: { visitorKey } }),
      previousVisitorKey && previousVisitorKey !== visitorKey
        ? prisma.visitor.findUnique({ where: { visitorKey: previousVisitorKey } })
        : Promise.resolve(null),
    ]);

    const visitor = await findOrCreateMergedVisitor({
      visitorKey,
      previousVisitorKey,
      create: {
        source: clean(body.source),
        medium: clean(body.medium),
        campaign: clean(body.campaign),
        referrer,
        landingPage,
        currentPath,
        userAgent: request.headers.get("user-agent"),
        timeSpentSeconds: timeDelta,
        firstSeenAt: now,
        lastSeenAt: now,
      },
      update: {
        source: existingBeforeMerge?.source || clean(body.source),
        medium: existingBeforeMerge?.medium || clean(body.medium),
        campaign: existingBeforeMerge?.campaign || clean(body.campaign),
        referrer: existingBeforeMerge?.referrer || referrer,
        landingPage: existingBeforeMerge?.landingPage || landingPage,
        currentPath: currentPath || existingBeforeMerge?.currentPath,
        userAgent: existingBeforeMerge?.userAgent || request.headers.get("user-agent"),
        timeSpentSeconds: { increment: timeDelta },
        lastSeenAt: now,
      },
    });

    if (!existingBeforeMerge && !previousBeforeMerge) {
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
