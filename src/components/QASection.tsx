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
}

export default function QASection({
  questions,
  emptyMessage = "Abhi koi questions nahi hain",
}: QASectionProps) {
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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors urdu-text"
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
            className="rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm hover:shadow-md transition-shadow animate-fade-in"
            style={{ animationDelay: `${index * 50}ms` }}
          >
            <button
              onClick={() => toggleOne(q.id)}
              className="w-full flex items-start gap-3 p-4 sm:p-5 text-left hover:bg-slate-50 transition-colors"
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-gradient-to-br from-primary-500 to-accent-500 text-white text-sm font-bold flex items-center justify-center">
                {index + 1}
              </span>
              <span className="flex-1 font-medium text-slate-800 pt-1 urdu-text leading-loose">
                {q.question}
                {q.fromUser && (
                  <span className="inline-flex items-center gap-1 ml-2 text-xs font-normal text-accent-600 bg-accent-50 px-2 py-0.5 rounded-full">
                    <User className="w-3 h-3" />
                    User
                  </span>
                )}
              </span>
              {isOpen ? (
                <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
              ) : (
                <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0 mt-1" />
              )}
            </button>
            {isOpen && (q.answer || q.answerMediaFilename) && (
              <div className="px-4 sm:px-5 pb-4 sm:pb-5 pl-15 sm:pl-16">
                <div className="p-4 rounded-lg bg-gradient-to-r from-primary-50 to-accent-50 border border-primary-100">
                  <p className="text-sm font-semibold text-primary-700 mb-2 urdu-text">جواب:</p>
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
