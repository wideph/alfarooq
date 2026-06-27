"use client";

import { useEffect } from "react";

export default function PreloadAssets({ logoUrl }: { logoUrl?: string | null }) {
  useEffect(() => {
    if (logoUrl) {
      const img = new Image();
      img.src = logoUrl;
    }
  }, [logoUrl]);

  return null;
}
