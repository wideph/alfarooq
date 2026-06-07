"use client";

interface SubmitQuestionModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SubmitQuestionModal({ open, onClose }: SubmitQuestionModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
      <div
        className="relative w-full max-w-sm rounded-xl surface-elevated shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1 bg-gradient-to-r from-app-primary via-app-teal to-app-highlight" />
        <div className="p-4 sm:p-5 text-center urdu-text">
          <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-app-success/15 border border-app-success/30 flex items-center justify-center text-xl text-app-success">
            ✓
          </div>
          <h3 className="text-base sm:text-lg font-semibold text-app-text mb-3">
            آپ کا سوال موصول ہو گیا
          </h3>
          <p className="text-app-text-secondary leading-relaxed text-sm">
            آپ کا سوال ایڈمن کے پاس چلا گیا ہے۔ اگر آپ جلد از جلد اپنے سوال کا جواب
            چاہتے ہیں تو براہِ مہربانی واٹس ایپ پر رابطہ کریں جس واٹس ایپ سے آپ
            اس لنک پر آئے تھے۔
          </p>
          <p className="text-app-text-muted leading-relaxed text-sm mt-3">
            مزید یہ کہ اگر آپ کے سوال کا جواب اوپر دیے ہوئے سوالوں میں موجود نہ ہوا
            تو ایڈمن آپ کے سوال کا جواب دے گا اور وہ اسی سیکشن میں آپکو نظر آئے گا
            لیکن اس میں وقت لگ سکتا ہے۔
          </p>
          <button onClick={onClose} className="btn-primary mt-5">
            ٹھیک ہے
          </button>
        </div>
      </div>
    </div>
  );
}
