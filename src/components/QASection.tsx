"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle, User, Eye, EyeOff } from "lucide-react";
import AnswerContent from "@/components/AnswerContent";

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
  variant?: "default" | "course";
}

export default function QASection({
  questions,
  emptyMessage = "Abhi koi questions nahi hain",
  variant = "default",
}: QASectionProps) {
  const isCourse = variant === "course";
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
      <div className="text-center py-12 text-slate-500 urdu-text">
        <HelpCircle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={toggleAll}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors urdu-text ${
            isCourse
              ? "text-violet-700 bg-violet-100 hover:bg-violet-200"
              : "text-slate-600 bg-slate-100 hover:bg-slate-200"
          }`}
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
            className={`rounded-xl overflow-hidden shadow-sm hover:shadow-md transition-shadow ${
              isCourse
                ? "border border-violet-200/60 bg-white/90 hover:border-violet-300"
                : "border border-slate-200 bg-white animate-fade-in"
            }`}
            style={isCourse ? undefined : { animationDelay: `${index * 50}ms` }}
          >
            <button
              onClick={() => toggleOne(q.id)}
              className={`w-full flex items-start gap-2.5 sm:gap-3 p-3.5 sm:p-5 text-left transition-colors min-w-0 ${
                isCourse ? "hover:bg-violet-50/50" : "hover:bg-slate-50"
              }`}
            >
              <span
                className={`shrink-0 w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-white text-xs sm:text-sm font-bold flex items-center justify-center ${
                  isCourse
                    ? "bg-gradient-to-br from-violet-500 to-indigo-600"
                    : "bg-gradient-to-br from-primary-500 to-accent-500"
                }`}
              >
                {index + 1}
              </span>
              <span className="flex-1 min-w-0 font-medium text-slate-800 pt-0.5 urdu-text leading-relaxed break-words [overflow-wrap:anywhere] text-sm sm:text-base">
                {q.question}
                {q.fromUser && (
                  <span className="inline-flex items-center gap-1 ml-1.5 mt-1 text-[10px] sm:text-xs font-normal text-accent-600 bg-accent-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                    <User className="w-3 h-3" />
                    User
                  </span>
                )}
              </span>
              {isOpen ? (
                <ChevronUp className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
              )}
            </button>
            {isOpen && (q.answer || q.answerMediaFilename) && (
              <div className="border-t border-slate-100/80 px-3.5 sm:px-5 pb-3.5 sm:pb-5 pt-3 min-w-0 overflow-hidden">
                <div
                  className={`p-3 sm:p-4 rounded-lg border min-w-0 overflow-hidden ${
                    isCourse
                      ? "bg-gradient-to-r from-violet-50 to-indigo-50 border-violet-100"
                      : "bg-gradient-to-r from-primary-50 to-accent-50 border-primary-100"
                  }`}
                >
                  <p
                    className={`text-sm font-semibold mb-2 urdu-text ${
                      isCourse ? "text-violet-700" : "text-primary-700"
                    }`}
                  >
                    جواب:
                  </p>
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
