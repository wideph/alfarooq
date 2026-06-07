import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import HeroSection from "@/components/HeroSection";
import type { SiteSettingsData } from "@/lib/site-settings";
import type { PublishedCourse } from "@/lib/get-published-courses";
import {
  BookOpen,
  FileText,
  HelpCircle,
  ArrowRight,
} from "lucide-react";

function getCourseBadge(course: PublishedCourse, index: number) {
  if (index === 0) return { label: "Featured", className: "badge-live" };
  if (course._count.samples >= 3) return { label: "Premium", className: "badge-premium" };
  if (course._count.questions >= 5) return { label: "Popular", className: "badge-premium" };
  return { label: "Available", className: "badge-live" };
}

export default function HomePageView({
  settings,
  courses,
}: {
  settings: SiteSettingsData;
  courses: PublishedCourse[];
}) {
  return (
    <div className="app-page">
      <Header />

      <main className="flex-1">
        <HeroSection settings={settings} />

        <section id="courses" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-12">
          <div className="mb-10">
            <p className="text-sm font-medium text-app-primary mb-2 tracking-wide uppercase">
              Catalog
            </p>
            <h2 className="text-2xl sm:text-3xl font-semibold text-app-text flex items-center gap-3 urdu-text">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-app-primary/10 ring-1 ring-app-primary/25">
                <BookOpen className="w-5 h-5 text-app-primary" />
              </span>
              Courses and Services
            </h2>
            <p className="mt-3 text-app-text-secondary max-w-2xl">
              Explore structured courses with samples, Q&A, and expert-supported learning paths.
            </p>
          </div>

          {courses.length === 0 ? (
            <div className="text-center py-20 surface-card">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-app-text-muted" />
              <p className="text-lg text-app-text-secondary urdu-text">Abhi koi course available nahi hai</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {courses.map((course, index) => {
                const badge = getCourseBadge(course, index);
                return (
                  <Link key={course.id} href={`/courses/${course.id}`} className="group block h-full">
                    <article className="surface-card h-full min-h-[22rem] overflow-hidden flex flex-col">
                      <div className="h-1 bg-gradient-to-r from-app-primary via-app-teal to-app-highlight" />
                      <div className="p-6 sm:p-7 flex flex-col flex-1">
                        <div className="mb-3">
                          <span className={badge.className}>{badge.label}</span>
                        </div>
                        <h3 className="text-xl font-semibold text-app-text mb-3 group-hover:text-app-primary transition-colors line-clamp-2 urdu-text leading-snug">
                          {course.title}
                        </h3>
                        <p className="text-app-text-secondary text-sm leading-relaxed mb-6 flex-1 line-clamp-5 urdu-text whitespace-pre-line">
                          {course.description}
                        </p>
                        <div className="flex items-center gap-4 text-xs text-app-text-muted mb-5 pt-4 border-t border-app-border">
                          <span className="flex items-center gap-1.5">
                            <FileText className="w-4 h-4 text-app-primary" />
                            {course._count.samples} samples
                          </span>
                          <span className="flex items-center gap-1.5">
                            <HelpCircle className="w-4 h-4 text-app-teal" />
                            {course._count.questions} Q&A
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-app-primary font-semibold text-sm group-hover:gap-3 transition-all">
                          View Details
                          <ArrowRight className="w-4 h-4" />
                        </div>
                      </div>
                    </article>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
