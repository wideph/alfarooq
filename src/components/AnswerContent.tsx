"use client";

import { Fragment, type ReactNode } from "react";
import PdfViewer from "@/components/PdfViewer";
import ImageViewer from "@/components/ImageViewer";

interface AnswerContentProps {
  answer: string;
  mediaFilename?: string | null;
  mediaType?: string | null;
}

// URLs (http/https/www) ko text ke andar dhoond kar clickable link bana deta hai
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]}'"])/gi;

function linkify(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  URL_REGEX.lastIndex = 0;
  while ((match = URL_REGEX.exec(text)) !== null) {
    const raw = match[0];
    const start = match.index;

    if (start > lastIndex) {
      nodes.push(text.slice(lastIndex, start));
    }

    const href = raw.startsWith("http") ? raw : `https://${raw}`;
    nodes.push(
      <a
        key={`${start}-${raw}`}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-primary-600 font-medium underline decoration-primary-300 underline-offset-2 hover:text-primary-700 break-all"
      >
        {raw}
      </a>
    );

    lastIndex = start + raw.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.map((node, i) => <Fragment key={i}>{node}</Fragment>);
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
        <p className="text-slate-700 leading-loose whitespace-pre-wrap break-words [overflow-wrap:anywhere] urdu-text text-sm sm:text-base">
          {linkify(answer)}
        </p>
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
