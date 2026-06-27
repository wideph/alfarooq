import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { eventNameForVisitorStatus, sendVisitorSignal, VISITOR_STATUS_OPTIONS } from "@/lib/ad-signals";
import { requirePermission } from "@/lib/auth";

async function ensureVisitorPermission(permission: "visitors:read" | "visitors:write") {
  try {
    await requirePermission(permission);
    return null;
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
}

export async function GET(request: NextRequest) {
  const denied = await ensureVisitorPermission("visitors:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();
  const status = searchParams.get("status")?.trim();

  const visitors = await prisma.visitor.findMany({
    where: {
      ...(status ? { status } : {}),
      ...(q
        ? {
            OR: [
              { visitorKey: { contains: q, mode: "insensitive" } },
              { source: { contains: q, mode: "insensitive" } },
              { medium: { contains: q, mode: "insensitive" } },
              { campaign: { contains: q, mode: "insensitive" } },
              { ipAddress: { contains: q, mode: "insensitive" } },
              { referrer: { contains: q, mode: "insensitive" } },
              { currentPath: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ firstSeenAt: "desc" }, { lastSeenAt: "desc" }],
    take: 100,
    include: {
      events: { orderBy: { createdAt: "desc" }, take: 5 },
      _count: { select: { botChats: true, userQuestions: true, events: true } },
    },
  });

  return NextResponse.json({ visitors, statuses: VISITOR_STATUS_OPTIONS });
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

    const signal = await sendVisitorSignal(visitor, eventName, {
      manual_status_change: true,
      ip_status_change: status === "blocked" || unblockingIp,
    });

    const event = await prisma.visitorEvent.create({
      data: {
        visitorId: visitor.id,
        eventName,
        status,
        payload: {
          manual_status_change: true,
          ip_status_change: status === "blocked" || unblockingIp,
        },
        sentToMeta: signal.sentToMeta,
        sentToGoogle: signal.sentToGoogle,
        sentToTikTok: signal.sentToTikTok,
        error: signal.error,
      },
    });

    return NextResponse.json({ visitor, event });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Visitor update fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
