"use client";

import type { PageTheme } from "@/lib/theme";

interface SubmitQuestionModalProps {
  open: boolean;
  onClose: () => void;
  theme?: PageTheme;
}

const styles = {
  home: {
    bar: "from-violet-500 via-indigo-500 to-blue-500",
    icon: "from-violet-500/20 to-indigo-500/20 text-violet-300",
    shell: "bg-slate-900 border-violet-800/50",
    title: "text-slate-100",
    body: "text-slate-300",
    button: "from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500",
  },
  course: {
    bar: "from-emerald-500 via-teal-500 to-cyan-500",
    icon: "from-emerald-500/20 to-teal-500/20 text-emerald-300",
    shell: "bg-[#0a100e] border-emerald-800/50",
    title: "text-emerald-50",
    body: "text-slate-300",
    button: "from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500",
  },
} as const;

export default function SubmitQuestionModal({
  open,
  onClose,
  theme = "home",
}: SubmitQuestionModalProps) {
  if (!open) return null;

  const t = styles[theme];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className={`relative w-full max-w-sm rounded-xl shadow-2xl border overflow-hidden ${t.shell}`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`h-1 bg-gradient-to-r ${t.bar}`} />
        <div className="p-4 sm:p-5 text-center urdu-text">
          <div
            className={`w-11 h-11 mx-auto mb-3 rounded-full bg-gradient-to-br flex items-center justify-center text-xl ${t.icon}`}
          >
            ✓
          </div>
          <h3 className={`text-base sm:text-lg font-bold mb-3 ${t.title}`}>
            آپ کا سوال موصول ہو گیا
          </h3>
          <p className={`leading-relaxed text-sm ${t.body}`}>
            آپ کا سوال ایڈمن کے پاس چلا گیا ہے۔ اگر آپ جلد از جلد اپنے سوال کا جواب
            چاہتے ہیں تو براہِ مہربانی واٹس ایپ پر رابطہ کریں جس واٹس ایپ سے آپ
            اس لنک پر آئے تھے۔
          </p>
          <p className={`leading-relaxed text-sm mt-3 ${t.body}`}>
            مزید یہ کہ اگر آپ کے سوال کا جواب اوپر دیے ہوئے سوالوں میں موجود نہ ہوا
            تو ایڈمن آپ کے سوال کا جواب دے گا اور وہ اسی سیکشن میں آپکو نظر آئے گا
            لیکن اس میں وقت لگ سکتا ہے۔
          </p>
          <button
            onClick={onClose}
            className={`mt-5 px-6 py-2 rounded-lg bg-gradient-to-r text-white text-sm font-semibold transition-all shadow-md ${t.button}`}
          >
            ٹھیک ہے
          </button>
        </div>
      </div>
    </div>
  );
}
