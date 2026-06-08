import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/storage";
import { revalidateCourseCache } from "@/lib/revalidate-course";

type RouteParams = { params: Promise<{ id: string }> };

export const maxDuration = 60;

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  const samples = await prisma.sample.findMany({
    where: { courseId: id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(samples);
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

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const title = (formData.get("title") as string) || file?.name || "Sample";
    const order = Number(formData.get("order")) || 0;

    if (!file) {
      return NextResponse.json({ error: "File zaroori hai" }, { status: 400 });
    }

    const { filename, type } = await saveUploadedFile(file, `sample_${courseId}`);

    const sample = await prisma.sample.create({
      data: {
        courseId,
        title: title.trim(),
        type,
        filename,
        order,
      },
    });

    revalidateCourseCache(courseId);

    return NextResponse.json(sample, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Upload fail";
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
  const sampleId = searchParams.get("sampleId");

  if (!sampleId) {
    return NextResponse.json({ error: "Sample ID zaroori hai" }, { status: 400 });
  }

  try {
    const sample = await prisma.sample.findFirst({
      where: { id: sampleId, courseId },
    });

    if (!sample) {
      return NextResponse.json({ error: "Sample nahi mila" }, { status: 404 });
    }

    await deleteUploadedFile(sample.filename);
    await prisma.sample.delete({ where: { id: sampleId } });

    revalidateCourseCache(courseId);

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Delete fail" }, { status: 500 });
  }
}
