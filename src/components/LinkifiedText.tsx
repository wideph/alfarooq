import { Fragment, type ReactNode } from "react";

const LINK_REGEX =
  /\[([^\]]+)\]\(([^)]+)\)|((?:https?:\/\/|www\.)[^\s<]+|\/courses\/[^\s<]+|(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/[^\s<]*)?)/gi;

const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

function normalizeLink(raw: string) {
  const trailing = raw.match(TRAILING_PUNCTUATION)?.[0] || "";
  const clean = trailing ? raw.slice(0, -trailing.length) : raw;
  const href =
    clean.startsWith("http") || clean.startsWith("/courses/")
      ? clean
      : `https://${clean}`;

  return { label: clean, href, trailing };
}

export default function LinkifiedText({
  text,
  className = "font-semibold text-primary-700 underline underline-offset-2",
}: {
  text: string;
  className?: string;
}) {
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  LINK_REGEX.lastIndex = 0;
  while ((match = LINK_REGEX.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));

    const markdownLabel = match[1];
    const markdownHref = match[2];
    const raw = match[3] || markdownHref;
    const { label, href, trailing } = normalizeLink(raw);
    const displayLabel = markdownLabel || label;
    const external = href.startsWith("http");

    nodes.push(
      <Fragment key={`${href}-${match.index}`}>
        <a
          href={href}
          className={className}
          target={external ? "_blank" : undefined}
          rel={external ? "noopener noreferrer" : undefined}
        >
          {displayLabel}
        </a>
        {trailing}
      </Fragment>
    );

    lastIndex = LINK_REGEX.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return <>{nodes}</>;
}
