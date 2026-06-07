import { cache } from "react";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";

async function fetchPublishedCourses() {
  return prisma.course.findMany({
    where: { isPublished: true },
    orderBy: [{ order: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { samples: true, questions: true } },
    },
  });
}

const getCachedPublishedCourses = unstable_cache(
  fetchPublishedCourses,
  ["published-courses"],
  { revalidate: 120, tags: ["courses"] }
);

export const getPublishedCourses = cache(getCachedPublishedCourses);

export type PublishedCourse = Awaited<
  ReturnType<typeof fetchPublishedCourses>
>[number];
