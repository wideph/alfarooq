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
    <div className="space-y-4">
      {hasText && (
        <p className="text-slate-300 leading-loose whitespace-pre-wrap urdu-text">{answer}</p>
      )}
      {hasMedia && mediaType === "pdf" && (
        <div className="rounded-xl overflow-hidden border border-slate-700/50">
          <PdfViewer filename={mediaFilename!} title="Answer PDF" compact />
        </div>
      )}
      {hasMedia && mediaType === "image" && (
        <div className="rounded-xl overflow-hidden border border-emerald-900/40">
          <ImageViewer filename={mediaFilename!} title="Answer Image" compact />
        </div>
      )}
    </div>
  );
}
