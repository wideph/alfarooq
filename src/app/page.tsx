import HomePageView from "@/components/HomePageView";
import { getPublishedCourses } from "@/lib/get-published-courses";
import { getSiteSettings } from "@/lib/get-site-settings";

export const revalidate = 120;

export default async function HomePage() {
  const [settings, courses] = await Promise.all([
    getSiteSettings(),
    getPublishedCourses(),
  ]);

  return <HomePageView settings={settings} courses={courses} />;
}
