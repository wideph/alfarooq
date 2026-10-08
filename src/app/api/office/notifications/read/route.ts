import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { guardOffice, serverError } from "@/lib/office/guard";

export const preferredRegion = ["sin1"];

// POST { ids?: string[] } — diye gaye ids (ya ids na hon to tamam) current
// user ki notifications read mark karta hai. Response mein fresh unread count.
export async function POST(request: NextRequest) {
  const { session, denied } = await guardOffice("office:cases:read");
  if (denied) return denied;
  try {
    const body = await request.json().catch(() => ({}));
    const ids: string[] = Array.isArray(body?.ids)
      ? (body.ids as unknown[]).filter((id): id is string => typeof id === "string" && id.length > 0)
      : [];

    await prisma.notification.updateMany({
      where: {
        userId: session.adminId,
        readAt: null,
        ...(ids.length > 0 ? { id: { in: ids } } : {}),
      },
      data: { readAt: new Date() },
    });

    const unread = await prisma.notification.count({
      where: { userId: session.adminId, readAt: null },
    });
    return NextResponse.json({ unread });
  } catch (error) {
    return serverError(error);
  }
}
