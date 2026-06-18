import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

async function fetchPublishedCourse(id: string) {
  return prisma.course.findUnique({
    where: { id },
    include: {
      samples: { orderBy: { order: "asc" } },
      questions: { orderBy: { order: "asc" } },
      userQuestions: {
        where: { status: "answered" },
        orderBy: [{ order: "asc" }, { answeredAt: "desc" }],
        // whatsappNumber jaan boojh kar exclude — woh sirf admin ke liye hai,
        // public par expose nahi hona chahiye.
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
}

export const getPublishedCourse = cache(async (id: string) => {
  const getCached = unstable_cache(
    async () => fetchPublishedCourse(id),
    ["published-course", id],
    { revalidate: 120, tags: ["courses", `course-${id}`] }
  );

  return getCached();
});

export type PublishedCourseDetail = NonNullable<
  Awaited<ReturnType<typeof fetchPublishedCourse>>
>;
