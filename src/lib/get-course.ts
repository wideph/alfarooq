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
        orderBy: { answeredAt: "desc" },
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
