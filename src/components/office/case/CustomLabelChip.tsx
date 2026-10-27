"use client";

import { Tag } from "lucide-react";
import { CUSTOM_LABEL_STYLES } from "@/lib/office/labels";

// §W44 — admin ka custom label (case page + cases list + department queues par
// saaf nazar aane wala rangin chip). Label na ho to kuch nahi.
export default function CustomLabelChip({
  label,
  color,
  size = "sm",
}: {
  label: string | null | undefined;
  color?: string | null;
  size?: "sm" | "md";
}) {
  if (!label) return null;
  const style = CUSTOM_LABEL_STYLES[color || ""] || CUSTOM_LABEL_STYLES.amber;
  return (
    <span
      title="Admin label"
      className={`inline-flex items-center gap-1 rounded-full font-bold ${style} ${
        size === "md" ? "px-2.5 py-0.5 text-xs" : "px-2 py-0.5 text-[10px]"
      }`}
    >
      <Tag className={size === "md" ? "h-3.5 w-3.5" : "h-3 w-3"} />
      {label}
    </span>
  );
}
