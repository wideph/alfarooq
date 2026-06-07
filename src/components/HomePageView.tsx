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

export default function HomePageView({
  settings,
  courses,
}: {
  settings: SiteSettingsData;
  courses: PublishedCourse[];
}) {
  return (
    <div className="theme-home min-h-screen flex flex-col">
      <Header theme="home" />

      <main className="flex-1">
        <HeroSection settings={settings} />

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-10">
          <div className="mb-8">
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-100 flex items-center gap-3 urdu-text">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 ring-1 ring-violet-400/25">
                <BookOpen className="w-5 h-5 text-violet-300" />
              </span>
              Courses and Services
            </h3>
          </div>

          {courses.length === 0 ? (
            <div className="text-center py-20 rounded-2xl border border-slate-700/50 bg-slate-900/50 backdrop-blur-sm">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-lg text-slate-400 urdu-text">Abhi koi course available nahi hai</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {courses.map((course) => (
                <Link key={course.id} href={`/courses/${course.id}`} className="group">
                  <article className="min-h-[22rem] h-full rounded-2xl border border-slate-700/60 bg-slate-900/55 backdrop-blur-sm shadow-xl shadow-black/20 hover:border-violet-400/40 hover:shadow-violet-500/10 hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col">
                    <div className="h-1 bg-gradient-to-r from-violet-500 via-indigo-500 to-blue-500" />
                    <div className="p-7 sm:p-8 flex flex-col flex-1">
                      <h4 className="text-xl sm:text-2xl font-bold text-slate-100 mb-4 group-hover:text-violet-200 transition-colors line-clamp-2 urdu-text leading-snug">
                        {course.title}
                      </h4>
                      <p className="text-slate-400 text-sm sm:text-base leading-loose mb-8 flex-1 line-clamp-5 urdu-text whitespace-pre-line">
                        {course.description}
                      </p>
                      <div className="flex items-center gap-5 text-sm text-slate-500 mb-5 pt-4 border-t border-slate-700/60">
                        <span className="flex items-center gap-1.5">
                          <FileText className="w-4 h-4 text-violet-400" />
                          {course._count.samples} samples
                        </span>
                        <span className="flex items-center gap-1.5">
                          <HelpCircle className="w-4 h-4 text-indigo-400" />
                          {course._count.questions} Q&A
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-violet-300 font-semibold text-sm group-hover:gap-3 transition-all">
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

      <Footer theme="home" />
    </div>
  );
}
