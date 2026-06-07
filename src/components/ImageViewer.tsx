"use client";

import { useState } from "react";
import { ZoomIn, ZoomOut, RotateCcw } from "lucide-react";

interface ImageViewerProps {
  filename: string;
  title: string;
  compact?: boolean;
}

export default function ImageViewer({ filename, title, compact = false }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const maxHeight = compact ? "max-h-[40vh]" : "max-h-[70vh] sm:max-h-[75vh]";

  const handleContextMenu = (e: React.MouseEvent) => e.preventDefault();

  return (
    <div
      className="no-select no-download rounded-2xl overflow-hidden border border-slate-200 bg-white shadow-xl"
      onContextMenu={handleContextMenu}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 bg-gradient-to-r from-slate-50 to-slate-100 border-b border-slate-200">
        <p className="text-sm font-medium text-slate-700 truncate flex-1">{title}</p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
            className="p-2 rounded-lg hover:bg-slate-200 transition-colors text-slate-600"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="text-xs px-2 min-w-[3rem] text-center text-slate-500">
            {Math.round(scale * 100)}%
          </span>
          <button
            onClick={() => setScale((s) => Math.min(3, s + 0.25))}
            className="p-2 rounded-lg hover:bg-slate-200 transition-colors text-slate-600"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setScale(1)}
            className="p-2 rounded-lg hover:bg-slate-200 transition-colors text-slate-600"
            aria-label="Reset zoom"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        className={`overflow-auto ${maxHeight} flex justify-center p-4 bg-slate-50`}
        onContextMenu={handleContextMenu}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/api/media/${encodeURIComponent(filename)}`}
          alt={title}
          draggable={false}
          onContextMenu={handleContextMenu}
          style={{ transform: `scale(${scale})`, transformOrigin: "center top" }}
          className="max-w-full h-auto rounded-lg shadow-md transition-transform duration-200"
        />
      </div>
    </div>
  );
}
