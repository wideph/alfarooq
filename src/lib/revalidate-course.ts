import { revalidateTag } from "next/cache";

export function revalidateCourseCache(courseId: string) {
  revalidateTag("courses");
  revalidateTag(`course-${courseId}`);
}
