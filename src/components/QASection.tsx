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
            id={`qa-${q.id}`}
            className={`group/qa animate-fade-in-up relative overflow-hidden rounded-2xl ring-1 transition-all duration-300 hover:-translate-y-0.5 ${
              isCourse
                ? "ring-violet-200/60 bg-white/85 backdrop-blur-sm shadow-md shadow-violet-100/40 hover:ring-violet-300 hover:shadow-xl hover:shadow-violet-200/40"
                : "ring-slate-200 bg-white/90 backdrop-blur-sm shadow-md shadow-slate-200/40 hover:ring-primary-200 hover:shadow-xl hover:shadow-primary-100/50"
            }`}
            style={{ animationDelay: `${index * 60}ms` }}
          >
            {/* left gradient accent */}
            <span
              className={`absolute left-0 top-0 bottom-0 w-1 ${
                q.fromUser
                  ? "bg-gradient-to-b from-emerald-400 to-teal-500"
                  : isCourse
                    ? "bg-gradient-to-b from-violet-500 to-indigo-500"
                    : "bg-gradient-to-b from-primary-500 to-accent-500"
              }`}
            />
            <button
              onClick={() => toggleOne(q.id)}
              className={`w-full flex items-start gap-2.5 sm:gap-3 p-3.5 sm:p-5 pl-4 sm:pl-6 text-left transition-colors min-w-0 ${
                isCourse ? "hover:bg-violet-50/50" : "hover:bg-slate-50/70"
              }`}
            >
              <span
                className={`shrink-0 w-7 h-7 sm:w-9 sm:h-9 rounded-xl text-white text-xs sm:text-sm font-bold flex items-center justify-center ring-2 ring-white shadow-lg ${
                  q.fromUser
                    ? "bg-gradient-to-br from-emerald-500 to-teal-600 shadow-emerald-500/30"
                    : isCourse
                      ? "bg-gradient-to-br from-violet-500 to-indigo-600 shadow-violet-500/30"
                      : "bg-gradient-to-br from-primary-500 to-accent-500 shadow-primary-500/30"
                }`}
              >
                {index + 1}
              </span>
              <span className="flex-1 min-w-0 block font-medium text-slate-800 pt-0.5 urdu-text leading-loose break-words [overflow-wrap:anywhere] text-sm sm:text-base">
                {q.question}
                {q.fromUser && (
                  <span className="inline-flex items-center gap-1 ml-1.5 mt-1 text-[10px] sm:text-xs font-normal text-accent-600 bg-accent-50 px-2 py-0.5 rounded-full whitespace-nowrap">
                    <User className="w-3 h-3" />
                    User
                  </span>
                )}
              </span>
              <span
                className={`shrink-0 mt-0.5 grid place-items-center w-7 h-7 rounded-full transition-all ${
                  isCourse
                    ? "bg-violet-50 text-violet-500 group-hover/qa:bg-violet-100"
                    : "bg-slate-100 text-slate-500 group-hover/qa:bg-primary-100 group-hover/qa:text-primary-600"
                }`}
              >
                {isOpen ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </span>
            </button>
            {isOpen && (q.answer || q.answerMediaFilename) && (
              <div className="border-t border-slate-100/80 px-3.5 sm:px-5 pl-4 sm:pl-6 pb-3.5 sm:pb-5 pt-3 min-w-0">
                <div
                  className={`p-3.5 sm:p-4 rounded-xl border min-w-0 shadow-sm ${
                    q.fromUser
                      ? "bg-gradient-to-br from-emerald-50 to-teal-50/70 border-emerald-200 shadow-emerald-100/40"
                      : isCourse
                        ? "bg-gradient-to-br from-violet-50 to-indigo-50/70 border-violet-100 shadow-violet-100/40"
                        : "bg-gradient-to-br from-primary-50 to-accent-50/70 border-primary-100 shadow-primary-100/40"
                  }`}
                >
                  <p
                    className={`inline-flex items-center gap-1.5 text-sm font-bold mb-2 urdu-text ${
                      q.fromUser
                        ? "text-emerald-700"
                        : isCourse
                          ? "text-violet-700"
                          : "text-primary-700"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        q.fromUser
                          ? "bg-emerald-500"
                          : isCourse
                            ? "bg-violet-500"
                            : "bg-primary-500"
                      }`}
                    />
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
