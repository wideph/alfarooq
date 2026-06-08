"use client";

import { useEffect } from "react";
import { getPdfJs } from "@/lib/pdfjs";

export default function PreloadAssets({ logoUrl }: { logoUrl?: string | null }) {
  useEffect(() => {
    void getPdfJs();

    if (logoUrl) {
      const img = new Image();
      img.src = logoUrl;
    }
  }, [logoUrl]);

  return null;
}
