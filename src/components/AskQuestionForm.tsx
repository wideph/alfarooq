"use client";

import { useState } from "react";
import { Loader2, MessageCircle, Send } from "lucide-react";
import type { PageTheme } from "@/lib/theme";

interface AskQuestionFormProps {
  courseId: string;
  onSubmitted: () => void;
  theme?: PageTheme;
}

const styles = {
  home: {
    shell: "from-slate-900/80 to-violet-950/30 border-violet-800/40",
    icon: "from-violet-500 to-indigo-600",
    title: "text-slate-100",
    subtitle: "text-slate-400",
    input: "bg-slate-950/60 border-slate-700 text-slate-100 placeholder:text-slate-500 focus:border-violet-500 focus:ring-violet-500/20",
    button: "from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500",
  },
  course: {
    shell: "from-emerald-950/40 to-teal-950/20 border-emerald-800/40",
    icon: "from-emerald-500 to-teal-600",
    title: "text-emerald-50",
    subtitle: "text-slate-400",
    input: "bg-[#060a09]/80 border-emerald-900/50 text-slate-100 placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20",
    button: "from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500",
  },
} as const;

export default function AskQuestionForm({
  courseId,
  onSubmitted,
  theme = "home",
}: AskQuestionFormProps) {
  const t = styles[theme];
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
      className={`rounded-2xl bg-gradient-to-br border shadow-lg shadow-black/20 p-5 sm:p-8 ${t.shell}`}
    >
      <div className="flex items-center gap-3 mb-5">
        <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${t.icon} flex items-center justify-center`}>
          <MessageCircle className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className={`text-lg font-bold urdu-text ${t.title}`}>اپنا سوال پوچھیں</h3>
          <p className={`text-sm urdu-text ${t.subtitle}`}>Paste your question</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={4}
          placeholder="Apna sawal yahan likhein..."
          className={`w-full px-4 py-3 rounded-xl border focus:ring-2 outline-none resize-none urdu-text leading-loose ${t.input}`}
        />

        {error && <p className="text-sm text-red-400 urdu-text">{error}</p>}

        <button
          type="submit"
          disabled={!question.trim() || submitting}
          className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl bg-gradient-to-r text-white font-semibold disabled:opacity-50 transition-all ${t.button}`}
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
