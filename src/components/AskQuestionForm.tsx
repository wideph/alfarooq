"use client";

import { useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";

interface AskQuestionFormProps {
  courseId: string;
  onSubmitted: () => void;
}

export default function AskQuestionForm({ courseId, onSubmitted }: AskQuestionFormProps) {
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
    <div className="rounded-2xl bg-gradient-to-br from-white to-primary-50/40 border border-primary-100 shadow-sm p-5 sm:p-8">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-500 to-accent-500 flex items-center justify-center">
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
          className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none resize-none urdu-text leading-loose"
        />

        {error && (
          <p className="text-sm text-red-600 urdu-text">{error}</p>
        )}

        <button
          type="submit"
          disabled={!question.trim() || submitting}
          className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r from-primary-600 to-accent-600 text-white font-semibold hover:from-primary-700 hover:to-accent-700 disabled:opacity-50 transition-all"
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
