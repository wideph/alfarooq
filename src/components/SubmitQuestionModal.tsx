"use client";

interface SubmitQuestionModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SubmitQuestionModal({ open, onClose }: SubmitQuestionModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div
        className="relative w-full max-w-sm rounded-xl bg-white shadow-2xl border border-primary-100 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 bg-gradient-to-r from-primary-500 via-accent-500 to-emerald-500" />
        <div className="p-4 sm:p-5 text-center urdu-text">
          <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-gradient-to-br from-primary-100 to-accent-100 flex items-center justify-center text-xl">
            ✓
          </div>
          <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-3">
            آپ کا سوال موصول ہو گیا
          </h3>
          <p className="text-slate-700 leading-relaxed text-sm">
            آپ کا سوال ایڈمن کے پاس چلا گیا ہے۔ اگر آپ جلد از جلد اپنے سوال کا جواب
            چاہتے ہیں تو براہِ مہربانی واٹس ایپ پر رابطہ کریں جس واٹس ایپ سے آپ
            اس لنک پر آئے تھے۔
          </p>
          <p className="text-slate-600 leading-relaxed text-sm mt-3">
            مزید یہ کہ اگر آپ کے سوال کا جواب اوپر دیے ہوئے سوالوں میں موجود نہ ہوا
            تو ایڈمن آپ کے سوال کا جواب دے گا اور وہ اسی سیکشن میں آپکو نظر آئے گا
            لیکن اس میں وقت لگ سکتا ہے۔
          </p>
          <button
            onClick={onClose}
            className="mt-5 px-6 py-2 rounded-lg bg-gradient-to-r from-primary-600 to-accent-600 text-white text-sm font-semibold hover:from-primary-700 hover:to-accent-700 transition-all shadow-md"
          >
            ٹھیک ہے
          </button>
        </div>
      </div>
    </div>
  );
}
