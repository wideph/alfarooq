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
    <div className="app-page">
      <Header />
      <SubmitQuestionModal open={showSubmitModal} onClose={() => setShowSubmitModal(false)} />

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 py-8">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-sm text-app-text-muted hover:text-app-primary mb-8 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Courses and Services
        </Link>

        <div className="space-y-8">
          <div className="surface-elevated p-6 sm:p-8 shadow-[0_12px_40px_rgba(0,0,0,0.25)]">
            <div className="flex flex-wrap items-center gap-2 mb-4">
              <span className="badge-live">Live Course</span>
              {course.samples.length > 0 && <span className="badge-premium">Resources Included</span>}
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold text-app-text mb-4 urdu-text leading-snug">
              {course.title}
            </h1>
            <p className="text-app-text-secondary leading-relaxed text-base sm:text-lg urdu-text whitespace-pre-line">
              {course.description}
            </p>
          </div>

          {hasSamples && (
            <section className="space-y-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-app-primary mb-1">Materials</p>
                <h2 className="text-xl sm:text-2xl font-semibold text-app-text flex items-center gap-2 urdu-text">
                  <FileText className="w-5 h-5 text-app-primary" />
                  Sample Materials
                </h2>
              </div>

              {course.samples.map((sample, index) => (
                <div key={sample.id} className="surface-card p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2 px-1">
                    {sample.type === "pdf" ? (
                      <FileText className="w-5 h-5 text-app-error flex-shrink-0" />
                    ) : (
                      <ImageIcon className="w-5 h-5 text-app-teal flex-shrink-0" />
                    )}
                    <h3 className="font-medium text-app-text urdu-text">{sample.title}</h3>
                    <span className="text-xs text-app-text-muted uppercase tracking-wide">{sample.type}</span>
                  </div>

                  {sample.type === "pdf" ? (
                    <PdfViewer filename={sample.filename} title={sample.title} />
                  ) : (
                    <ImageViewer filename={sample.filename} title={sample.title} />
                  )}

                  {index < course.samples.length - 1 && <div className="border-b border-app-border pt-2" />}
                </div>
              ))}
            </section>
          )}

          <section>
            <div className="mb-5">
              <p className="text-xs uppercase tracking-wide text-app-teal mb-1">Support</p>
              <h2 className="text-xl sm:text-2xl font-semibold text-app-text flex items-center gap-2 urdu-text">
                <HelpCircle className="w-5 h-5 text-app-teal" />
                Questions & Answers
              </h2>
            </div>
            <div className="surface-card p-4 sm:p-6">
              {allQuestions.length > 0 ? (
                <QASection questions={allQuestions} />
              ) : (
                <p className="text-app-text-muted text-center py-6 urdu-text">
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
