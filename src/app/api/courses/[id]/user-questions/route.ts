import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getFreshAdminSession, hasAnyPermission, requirePermission } from "@/lib/auth";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/storage";
import { revalidateCourseCache } from "@/lib/revalidate-course";
import { parseOrder } from "@/lib/parse-order";
import { findOrCreateMergedVisitor } from "@/lib/visitor-server";

type RouteParams = { params: Promise<{ id: string }> };

async function parseUserQuestionBody(request: NextRequest) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return {
      questionId: (formData.get("questionId") as string) || undefined,
      // Sirf tab include karein jab field maujood ho, warna existing question/answer
      // ghalti se khali ("") ho jata hai (e.g. pending sawal ka jawab dete waqt).
      question: formData.has("question") ? (formData.get("question") as string) || "" : undefined,
      answer: formData.has("answer") ? (formData.get("answer") as string) || "" : undefined,
      answerMedia: (formData.get("answerMedia") as File | null) || null,
      removeAnswerMedia: formData.get("removeAnswerMedia") === "true",
      order: formData.has("order") ? parseOrder(formData.get("order")) : undefined,
      publishMode: formData.has("publishMode")
        ? ((formData.get("publishMode") as string) || "publish")
        : undefined,
    };
  }

  const body = await request.json();
  return {
    questionId: body.questionId as string | undefined,
    question: body.question !== undefined ? (body.question as string) || "" : undefined,
    answer: body.answer !== undefined ? (body.answer as string) || "" : undefined,
    answerMedia: null as File | null,
    removeAnswerMedia: Boolean(body.removeAnswerMedia),
    order: body.order !== undefined ? parseOrder(body.order) : undefined,
    publishMode: body.publishMode as string | undefined,
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
  const session = await getFreshAdminSession();
  const canSeeAdminQuestions =
    adminView &&
    hasAnyPermission(session, [
      "userQuestions:read",
      "userQuestions:write",
      "botTraining:read",
      "botTraining:write",
    ]);

  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course || (!course.isPublished && !canSeeAdminQuestions)) {
    return NextResponse.json({ error: "Course nahi mila" }, { status: 404 });
  }

  if (canSeeAdminQuestions) {
    const questions = await prisma.userQuestion.findMany({
      where: { courseId },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(questions);
  }

  const questions = await prisma.userQuestion.findMany({
    where: { courseId, status: "answered", publishForUsers: true },
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
    const { question, whatsappNumber, visitorKey, previousVisitorKey } = body;

    if (!question?.trim()) {
      return NextResponse.json(
        { error: "Sawal likhna zaroori hai" },
        { status: 400 }
      );
    }

    const visitor =
      typeof visitorKey === "string" && visitorKey.trim()
        ? await findOrCreateMergedVisitor({
            visitorKey: visitorKey.trim(),
            previousVisitorKey:
              typeof previousVisitorKey === "string" ? previousVisitorKey.trim() : "",
            update: { lastSeenAt: new Date() },
            create: { source: "question_form", lastSeenAt: new Date() },
          })
        : null;

    const userQuestion = await prisma.userQuestion.create({
      data: {
        courseId,
        question: question.trim(),
        whatsappNumber: whatsappNumber?.trim() || null,
        status: "pending",
        source: "user",
        visitorId: visitor?.id,
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
  try {
    await requirePermission("userQuestions:write");
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
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
    const trainingOnly = body.publishMode === "training";

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
        // User ka asal sawal kabhi khali na ho jaye: sirf tab update karein jab
        // koi non-empty question bheja gaya ho (pending answer ke waqt question
        // bheja hi nahi jata, is liye woh mehfooz rehta hai).
        ...(body.question !== undefined &&
          body.question.trim() !== "" && { question: body.question.trim() }),
        ...(body.answer !== undefined && { answer: body.answer.trim() }),
        answerMediaFilename: media.answerMediaFilename,
        answerMediaType: media.answerMediaType,
        ...(body.order !== undefined && { order: body.order }),
        ...(isNewAnswer && {
          status: trainingOnly ? "training" : "answered",
          answeredAt: new Date(),
          publishForUsers: !trainingOnly,
          trainingOnly,
        }),
        ...(body.publishMode !== undefined &&
          !isNewAnswer && {
            status: trainingOnly ? "training" : "answered",
            publishForUsers: !trainingOnly,
            trainingOnly,
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
  try {
    await requirePermission("userQuestions:write");
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
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
