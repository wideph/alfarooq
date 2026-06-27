"use client";

import { useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import { getOrCreateVisitorKey, peekPreviousVisitorKey } from "@/lib/visitor-client";

interface AskQuestionFormProps {
  courseId: string;
  onSubmitted: () => void;
  variant?: "default" | "course";
}

export default function AskQuestionForm({
  courseId,
  onSubmitted,
  variant = "default",
}: AskQuestionFormProps) {
  const isCourse = variant === "course";
  const [question, setQuestion] = useState("");
  const [whatsappNumber, setWhatsappNumber] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || !whatsappNumber.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/courses/${courseId}/user-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          whatsappNumber: whatsappNumber.trim(),
          visitorKey: getOrCreateVisitorKey(),
          previousVisitorKey: peekPreviousVisitorKey(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submit fail");
      }

      setQuestion("");
      setWhatsappNumber("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit fail");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`relative overflow-hidden rounded-3xl shadow-lg p-5 sm:p-8 ring-1 ${
        isCourse
          ? "bg-gradient-to-br from-teal-50/70 via-white to-indigo-50/50 ring-teal-200/60 shadow-teal-100/40"
          : "bg-gradient-to-br from-white to-primary-50/50 ring-primary-100 shadow-primary-100/40"
      }`}
    >
      <div
        className={`pointer-events-none absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl ${
          isCourse ? "bg-teal-300/20" : "bg-primary-300/20"
        }`}
      />
      <div className="flex items-center gap-3 mb-5">
        <div
          className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            isCourse
              ? "bg-gradient-to-br from-teal-500 to-indigo-600"
              : "bg-gradient-to-br from-primary-500 to-accent-500"
          }`}
        >
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-slate-900 urdu-text">اپنا سوال پوچھیں</h3>
          <p className="text-sm text-slate-500 urdu-text">Paste your question</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          placeholder="Apna sawal yahan likhein..."
          className={`w-full px-4 py-3 rounded-xl border border-slate-200 outline-none resize-y scroll-field urdu-text leading-loose focus:ring-2 ${
            isCourse
              ? "focus:border-teal-400 focus:ring-teal-100"
              : "focus:border-primary-400 focus:ring-primary-100"
          }`}
        />

        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5 urdu-text">
            آپ کا واٹس ایپ نمبر
          </label>
          <input
            type="tel"
            inputMode="tel"
            value={whatsappNumber}
            onChange={(e) => setWhatsappNumber(e.target.value)}
            placeholder="مثلاً 03001234567"
            dir="ltr"
            className={`w-full px-4 py-3 rounded-xl border border-slate-200 outline-none focus:ring-2 ${
              isCourse
                ? "focus:border-teal-400 focus:ring-teal-100"
                : "focus:border-primary-400 focus:ring-primary-100"
            }`}
          />
          <p className="text-xs text-slate-400 mt-1 urdu-text">
            تاکہ ضرورت پڑنے پر ایڈمن آپ سے واٹس ایپ پر رابطہ کر سکے
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600 urdu-text">{error}</p>
        )}

        <button
          type="submit"
          disabled={!question.trim() || !whatsappNumber.trim() || submitting}
          className={`group w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-white font-bold disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95 shadow-lg ${
            isCourse
              ? "bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700 shadow-teal-500/30"
              : "bg-gradient-to-r from-primary-600 to-accent-600 hover:from-primary-700 hover:to-accent-700 shadow-primary-500/30"
          }`}
        >
          {submitting ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Send className="w-5 h-5" />
          )}
          Submit Question
        </button>
      </form>
    </div>
  );
}
