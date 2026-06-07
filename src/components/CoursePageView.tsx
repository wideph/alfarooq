"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import PdfViewer from "@/components/PdfViewer";
import ImageViewer from "@/components/ImageViewer";
import QASection, { type QAItem } from "@/components/QASection";
import AskQuestionForm from "@/components/AskQuestionForm";
import SubmitQuestionModal from "@/components/SubmitQuestionModal";
import type { PublishedCourseDetail } from "@/lib/get-course";
import {
  ArrowLeft,
  FileText,
  Image as ImageIcon,
  HelpCircle,
} from "lucide-react";

function buildQuestions(course: PublishedCourseDetail): QAItem[] {
  return [
    ...course.questions.map((q) => ({
      id: q.id,
      question: q.question,
      answer: q.answer,
      order: q.order,
      fromUser: false,
      answerMediaFilename: q.answerMediaFilename,
      answerMediaType: q.answerMediaType,
    })),
    ...course.userQuestions
      .filter((q) => q.status === "answered" && (q.answer || q.answerMediaFilename))
      .map((q) => ({
        id: `user-${q.id}`,
        question: q.question,
        answer: q.answer || "",
        fromUser: true,
        answerMediaFilename: q.answerMediaFilename,
        answerMediaType: q.answerMediaType,
      })),
  ];
}

export default function CoursePageView({
  initialCourse,
}: {
  initialCourse: PublishedCourseDetail;
}) {
  const [course, setCourse] = useState(initialCourse);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  const reloadCourse = useCallback(() => {
    fetch(`/api/courses/${course.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Reload failed");
        return r.json();
      })
      .then((data) => setCourse(data))
      .catch(() => {});
  }, [course.id]);

  const hasSamples = course.samples.length > 0;
  const allQuestions = buildQuestions(course);

  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <SubmitQuestionModal open={showSubmitModal} onClose={() => setShowSubmitModal(false)} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-primary-600 mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Courses and Services
        </Link>

        <div className="space-y-10">
          <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 sm:p-8">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-4 urdu-text leading-snug">
              {course.title}
            </h1>
            <p className="text-slate-600 leading-loose text-base sm:text-lg urdu-text whitespace-pre-line">
              {course.description}
            </p>
          </div>

          {hasSamples && (
            <section className="space-y-8">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2 urdu-text">
                <FileText className="w-6 h-6 text-primary-500" />
                Sample Materials
              </h2>

              {course.samples.map((sample, index) => (
                <div key={sample.id} className="space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    {sample.type === "pdf" ? (
                      <FileText className="w-5 h-5 text-red-500 flex-shrink-0" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-emerald-500 flex-shrink-0" />
                    )}
                    <h3 className="font-semibold text-slate-800 urdu-text">{sample.title}</h3>
                    <span className="text-xs text-slate-400 uppercase">{sample.type}</span>
                  </div>

                  {sample.type === "pdf" ? (
                    <PdfViewer filename={sample.filename} title={sample.title} />
                  ) : (
                    <ImageViewer filename={sample.filename} title={sample.title} />
                  )}

                  {index < course.samples.length - 1 && (
                    <div className="border-b border-slate-200 pt-2" />
                  )}
                </div>
              ))}
            </section>
          )}

          <section>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-5 flex items-center gap-2 urdu-text">
              <HelpCircle className="w-6 h-6 text-accent-500" />
              Questions & Answers
            </h2>
            <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm">
              {allQuestions.length > 0 ? (
                <QASection questions={allQuestions} />
              ) : (
                <p className="text-slate-500 text-center py-6 urdu-text">
                  Abhi koi sawal jawab available nahi hai
                </p>
              )}
            </div>
          </section>

          <section>
            <AskQuestionForm
              courseId={course.id}
              onSubmitted={() => {
                setShowSubmitModal(true);
                reloadCourse();
              }}
            />
          </section>
        </div>
      </main>

      <Footer />
    </div>
  );
}
