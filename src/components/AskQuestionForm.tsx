"use client";

import { useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";

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
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;

    setSubmitting(true);
    setError("");

    try {
      const res = await fetch(`/api/courses/${courseId}/user-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: question.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Submit fail");
      }

      setQuestion("");
      onSubmitted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Submit fail");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className={`rounded-2xl shadow-sm p-5 sm:p-8 border ${
        isCourse
          ? "bg-gradient-to-br from-teal-50/60 via-white to-indigo-50/40 border-teal-200/50 shadow-teal-100/30"
          : "bg-gradient-to-br from-white to-primary-50/40 border-primary-100"
      }`}
    >
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

        {error && (
          <p className="text-sm text-red-600 urdu-text">{error}</p>
        )}

        <button
          type="submit"
          disabled={!question.trim() || submitting}
          className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl text-white font-semibold disabled:opacity-50 transition-all ${
            isCourse
              ? "bg-gradient-to-r from-teal-600 to-indigo-600 hover:from-teal-700 hover:to-indigo-700"
              : "bg-gradient-to-r from-primary-600 to-accent-600 hover:from-primary-700 hover:to-accent-700"
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
