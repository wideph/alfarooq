import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendVisitorSignal } from "@/lib/ad-signals";

function clean(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 500) : null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const visitorKey = clean(body.visitorKey);

    if (!visitorKey) {
      return NextResponse.json({ error: "visitorKey zaroori hai" }, { status: 400 });
    }

    const existing = await prisma.visitor.findUnique({ where: { visitorKey } });
    const timeDelta = Math.max(0, Math.min(Number(body.timeDeltaSeconds) || 0, 60));
    const now = new Date();
    const currentPath = clean(body.currentPath);

    const visitor = existing
      ? await prisma.visitor.update({
          where: { visitorKey },
          data: {
            source: existing.source || clean(body.source),
            medium: existing.medium || clean(body.medium),
            campaign: existing.campaign || clean(body.campaign),
            referrer: existing.referrer || clean(body.referrer),
            landingPage: existing.landingPage || clean(body.landingPage),
            currentPath: currentPath || existing.currentPath,
            userAgent: existing.userAgent || request.headers.get("user-agent"),
            timeSpentSeconds: { increment: timeDelta },
            lastSeenAt: now,
          },
        })
      : await prisma.visitor.create({
          data: {
            visitorKey,
            source: clean(body.source),
            medium: clean(body.medium),
            campaign: clean(body.campaign),
            referrer: clean(body.referrer),
            landingPage: clean(body.landingPage),
            currentPath,
            userAgent: request.headers.get("user-agent"),
            timeSpentSeconds: timeDelta,
            firstSeenAt: now,
            lastSeenAt: now,
          },
        });

    if (!existing) {
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
