"use client";

import SegmentError from "@/components/SegmentError";

// §W38 — page crash par saaf paigham + dobara load (components/SegmentError).
export default function SegmentErrorPage({ error }: { error: Error & { digest?: string } }) {
  return <SegmentError error={error} />;
}
