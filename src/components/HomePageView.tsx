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
          <div className="mb-9">
            <h3 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold flex items-center gap-3 leading-tight">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-primary-500 to-accent-500 text-white shadow-lg shadow-primary-500/30 animate-float-slow">
                <BookOpen className="w-6 h-6" />
              </span>
              <span className="text-gradient">Types of Diploma and services</span>
            </h3>
            <div className="mt-3 h-1.5 w-28 rounded-full bg-gradient-to-r from-primary-500 via-accent-500 to-emerald-400" />
          </div>

          {courses.length === 0 ? (
            <div className="text-center py-20 bg-white/60 rounded-2xl border border-slate-200">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-slate-300" />
              <p className="text-lg text-slate-500 urdu-text">Abhi koi course available nahi hai</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {courses.map((course, index) => (
                <Link key={course.id} href={`/courses/${course.id}`} className="group animate-fade-in-up" style={{ animationDelay: `${index * 90}ms` }}>
                  <article className="sheen relative min-h-[22rem] h-full rounded-3xl bg-white/85 backdrop-blur-md border border-white/70 shadow-lg shadow-sky-100/50 ring-1 ring-sky-100/40 hover:shadow-2xl hover:shadow-primary-200/50 hover:ring-primary-200/60 hover:-translate-y-2 transition-all duration-300 overflow-hidden flex flex-col">
                    {/* gradient glow border on hover */}
                    <div className="pointer-events-none absolute inset-0 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-br from-sky-400/10 via-violet-400/10 to-emerald-400/10" />
                    <div className="h-3 bg-gradient-to-r from-sky-500 via-primary-500 to-emerald-400 bg-[length:200%_100%] group-hover:bg-[position:100%] transition-all duration-500" />
                    <div className="relative p-7 sm:p-8 flex flex-col flex-1">
                      <h4 className="text-xl sm:text-2xl font-bold text-slate-900 mb-4 group-hover:text-primary-600 transition-colors urdu-text leading-[1.85]">
                        {course.title}
                      </h4>
                      <p className="text-slate-600 text-sm sm:text-base leading-loose mb-8 flex-1 line-clamp-5 urdu-text whitespace-pre-line">
                        {course.description}
                      </p>
                      <div className="flex items-center gap-3 text-sm mb-5 pt-4 border-t border-slate-100">
                        <span className="flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-primary-700 font-medium">
                          <FileText className="w-4 h-4" />
                          {course._count.samples} samples
                        </span>
                        <span className="flex items-center gap-1.5 rounded-full bg-accent-50 px-3 py-1 text-accent-700 font-medium">
                          <HelpCircle className="w-4 h-4" />
                          {course._count.questions} Q&A
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-primary-600 font-bold text-sm group-hover:gap-3 transition-all">
                        View Details
                        <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
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
