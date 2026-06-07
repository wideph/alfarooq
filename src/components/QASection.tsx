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
    if (allOpen) setOpenIds(new Set());
    else setOpenIds(new Set(questionIds));
  }

  if (questions.length === 0) {
    return (
      <div className="text-center py-12 text-app-text-muted urdu-text">
        <HelpCircle className="w-12 h-12 mx-auto mb-3 text-app-border" />
        <p>{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={toggleAll}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-app-text-secondary bg-app-secondary border border-app-border hover:border-app-primary/40 hover:text-app-text transition-colors urdu-text"
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
            className="rounded-xl border border-app-border bg-app-secondary overflow-hidden hover:border-app-primary/30 transition-colors"
          >
            <button
              onClick={() => toggleOne(q.id)}
              className="w-full flex items-start gap-3 p-4 sm:p-5 text-left hover:bg-app-elevated/50 transition-colors"
            >
              <span className="flex-shrink-0 w-8 h-8 rounded-lg bg-app-primary text-white text-sm font-semibold flex items-center justify-center">
                {index + 1}
              </span>
              <span className="flex-1 font-medium text-app-text pt-1 urdu-text leading-loose">
                {q.question}
                {q.fromUser && (
                  <span className="inline-flex items-center gap-1 ml-2 text-xs font-normal text-app-teal bg-app-teal/10 border border-app-teal/25 px-2 py-0.5 rounded-full">
                    <User className="w-3 h-3" />
                    User
                  </span>
                )}
              </span>
              {isOpen ? (
                <ChevronUp className="w-5 h-5 text-app-text-muted flex-shrink-0 mt-1" />
              ) : (
                <ChevronDown className="w-5 h-5 text-app-text-muted flex-shrink-0 mt-1" />
              )}
            </button>
            {isOpen && (q.answer || q.answerMediaFilename) && (
              <div className="px-4 sm:px-5 pb-4 sm:pb-5 pl-15 sm:pl-16">
                <div className="p-4 rounded-lg bg-app-surface border border-app-border">
                  <p className="text-sm font-semibold mb-2 urdu-text text-app-primary">جواب:</p>
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
