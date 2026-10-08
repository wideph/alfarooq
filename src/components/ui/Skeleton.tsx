"use client";

// Skeleton placeholders while a section fetches.
export function SkeletonRows({ rows = 3, className = "" }: { rows?: number; className?: string }) {
  return (
    <div className={`animate-pulse space-y-2 ${className}`}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-11 rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}

export function SkeletonTiles({ tiles = 4, className = "" }: { tiles?: number; className?: string }) {
  return (
    <div className={`grid animate-pulse grid-cols-2 gap-3 md:grid-cols-4 ${className}`}>
      {Array.from({ length: tiles }, (_, i) => (
        <div key={i} className="h-16 rounded-xl bg-slate-100" />
      ))}
    </div>
  );
}
