import { NextResponse } from "next/server";
import { getSiteSettings } from "@/lib/get-site-settings";
import { getPublishedCourses } from "@/lib/get-published-courses";

// §W28 perf: pehle har public page load (aur har client navigation) par 2
// uncached DB queries ek ke baad ek chalti thin. Ab dono cached loaders
// (settings: "site-settings" tag, courses: "courses" tag — admin save par
// foran invalidate) parallel se.
export async function GET() {
  const [settings, courses] = await Promise.all([getSiteSettings(), getPublishedCourses()]);

  return NextResponse.json(
    {
      enabled: settings.botEnabled,
      provider: settings.botProvider,
      model: settings.botModel,
      courses: courses.map((course) => ({ id: course.id, title: course.title })),
    },
    {
      // Public, sab visitors ke liye same — CDN edge se (function tak nahi
      // jata). Admin toggle/course change zyada se zyada ~1 min mein dikhe.
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" },
    }
  );
}
