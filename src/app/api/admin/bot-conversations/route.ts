import { NextRequest, NextResponse } from "next/server";
import { cleanupExpiredBotConversations, remainingSeconds } from "@/lib/bot";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function ensureBotPermission() {
  try {
    await requirePermission("manageBot");
    return null;
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
}

export async function GET(request: NextRequest) {
  const denied = await ensureBotPermission();
  if (denied) return denied;

  await cleanupExpiredBotConversations();

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim();

  const conversations = await prisma.botConversation.findMany({
    where: q
      ? {
          OR: [
            { id: { contains: q, mode: "insensitive" } },
            { visitor: { visitorKey: { contains: q, mode: "insensitive" } } },
            { course: { title: { contains: q, mode: "insensitive" } } },
            { messages: { some: { content: { contains: q, mode: "insensitive" } } } },
          ],
        }
      : {},
    orderBy: { updatedAt: "desc" },
    take: 50,
    include: {
      visitor: true,
      course: { select: { id: true, title: true } },
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  return NextResponse.json(
    conversations.map((conversation) => ({
      ...conversation,
      remainingSeconds: conversation.isPinned
        ? null
        : remainingSeconds(conversation.expiresAt),
    }))
  );
}

export async function PATCH(request: NextRequest) {
  const denied = await ensureBotPermission();
  if (denied) return denied;

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const isPinned = Boolean(body.isPinned);

    const conversation = await prisma.botConversation.update({
      where: { id },
      data: { isPinned },
      include: {
        visitor: true,
        course: { select: { id: true, title: true } },
        messages: { orderBy: { createdAt: "asc" } },
      },
    });

    return NextResponse.json({
      ...conversation,
      remainingSeconds: conversation.isPinned
        ? null
        : remainingSeconds(conversation.expiresAt),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Conversation update fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await ensureBotPermission();
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Conversation ID zaroori hai" }, { status: 400 });
  }

  await prisma.botConversation.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
