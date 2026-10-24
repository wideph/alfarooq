import { notFound } from "next/navigation";
import CoursePageView from "@/components/CoursePageView";
import { getPublishedCourse } from "@/lib/get-course";

export const revalidate = 120;

// §W28 perf: khali generateStaticParams = on-demand ISR. Pehle ye route har
// request par dynamic render hota tha (production: `no-store`, CDN MISS, cold
// start par ~9s). Ab pehli request ke baad page CDN (visitor ke qareeb edge)
// se aata hai; course edit par `course-<id>` / `courses` tags page bhi foran
// taaza kar dete hain (revalidateCourseCache).
export async function generateStaticParams() {
  return [];
}

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function CoursePage({ params }: PageProps) {
  const { id } = await params;
  const course = await getPublishedCourse(id);

  if (!course || !course.isPublished) {
    notFound();
  }

  return <CoursePageView initialCourse={course} />;
}
