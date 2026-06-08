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
    <div className="page-home min-h-screen flex flex-col">
      <Header />

      <main className="flex-1">
        <HeroSection settings={settings} />

        <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-20 pt-8">
          <div className="mb-8">
            <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 flex items-center gap-3 urdu-text">
              <BookOpen className="w-7 h-7 text-primary-500" />
              Courses and Services
            </h3>
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
                  <article className="min-h-[22rem] h-full rounded-2xl bg-white/90 backdrop-blur-sm border border-sky-100/80 shadow-md shadow-sky-100/50 hover:shadow-xl hover:shadow-sky-200/40 hover:border-sky-200 hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col">
                    <div className="h-3 bg-gradient-to-r from-sky-500 via-primary-500 to-emerald-400" />
                    <div className="p-7 sm:p-8 flex flex-col flex-1">
                      <h4 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 group-hover:text-primary-600 transition-colors line-clamp-2 urdu-text leading-snug">
                        {course.title}
                      </h4>
                      <p className="text-slate-600 text-sm sm:text-base leading-loose mb-8 flex-1 line-clamp-5 urdu-text whitespace-pre-line">
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
