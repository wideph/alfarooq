"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle, User, Eye, EyeOff } from "lucide-react";
import AnswerContent from "@/components/AnswerContent";
import type { PageTheme } from "@/lib/theme";

export interface QAItem {
  id: string;
  question: string;
  answer: string;
  order?: number;
  fromUser?: boolean;
  answerMediaFilename?: string | null;
  answerMediaType?: string | null;
}

interface QASectionProps {
  questions: QAItem[];
  emptyMessage?: string;
  theme?: PageTheme;
}

const styles = {
  home: {
    toggle: "text-slate-300 bg-slate-800 hover:bg-slate-700",
    card: "border-slate-700/60 bg-slate-900/60 hover:shadow-violet-500/5",
    questionBtn: "hover:bg-slate-800/80",
    questionText: "text-slate-200",
    badge: "text-violet-300 bg-violet-500/15",
    number: "from-violet-500 to-indigo-600",
    answer: "from-violet-950/80 to-indigo-950/60 border-violet-800/40",
    answerLabel: "text-violet-300",
    empty: "text-slate-500",
    emptyIcon: "text-slate-600",
  },
  course: {
    toggle: "text-slate-300 bg-emerald-950/60 hover:bg-emerald-900/50",
    card: "border-emerald-800/40 bg-[#0a100e]/70 hover:shadow-emerald-500/5",
    questionBtn: "hover:bg-emerald-950/50",
    questionText: "text-slate-200",
    badge: "text-emerald-300 bg-emerald-500/15",
    number: "from-emerald-500 to-teal-600",
    answer: "from-emerald-950/70 to-teal-950/50 border-emerald-800/40",
    answerLabel: "text-emerald-300",
    empty: "text-slate-400",
    emptyIcon: "text-emerald-800",
  },
} as const;

export default function QASection({
  questions,
  emptyMessage = "Abhi koi questions nahi hain",
  theme = "home",
}: QASectionProps) {
  const t = styles[theme];
  const questionIds = useMemo(() => questions.map((q) => q.id), [questions]);
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(questionIds));

  useEffect(() => {
    setOpenIds(new Set(questionIds));
  }, [questionIds]);

  const allOpen = openIds.size === questions.length && questions.length > 0;

  function toggleOne(id: string) {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allOpen) {
      setOpenIds(new Set());
    } else {
      setOpenIds(new Set(questionIds));
    }
  }

  if (questions.length === 0) {
    return (
      <div className={`text-center py-12 urdu-text ${t.empty}`}>
        <HelpCircle className={`w-12 h-12 mx-auto mb-3 ${t.emptyIcon}`} />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={toggleAll}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors urdu-text ${t.toggle}`}
        >
          {allOpen ? (
            <>
              <EyeOff className="w-3.5 h-3.5" /> سب جواب چھپائیں
            </>
          ) : (
            <>
              <Eye className="w-3.5 h-3.5" /> سب جواب دکھائیں
            </>
          )}
        </button>
      </div>

      {questions.map((q, index) => {
        const isOpen = openIds.has(q.id);
        return (
          <div
            key={q.id}
            className={`rounded-xl border overflow-hidden shadow-sm hover:shadow-md transition-shadow ${t.card}`}
          >
            <button
              onClick={() => toggleOne(q.id)}
              className={`w-full flex items-start gap-3 p-4 sm:p-5 text-left transition-colors ${t.questionBtn}`}
            >
              <span
                className={`flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br ${t.number} text-white text-sm font-bold flex items-center justify-center`}
              >
                {index + 1}
              </span>
              <span className={`flex-1 font-medium pt-1 urdu-text leading-loose ${t.questionText}`}>
                {q.question}
                {q.fromUser && (
                  <span
                    className={`inline-flex items-center gap-1 ml-2 text-xs font-normal px-2 py-0.5 rounded-full ${t.badge}`}
                  >
                    <User className="w-3 h-3" />
                    User
                  </span>
                )}
              </span>
              {isOpen ? (
                <ChevronUp className="w-5 h-5 text-slate-500 flex-shrink-0 mt-1" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-500 flex-shrink-0 mt-1" />
              )}
            </button>
            {isOpen && (q.answer || q.answerMediaFilename) && (
              <div className="px-4 sm:px-5 pb-4 sm:pb-5 pl-15 sm:pl-16">
                <div className={`p-4 rounded-lg bg-gradient-to-r border ${t.answer}`}>
                  <p className={`text-sm font-semibold mb-2 urdu-text ${t.answerLabel}`}>جواب:</p>
                  <AnswerContent
                    answer={q.answer}
                    mediaFilename={q.answerMediaFilename}
                    mediaType={q.answerMediaType}
                  />
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
