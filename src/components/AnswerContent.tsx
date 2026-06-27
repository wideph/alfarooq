"use client";

import PdfViewer from "@/components/PdfViewer";
import ImageViewer from "@/components/ImageViewer";
import LinkifiedText from "@/components/LinkifiedText";

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
    <div className="min-w-0 w-full max-w-full">
      {hasText && (
        <div className="scroll-field rounded-lg">
          <p className="text-slate-700 leading-loose whitespace-pre-wrap break-words [overflow-wrap:anywhere] urdu-text text-sm sm:text-base">
            <LinkifiedText
              text={answer}
              className="text-primary-600 font-medium underline decoration-primary-300 underline-offset-2 hover:text-primary-700 break-all"
            />
          </p>
        </div>
      )}
      {hasMedia && mediaType === "pdf" && (
        <div className="mt-3 w-full max-w-full min-w-0 rounded-xl border border-slate-200">
          <PdfViewer filename={mediaFilename!} title="Answer PDF" compact />
        </div>
      )}
      {hasMedia && mediaType === "image" && (
        <div className="mt-3 w-full max-w-full min-w-0 rounded-xl border border-slate-200">
          <ImageViewer filename={mediaFilename!} title="Answer Image" compact />
        </div>
      )}
    </div>
  );
}
