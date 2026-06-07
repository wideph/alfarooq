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
    <div className="surface-elevated p-5 sm:p-8">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 rounded-xl bg-app-primary flex items-center justify-center shadow-[0_8px_24px_rgba(79,124,255,0.18)]">
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-app-text urdu-text">اپنا سوال پوچھیں</h3>
          <p className="text-sm text-app-text-muted urdu-text">Paste your question</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          placeholder="Apna sawal yahan likhein..."
          className="input-app resize-none urdu-text leading-loose"
        />

        {error && <p className="text-sm text-app-error urdu-text">{error}</p>}

        <button type="submit" disabled={!question.trim() || submitting} className="btn-primary w-full sm:w-auto">
          {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
          Submit Question
        </button>
      </form>
    </div>
  );
}
