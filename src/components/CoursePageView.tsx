"use client";

import { useCallback, useEffect, useState } from "react";
import { getPdfJs } from "@/lib/pdfjs";
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
  const items: QAItem[] = [
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
        order: q.order,
        fromUser: true,
        answerMediaFilename: q.answerMediaFilename,
        answerMediaType: q.answerMediaType,
      })),
  ];

  return items.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

export default function CoursePageView({
  initialCourse,
}: {
  initialCourse: PublishedCourseDetail;
}) {
  const [course, setCourse] = useState(initialCourse);
  const [showSubmitModal, setShowSubmitModal] = useState(false);

  useEffect(() => {
    void getPdfJs();
  }, []);

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
    <div className="page-course min-h-screen flex flex-col">
      <Header />
      <SubmitQuestionModal open={showSubmitModal} onClose={() => setShowSubmitModal(false)} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-indigo-600/80 hover:text-indigo-700 mb-6 transition-colors font-medium"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Types of Diploma and services
        </Link>

        <div className="space-y-10">
          <div className="relative overflow-hidden rounded-2xl border border-indigo-200/60 bg-gradient-to-br from-indigo-50/90 via-white to-teal-50/50 shadow-md shadow-indigo-100/40 p-6 sm:p-8">
            <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-gradient-to-b from-indigo-500 via-violet-500 to-teal-500" />
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-4 urdu-text leading-snug pl-3">
              {course.title}
            </h1>
            <p className="text-slate-600 leading-loose text-base sm:text-lg urdu-text whitespace-pre-line pl-3">
              {course.description}
            </p>
          </div>

          {hasSamples && (
            <section className="space-y-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-800 flex items-center gap-2 urdu-text">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-100 text-teal-700">
                  <FileText className="w-5 h-5" />
                </span>
                Sample Materials
              </h2>

              {course.samples.map((sample, index) => (
                <div
                  key={sample.id}
                  className="space-y-3 rounded-2xl border border-teal-200/50 bg-white/80 backdrop-blur-sm p-4 sm:p-5 shadow-sm shadow-teal-100/30"
                >
                  <div className="flex items-center gap-2 px-1">
                    {sample.type === "pdf" ? (
                      <FileText className="w-5 h-5 text-rose-500 flex-shrink-0" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-teal-600 flex-shrink-0" />
                    )}
                    <h3 className="font-semibold text-slate-800 urdu-text">{sample.title}</h3>
                    <span className="text-xs text-teal-600/70 uppercase font-medium bg-teal-50 px-2 py-0.5 rounded-full">
                      {sample.type}
                    </span>
                  </div>

                  {sample.type === "pdf" ? (
                    <PdfViewer filename={sample.filename} title={sample.title} />
                  ) : (
                    <ImageViewer filename={sample.filename} title={sample.title} />
                  )}

                  {index < course.samples.length - 1 && (
                    <div className="border-b border-teal-100/80 pt-2" />
                  )}
                </div>
              ))}
            </section>
          )}

          <section>
            <h2 className="text-xl sm:text-2xl font-bold text-slate-800 mb-5 flex items-center gap-2 urdu-text">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
                <HelpCircle className="w-5 h-5" />
              </span>
              Questions & Answers
            </h2>
            <div className="rounded-2xl border border-violet-200/50 bg-gradient-to-br from-violet-50/40 via-white to-indigo-50/30 p-4 sm:p-6 shadow-sm shadow-violet-100/30">
              {allQuestions.length > 0 ? (
                <QASection questions={allQuestions} variant="course" />
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
              variant="course"
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
