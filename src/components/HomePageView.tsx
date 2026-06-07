import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import type { SiteSettingsData } from "@/lib/site-settings";
import type { PublishedCourse } from "@/lib/get-published-courses";
import {
  BookOpen,
  FileText,
  HelpCircle,
  ArrowRight,
} from "lucide-react";

function getHeroPadding(text: string) {
  const len = text.length;
  if (len > 150) return "py-8 sm:py-10";
  if (len > 80) return "py-6 sm:py-8";
  return "py-5 sm:py-6";
}

function getHeroTextSize(text: string) {
  const len = text.length;
  if (len > 150) return "text-base sm:text-lg md:text-xl";
  if (len > 80) return "text-lg sm:text-xl md:text-2xl";
  return "text-xl sm:text-2xl md:text-3xl";
}

export default function HomePageView({
  settings,
  courses,
}: {
  settings: SiteSettingsData;
  courses: PublishedCourse[];
}) {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        {settings.heroText ? (
          <section className={`relative overflow-hidden ${getHeroPadding(settings.heroText)}`}>
            <div className="absolute inset-0 bg-gradient-to-br from-primary-600/10 via-accent-500/5 to-emerald-500/10" />
            <div className="absolute top-20 left-10 w-72 h-72 bg-primary-400/20 rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-10 w-96 h-96 bg-accent-400/20 rounded-full blur-3xl" />

            <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
              <p
                className={`text-center font-semibold text-slate-900 leading-relaxed urdu-text ${getHeroTextSize(settings.heroText)}`}
              >
                {settings.heroText}
              </p>
            </div>
          </section>
        ) : null}

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-3 urdu-text">
              <BookOpen className="w-7 h-7 text-primary-500" />
              Courses and Services
            </h3>
            <span className="text-sm text-slate-500">
              {courses.length} item{courses.length !== 1 ? "s" : ""}
            </span>
          </div>

          {courses.length === 0 ? (
            <div className="text-center py-20 bg-white/60 rounded-2xl border border-slate-200">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-lg text-slate-500 urdu-text">Abhi koi course available nahi hai</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {courses.map((course) => (
                <Link key={course.id} href={`/courses/${course.id}`} className="group">
                  <article className="min-h-[22rem] h-full rounded-2xl bg-white border border-slate-200/80 shadow-md hover:shadow-2xl hover:border-primary-200 hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col">
                    <div className="h-3 bg-gradient-to-r from-primary-500 via-accent-500 to-emerald-500" />
                    <div className="p-7 sm:p-8 flex flex-col flex-1">
                      <h4 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 group-hover:text-primary-600 transition-colors line-clamp-2 urdu-text leading-snug">
                        {course.title}
                      </h4>
                      <p className="text-slate-600 text-sm sm:text-base leading-loose mb-8 flex-1 line-clamp-5 urdu-text">
                        {course.description}
                      </p>
                      <div className="flex items-center gap-5 text-sm text-slate-500 mb-5 pt-4 border-t border-slate-100">
                        <span className="flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-primary-400" />
                          {course._count.samples} samples
                        </span>
                        <span className="flex items-center gap-1.5">
                          <HelpCircle className="w-4 h-4 text-accent-400" />
                          {course._count.questions} Q&A
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-primary-600 font-semibold text-sm group-hover:gap-3 transition-all">
                        View Details
                        <ArrowRight className="w-4 h-4" />
                      </div>
                    </div>
                  </article>
                </Link>
              ))}
            </div>
          )}
        </section>
      </main>

      <Footer />
    </div>
  );
}
