import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const adminView = searchParams.get("admin") === "true";
  const session = await getSession();

  const where =
    adminView && session
      ? {}
      : { isPublished: true };

  const courses = await prisma.course.findMany({
    where,
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { samples: true, questions: true } },
    },
  });

  return NextResponse.json(courses);
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
        order: Number(order) || 0,
      },
    });

    return NextResponse.json(course, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Course create fail" }, { status: 500 });
  }
}
