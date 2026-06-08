import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/storage";
import { revalidateCourseCache } from "@/lib/revalidate-course";
import { parseOrder } from "@/lib/parse-order";

type RouteParams = { params: Promise<{ id: string }> };

async function parseQuestionBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return {
      questionId: (formData.get("questionId") as string) || undefined,
      question: (formData.get("question") as string) || "",
      answer: (formData.get("answer") as string) || "",
      order: parseOrder(formData.get("order")),
      answerMedia: (formData.get("answerMedia") as File | null) || null,
      removeAnswerMedia: formData.get("removeAnswerMedia") === "true",
    };
  }

  const body = await request.json();
  return {
    questionId: body.questionId as string | undefined,
    question: (body.question as string) || "",
    answer: (body.answer as string) || "",
    order: parseOrder(body.order),
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
    ? existingFilename.endsWith(".pdf")
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

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const questions = await prisma.question.findMany({
    where: { courseId: id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(questions);
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;

  try {
    const course = await prisma.course.findUnique({ where: { id: courseId } });
    if (!course) {
      return NextResponse.json({ error: "Course nahi mila" }, { status: 404 });
    }

    const body = await parseQuestionBody(request);

    if (!body.question?.trim()) {
      return NextResponse.json({ error: "Question zaroori hai" }, { status: 400 });
    }

    if (!body.answer?.trim() && !body.answerMedia) {
      return NextResponse.json(
        { error: "Answer text ya media file zaroori hai" },
        { status: 400 }
      );
    }

    const media = await applyAnswerMedia(null, body.answerMedia, false, `answer_${courseId}`);

    const q = await prisma.question.create({
      data: {
        courseId,
        question: body.question.trim(),
        answer: body.answer.trim(),
        order: body.order,
        answerMediaFilename: media.answerMediaFilename,
        answerMediaType: media.answerMediaType,
      },
    });

    revalidateCourseCache(courseId);

    return NextResponse.json(q, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Create fail";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: courseId } = await params;

  try {
    const body = await parseQuestionBody(request);

    if (!body.questionId) {
      return NextResponse.json({ error: "Question ID zaroori hai" }, { status: 400 });
    }

    const existing = await prisma.question.findFirst({
      where: { id: body.questionId, courseId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Question nahi mila" }, { status: 404 });
    }

    const media = await applyAnswerMedia(
      existing.answerMediaFilename,
      body.answerMedia,
      body.removeAnswerMedia,
      `answer_${courseId}`
    );

    await prisma.question.update({
      where: { id: body.questionId },
      data: {
        ...(body.question !== undefined && { question: body.question.trim() }),
        ...(body.answer !== undefined && { answer: body.answer.trim() }),
        ...(body.order !== undefined && { order: body.order }),
        answerMediaFilename: media.answerMediaFilename,
        answerMediaType: media.answerMediaType,
      },
    });

    const updated = await prisma.question.findUnique({ where: { id: body.questionId } });
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

  try {
    const existing = await prisma.question.findFirst({
      where: { id: questionId, courseId },
    });

    if (!existing) {
      return NextResponse.json({ error: "Question nahi mila" }, { status: 404 });
    }

    if (existing.answerMediaFilename) {
      await deleteUploadedFile(existing.answerMediaFilename);
    }

    await prisma.question.delete({ where: { id: questionId } });

    revalidateCourseCache(courseId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete fail" }, { status: 500 });
  }
}
