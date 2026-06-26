import { NextRequest, NextResponse } from "next/server";
import { revalidateTag } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getFreshAdminSession, hasAnyPermission, requirePermission } from "@/lib/auth";
import { parseOrder } from "@/lib/parse-order";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const adminView = searchParams.get("admin") === "true";
  const session = await getFreshAdminSession();
  const canSeeAdminCourses =
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

  const where =
    canSeeAdminCourses
      ? {}
      : { isPublished: true };

  const courses = await prisma.course.findMany({
    where,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { samples: true, questions: true } },
    },
  });

  return NextResponse.json(courses, {
    headers: {
      "Cache-Control": "public, s-maxage=120, stale-while-revalidate=300",
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    await requirePermission("courses:write");
  } catch (error) {
    const status = error instanceof Error && error.message === "Forbidden" ? 403 : 401;
    return NextResponse.json({ error: "Unauthorized" }, { status });
  }

  try {
    const body = await request.json();
    const { title, description, isPublished = true, order = 0 } = body;

    if (!title?.trim() || !description?.trim()) {
      return NextResponse.json(
        { error: "Title aur description zaroori hain" },
        { status: 400 }
      );
    }

    const course = await prisma.course.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        isPublished: Boolean(isPublished),
        order: parseOrder(order),
      },
    });

    revalidateTag("courses");

    return NextResponse.json(course, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Course create fail" }, { status: 500 });
  }
}
