import { after, NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { eventNameForVisitorStatus, sendVisitorSignal, VISITOR_STATUS_OPTIONS } from "@/lib/ad-signals";
import { requirePermission } from "@/lib/auth";

type VisitorWhere = Prisma.VisitorWhereInput;

async function ensureVisitorPermission(permission: "visitors:read" | "visitors:write") {
  try {
    await requirePermission(permission);
    return null;
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
}

function clean(value: string | null) {
  return value?.trim() || "";
}

function parseDateParam(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function buildVisitorWhere(searchParams: URLSearchParams, includeStatus = true): VisitorWhere {
  const q = clean(searchParams.get("q"));
  const status = includeStatus ? clean(searchParams.get("status")) : "";
  const from = parseDateParam(searchParams.get("from"));
  const to = parseDateParam(searchParams.get("to"));

  return {
    ...(status ? { status } : {}),
    ...(from || to
      ? {
          firstSeenAt: {
            ...(from ? { gte: from } : {}),
            ...(to ? { lte: to } : {}),
          },
        }
      : {}),
    ...(q
      ? {
          OR: [
            { visitorKey: { contains: q, mode: "insensitive" } },
            { source: { contains: q, mode: "insensitive" } },
            { medium: { contains: q, mode: "insensitive" } },
            { campaign: { contains: q, mode: "insensitive" } },
            { ipAddress: { contains: q, mode: "insensitive" } },
            { referrer: { contains: q, mode: "insensitive" } },
            { landingPage: { contains: q, mode: "insensitive" } },
            { currentPath: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  } as VisitorWhere;
}

function parseTimezoneOffset(value: string | null) {
  const offset = Number(value);
  return Number.isFinite(offset) ? offset : 0;
}

function dayKey(date: Date, timezoneOffsetMinutes: number) {
  const localTime = date.getTime() - timezoneOffsetMinutes * 60 * 1000;
  return new Date(localTime).toISOString().slice(0, 10);
}

function todayStartForTimezone(date: Date, timezoneOffsetMinutes: number) {
  const local = new Date(date.getTime() - timezoneOffsetMinutes * 60 * 1000);
  local.setUTCHours(0, 0, 0, 0);
  return new Date(local.getTime() + timezoneOffsetMinutes * 60 * 1000);
}

async function sendSignalAndUpdateEvent({
  visitorId,
  eventId,
  eventName,
  payload,
}: {
  visitorId: string;
  eventId: string;
  eventName: string;
  payload: Record<string, unknown>;
}) {
  try {
    const visitor = await prisma.visitor.findUnique({ where: { id: visitorId } });
    if (!visitor) return;

    const signal = await sendVisitorSignal(visitor, eventName, payload);
    await prisma.visitorEvent.update({
      where: { id: eventId },
      data: {
        sentToMeta: signal.sentToMeta,
        sentToGoogle: signal.sentToGoogle,
        sentToTikTok: signal.sentToTikTok,
        error: signal.error,
      },
    });
  } catch (error) {
    await prisma.visitorEvent
      .update({
        where: { id: eventId },
        data: {
          error: error instanceof Error ? error.message : "Visitor signal failed",
        },
      })
      .catch(() => {});
  }
}

export async function GET(request: NextRequest) {
  const denied = await ensureVisitorPermission("visitors:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const where = buildVisitorWhere(searchParams);
  const statsWhere = buildVisitorWhere(searchParams, false);
  const timezoneOffsetMinutes = parseTimezoneOffset(searchParams.get("tzOffset"));
  const now = new Date();
  const todayStart = todayStartForTimezone(now, timezoneOffsetMinutes);

  const [visitors, filteredVisitorDates, todayCount, statusCounts] = await Promise.all([
    prisma.visitor.findMany({
      where,
      orderBy: [{ firstSeenAt: "desc" }, { lastSeenAt: "desc" }],
      include: {
        events: { orderBy: { createdAt: "desc" }, take: 5 },
        _count: { select: { botChats: true, userQuestions: true, events: true } },
      },
    }),
    prisma.visitor.findMany({
      where,
      orderBy: { firstSeenAt: "asc" },
      select: { firstSeenAt: true },
    }),
    prisma.visitor.count({
      where: {
        ...statsWhere,
        firstSeenAt: { gte: todayStart },
      },
    }),
    prisma.visitor.groupBy({
      by: ["status"],
      where: statsWhere,
      _count: { _all: true },
    }),
  ]);

  const dailyMap = new Map<string, number>();
  for (const visitor of filteredVisitorDates) {
    const key = dayKey(visitor.firstSeenAt, timezoneOffsetMinutes);
    dailyMap.set(key, (dailyMap.get(key) || 0) + 1);
  }
  const dailyVisitors = Array.from(dailyMap.entries())
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));

  return NextResponse.json({
    visitors,
    statuses: VISITOR_STATUS_OPTIONS,
    summary: {
      total: visitors.length,
      today: todayCount,
      dailyVisitors,
      statusCounts: statusCounts.map((item) => ({
        status: item.status,
        count: item._count._all,
      })),
    },
  });
}

export async function PUT(request: NextRequest) {
  const denied = await ensureVisitorPermission("visitors:write");
  if (denied) return denied;

  try {
    const body = await request.json();
    const visitorId = typeof body.visitorId === "string" ? body.visitorId : "";
    const status = typeof body.status === "string" ? body.status : "visitor";
    const existing = await prisma.visitor.findUnique({ where: { id: visitorId } });
    if (!existing) {
      return NextResponse.json({ error: "Visitor nahi mila" }, { status: 404 });
    }
    const unblockingIp = existing.status === "blocked" && status !== "blocked";
    const eventName =
      typeof body.eventName === "string" && body.eventName.trim()
        ? body.eventName.trim()
        : unblockingIp
          ? "Unblocked"
        : eventNameForVisitorStatus(status);

    if (existing.ipAddress && (status === "blocked" || unblockingIp)) {
      await prisma.visitor.updateMany({
        where: {
          ipAddress: existing.ipAddress,
          ...(unblockingIp ? { status: "blocked" } : {}),
        },
        data: { status, lastSeenAt: new Date() },
      });
    } else {
      await prisma.visitor.update({
        where: { id: visitorId },
        data: { status, lastSeenAt: new Date() },
      });
    }

    const visitor = await prisma.visitor.findUniqueOrThrow({ where: { id: visitorId } });

    const signalPayload = {
      manual_status_change: true,
      ip_status_change: status === "blocked" || unblockingIp,
    };

    const event = await prisma.visitorEvent.create({
      data: {
        visitorId: visitor.id,
        eventName,
        status,
        payload: signalPayload,
      },
    });

    after(() =>
      sendSignalAndUpdateEvent({
        visitorId: visitor.id,
        eventId: event.id,
        eventName,
        payload: signalPayload,
      })
    );

    return NextResponse.json({ visitor, event, signalQueued: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visitor update fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
