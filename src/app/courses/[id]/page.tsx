import { notFound } from "next/navigation";
import CoursePageView from "@/components/CoursePageView";
import { getPublishedCourse } from "@/lib/get-course";

export const revalidate = 120;

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
