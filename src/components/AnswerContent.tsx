"use client";

import PdfViewer from "@/components/PdfViewer";
import ImageViewer from "@/components/ImageViewer";

interface AnswerContentProps {
  answer: string;
  mediaFilename?: string | null;
  mediaType?: string | null;
}

export default function AnswerContent({
  answer,
  mediaFilename,
  mediaType,
}: AnswerContentProps) {
  const hasText = Boolean(answer?.trim());
  const hasMedia = Boolean(mediaFilename && mediaType);

  if (!hasText && !hasMedia) return null;

  return (
    <div className="min-w-0 w-full max-w-full overflow-hidden">
      {hasText && (
        <p className="text-slate-700 leading-relaxed whitespace-pre-wrap break-words [overflow-wrap:anywhere] urdu-text text-sm sm:text-base">
          {answer}
        </p>
      )}
      {hasMedia && mediaType === "pdf" && (
        <div className="mt-3 w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-slate-200">
          <PdfViewer filename={mediaFilename!} title="Answer PDF" compact />
        </div>
      )}
      {hasMedia && mediaType === "image" && (
        <div className="mt-3 w-full max-w-full min-w-0 overflow-hidden rounded-xl border border-slate-200">
          <ImageViewer filename={mediaFilename!} title="Answer Image" compact />
        </div>
      )}
    </div>
  );
}
