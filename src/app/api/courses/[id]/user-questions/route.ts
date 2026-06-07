import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/storage";
import { revalidateCourseCache } from "@/lib/revalidate-course";

type RouteParams = { params: Promise<{ id: string }> };

async function parseUserQuestionBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return {
      questionId: (formData.get("questionId") as string) || undefined,
      question: (formData.get("question") as string) || "",
      answer: (formData.get("answer") as string) || "",
      answerMedia: (formData.get("answerMedia") as File | null) || null,
      removeAnswerMedia: formData.get("removeAnswerMedia") === "true",
    };
  }

  const body = await request.json();
  return {
    questionId: body.questionId as string | undefined,
    question: (body.question as string) || "",
    answer: (body.answer as string) || "",
    answerMedia: null as File | null,
    removeAnswerMedia: Boolean(body.removeAnswerMedia),
  };
}

async function applyAnswerMedia(
  existingFilename: string | null | undefined,
  answerMedia: File | null,
  removeAnswerMedia: boolean,
  prefix: string
) {
  let answerMediaFilename = existingFilename ?? null;
  let answerMediaType: string | null = existingFilename
    ? existingFilename.toLowerCase().endsWith(".pdf")
      ? "pdf"
      : "image"
    : null;

  if (removeAnswerMedia && existingFilename) {
    await deleteUploadedFile(existingFilename);
    answerMediaFilename = null;
    answerMediaType = null;
  }

  if (answerMedia && answerMedia.size > 0) {
    if (existingFilename) {
      await deleteUploadedFile(existingFilename);
    }
    const saved = await saveUploadedFile(answerMedia, prefix);
    answerMediaFilename = saved.filename;
    answerMediaType = saved.type;
  }

  return { answerMediaFilename, answerMediaType };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id: courseId } = await params;
  const { searchParams } = new URL(request.url);
  const adminView = searchParams.get("admin") === "true";
  const session = await getSession();

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || (!course.isPublished && !(adminView && session))) {
    return NextResponse.json({ error: "Course nahi mila" }, { status: 404 });
  }

  if (adminView && session) {
    const questions = await prisma.userQuestion.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(questions);
  }

  const questions = await prisma.userQuestion.findMany({
    where: { courseId, status: "answered" },
    orderBy: { answeredAt: "desc" },
    select: {
      id: true,
      question: true,
      answer: true,
      answerMediaFilename: true,
      answerMediaType: true,
      answeredAt: true,
    },
  });

  return NextResponse.json(questions);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: courseId } = await params;

  try {
    const course = await prisma.course.findUnique({
      where: { id: courseId, isPublished: true },
    });

    if (!course) {
      return NextResponse.json({ error: "Course nahi mila" }, { status: 404 });
    }

    const body = await request.json();
    const { question } = body;

    if (!question?.trim()) {
      return NextResponse.json(
        { error: "Sawal likhna zaroori hai" },
        { status: 400 }
      );
    }

    const userQuestion = await prisma.userQuestion.create({
      data: {
        courseId,
        question: question.trim(),
        status: "pending",
      },
    });

    return NextResponse.json(
      { success: true, id: userQuestion.id },
      { status: 201 }
    );
  } catch {
    return NextResponse.json({ error: "Submit fail" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;

  try {
    const body = await parseUserQuestionBody(request);

    if (!body.questionId) {
      return NextResponse.json({ error: "Question ID zaroori hai" }, { status: 400 });
    }

    const existing = await prisma.userQuestion.findFirst({
      where: { id: body.questionId, courseId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Question nahi mila" }, { status: 404 });
    }

    const isNewAnswer = existing.status === "pending" && (body.answer?.trim() || body.answerMedia);

    if (existing.status === "pending" && !body.answer?.trim() && !body.answerMedia) {
      return NextResponse.json({ error: "Answer zaroori hai" }, { status: 400 });
    }

    const media = await applyAnswerMedia(
      existing.answerMediaFilename,
      body.answerMedia,
      body.removeAnswerMedia,
      `useranswer_${courseId}`
    );

    await prisma.userQuestion.update({
      where: { id: body.questionId },
      data: {
        ...(body.question !== undefined && { question: body.question.trim() }),
        ...(body.answer !== undefined && { answer: body.answer.trim() }),
        answerMediaFilename: media.answerMediaFilename,
        answerMediaType: media.answerMediaType,
        ...(isNewAnswer && {
          status: "answered",
          answeredAt: new Date(),
        }),
      },
    });

    const updated = await prisma.userQuestion.findUnique({
      where: { id: body.questionId },
    });

    revalidateCourseCache(courseId);

    return NextResponse.json(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Update fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;
  const { searchParams } = new URL(request.url);
  const questionId = searchParams.get("questionId");

  if (!questionId) {
    return NextResponse.json({ error: "Question ID zaroori hai" }, { status: 400 });
  }

  const existing = await prisma.userQuestion.findFirst({
    where: { id: questionId, courseId },
  });

  if (existing?.answerMediaFilename) {
    await deleteUploadedFile(existing.answerMediaFilename);
  }

  await prisma.userQuestion.deleteMany({
    where: { id: questionId, courseId },
  });

  revalidateCourseCache(courseId);

  return NextResponse.json({ success: true });
}
