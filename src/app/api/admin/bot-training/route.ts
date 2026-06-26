import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function ensureBotPermission(permission: "botTraining:read" | "botTraining:write") {
  try {
    await requirePermission(permission);
    return null;
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }
}

export async function GET(request: NextRequest) {
  const denied = await ensureBotPermission("botTraining:read");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const courseId = searchParams.get("courseId") || undefined;

  const entries = await prisma.botTrainingEntry.findMany({
    where: courseId ? { courseId } : {},
    orderBy: { updatedAt: "desc" },
    include: { course: { select: { id: true, title: true } } },
    take: 200,
  });

  return NextResponse.json(entries);
}

export async function POST(request: NextRequest) {
  const denied = await ensureBotPermission("botTraining:write");
  if (denied) return denied;

  try {
    const body = await request.json();
    const courseId = typeof body.courseId === "string" ? body.courseId : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";

    if (!courseId || !question || !answer) {
      return NextResponse.json(
        { error: "Course, question aur answer zaroori hain" },
        { status: 400 }
      );
    }

    const entry = await prisma.botTrainingEntry.create({
      data: { courseId, question, answer },
      include: { course: { select: { id: true, title: true } } },
    });

    return NextResponse.json(entry, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Training save fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const denied = await ensureBotPermission("botTraining:write");
  if (denied) return denied;

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const question = typeof body.question === "string" ? body.question.trim() : "";
    const answer = typeof body.answer === "string" ? body.answer.trim() : "";

    if (!id || !question || !answer) {
      return NextResponse.json(
        { error: "ID, question aur answer zaroori hain" },
        { status: 400 }
      );
    }

    const entry = await prisma.botTrainingEntry.update({
      where: { id },
      data: { question, answer },
      include: { course: { select: { id: true, title: true } } },
    });

    return NextResponse.json(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Training update fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const denied = await ensureBotPermission("botTraining:write");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Training ID zaroori hai" }, { status: 400 });
  }

  await prisma.botTrainingEntry.delete({ where: { id } });
  return NextResponse.json({ success: true });
}
