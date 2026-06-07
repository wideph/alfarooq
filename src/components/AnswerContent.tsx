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
        <p className="text-app-text-secondary leading-loose whitespace-pre-wrap urdu-text">{answer}</p>
      )}
      {hasMedia && mediaType === "pdf" && (
        <div className="rounded-xl overflow-hidden border border-app-border">
          <PdfViewer filename={mediaFilename!} title="Answer PDF" compact />
        </div>
      )}
      {hasMedia && mediaType === "image" && (
        <div className="rounded-xl overflow-hidden border border-app-border">
          <ImageViewer filename={mediaFilename!} title="Answer Image" compact />
        </div>
      )}
    </div>
  );
}
