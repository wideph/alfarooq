import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFreshAdminSession, hasAnyPermission, requirePermission } from "@/lib/auth";
import { deleteUploadedFile } from "@/lib/storage";
import { revalidateCourseCache } from "@/lib/revalidate-course";
import { parseOrder } from "@/lib/parse-order";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const { searchParams } = new URL(request.url);
  const adminView = searchParams.get("admin") === "true";
  const session = await getFreshAdminSession();
  const canSeeAdminCourse =
    adminView &&
    hasAnyPermission(session, [
      "courses:read",
      "courses:write",
      "samples:read",
      "samples:write",
      "qa:read",
      "qa:write",
      "userQuestions:read",
      "userQuestions:write",
      "botTraining:read",
      "botTraining:write",
    ]);

  const course = await prisma.course.findUnique({
    where: { id },
    include: {
      samples: { orderBy: { order: "asc" } },
      questions: { orderBy: { order: "asc" } },
      userQuestions: canSeeAdminCourse
        ? {
            orderBy: { createdAt: "desc" },
            include: { visitor: { select: { visitorKey: true } } },
          }
        : {
            where: { status: "answered", publishForUsers: true },
            orderBy: { answeredAt: "desc" },
            // Public response se whatsappNumber exclude karein (privacy).
            select: {
              id: true,
              question: true,
              answer: true,
              answerMediaFilename: true,
              answerMediaType: true,
              status: true,
              order: true,
              answeredAt: true,
            },
          },
    },
  });

  if (!course) {
    return NextResponse.json({ error: "Course nahi mila" }, { status: 404 });
  }

  if (!course.isPublished && !canSeeAdminCourse) {
    return NextResponse.json({ error: "Course nahi mila" }, { status: 404 });
  }

  return NextResponse.json(course);
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission("courses:write");
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }

  const { id } = await params;

  try {
    const body = await request.json();
    const { title, description, isPublished, order } = body;

    const course = await prisma.course.update({
      where: { id },
      data: {
        ...(title !== undefined && { title: title.trim() }),
        ...(description !== undefined && { description: description.trim() }),
        ...(isPublished !== undefined && { isPublished: Boolean(isPublished) }),
        ...(order !== undefined && { order: parseOrder(order) }),
      },
    });

    revalidateCourseCache(id);

    return NextResponse.json(course);
  } catch {
    return NextResponse.json({ error: "Update fail" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  try {
    await requirePermission("courses:write");
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }

  const { id } = await params;

  try {
    const course = await prisma.course.findUnique({
      where: { id },
      include: {
        samples: true,
        questions: true,
        userQuestions: true,
      },
    });

    if (!course) {
      return NextResponse.json({ error: "Course nahi mila" }, { status: 404 });
    }

    for (const sample of course.samples) {
      await deleteUploadedFile(sample.filename);
    }
    for (const q of course.questions) {
      if (q.answerMediaFilename) await deleteUploadedFile(q.answerMediaFilename);
    }
    for (const uq of course.userQuestions) {
      if (uq.answerMediaFilename) await deleteUploadedFile(uq.answerMediaFilename);
    }

    await prisma.course.delete({ where: { id } });

    revalidateCourseCache(id);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete fail" }, { status: 500 });
  }
}
