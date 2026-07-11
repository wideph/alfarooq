import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const trainingSelect = {
  id: true,
  courseId: true,
  question: true,
  answer: true,
  source: true,
  sourceRef: true,
  reviewStatus: true,
  evidence: true,
  confidence: true,
  usageCount: true,
  approvedAt: true,
  rejectedAt: true,
  createdAt: true,
  updatedAt: true,
  course: { select: { id: true, title: true } },
} as const;

function normalizeQuestion(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

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

  const where = courseId ? { courseId } : {};
  const entries = await prisma.botTrainingEntry.findMany({
    where,
    orderBy: [{ reviewStatus: "desc" }, { updatedAt: "desc" }],
    select: trainingSelect,
    take: 300,
  });

  const statusRank: Record<string, number> = { pending: 0, approved: 1, rejected: 2 };
  const enriched = entries
    .map((entry) => {
      const normalized = normalizeQuestion(entry.question);
      const conflict = entries.find(
        (other) =>
          other.id !== entry.id &&
          other.reviewStatus === "approved" &&
          normalizeQuestion(other.question) === normalized &&
          other.answer.trim() !== entry.answer.trim()
      );
      return {
        ...entry,
        conflictWith: conflict
          ? { id: conflict.id, question: conflict.question, answer: conflict.answer }
          : null,
      };
    })
    .sort(
      (a, b) =>
        (statusRank[a.reviewStatus] ?? 9) - (statusRank[b.reviewStatus] ?? 9) ||
        b.updatedAt.getTime() - a.updatedAt.getTime()
    );

  return NextResponse.json(enriched);
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
      data: {
        courseId,
        question,
        answer,
        source: "admin",
        reviewStatus: "approved",
        approvedAt: new Date(),
      },
      select: {
        id: true,
        courseId: true,
        question: true,
        answer: true,
        course: { select: { id: true, title: true } },
      },
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
      data: {
        question,
        answer,
        // Editing an AI answer is an explicit admin approval.
        reviewStatus: "approved",
        approvedAt: new Date(),
        rejectedAt: null,
      },
      select: {
        id: true,
        courseId: true,
        question: true,
        answer: true,
        course: { select: { id: true, title: true } },
      },
    });

    return NextResponse.json(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Training update fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const denied = await ensureBotPermission("botTraining:write");
  if (denied) return denied;

  try {
    const body = await request.json();
    const id = typeof body.id === "string" ? body.id : "";
    const action = body.action === "approve" || body.action === "reject" ? body.action : "";
    if (!id || !action) {
      return NextResponse.json({ error: "ID aur valid action zaroori hai" }, { status: 400 });
    }

    const entry = await prisma.botTrainingEntry.update({
      where: { id },
      data:
        action === "approve"
          ? { reviewStatus: "approved", approvedAt: new Date(), rejectedAt: null }
          : { reviewStatus: "rejected", rejectedAt: new Date() },
      select: trainingSelect,
    });
    return NextResponse.json(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Review update fail";
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
