"use client";

import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { Check, Crop, FileText, Loader2, RotateCw, Send, Undo2, X } from "lucide-react";
import { uploadCaseFiles, validateCaseFiles, type UploadResult } from "@/lib/office/upload-files";
import type { ToastKind } from "@/components/Toast";

// §W48 — courier queue se hi slip upload (detail page par jaye baghair),
// WhatsApp jaisa: tasveer chunte hi preview khulta hai, crop / rotate, phir
// upload. Kai slips chuni ja sakti hain magar EK upload mein sirf ek jati hai —
// izafi preview mein delete karna lazmi; doosri slip ke liye dobara upload.

export type SlipCase = {
  id: string;
  caseNumber: string;
  clientName?: string | null;
  rollNumber: string | null;
  registrationNumber: string | null;
};

// Crop rect — (rotated) tasveer ke hisse (0..1).
type Rect = { x: number; y: number; w: number; h: number };
type DragMode = "move" | "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

type Slip = {
  key: string;
  file: File;
  isImage: boolean;
  rotation: number;
  crop: Rect;
  // rotation lagi hui poori tasveer (crop mode mein) aur rotation + crop wali
  // (normal preview).
  baseUrl: string | null;
  previewUrl: string | null;
};

const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
const MIN_SIDE = 0.08;
// Preview halki (tez), upload wali saaf parhne layak.
const PREVIEW_MAX_SIDE = 1600;
const UPLOAD_MAX_SIDE = 2400;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const isFull = (rect: Rect) => rect.x === 0 && rect.y === 0 && rect.w === 1 && rect.h === 1;

function applyDrag(mode: DragMode, start: Rect, dx: number, dy: number): Rect {
  if (mode === "move") {
    return { ...start, x: clamp(start.x + dx, 0, 1 - start.w), y: clamp(start.y + dy, 0, 1 - start.h) };
  }
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;
  if (mode.includes("w")) left = clamp(left + dx, 0, right - MIN_SIDE);
  if (mode.includes("e")) right = clamp(right + dx, left + MIN_SIDE, 1);
  if (mode.includes("n")) top = clamp(top + dy, 0, bottom - MIN_SIDE);
  if (mode.includes("s")) bottom = clamp(bottom + dy, top + MIN_SIDE, 1);
  return { x: left, y: top, w: right - left, h: bottom - top };
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Tasveer khul nahi saki"));
    image.src = src;
  });
}

// File → (rotation + crop) → JPEG blob, lambi taraf maxSide tak.
async function renderSlip(file: File, rotation: number, crop: Rect, maxSide: number): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImage(url);
    const turned = rotation % 180 !== 0;
    const fullW = turned ? image.naturalHeight : image.naturalWidth;
    const fullH = turned ? image.naturalWidth : image.naturalHeight;
    const rotated = document.createElement("canvas");
    rotated.width = fullW;
    rotated.height = fullH;
    const rctx = rotated.getContext("2d");
    if (!rctx) throw new Error("Canvas nahi bana");
    rctx.translate(fullW / 2, fullH / 2);
    rctx.rotate((rotation * Math.PI) / 180);
    rctx.drawImage(image, -image.naturalWidth / 2, -image.naturalHeight / 2);

    const sx = Math.round(crop.x * fullW);
    const sy = Math.round(crop.y * fullH);
    const sw = Math.max(1, Math.round(crop.w * fullW));
    const sh = Math.max(1, Math.round(crop.h * fullH));
    const scale = Math.min(1, maxSide / Math.max(sw, sh));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(sw * scale));
    out.height = Math.max(1, Math.round(sh * scale));
    const octx = out.getContext("2d");
    if (!octx) throw new Error("Canvas nahi bana");
    octx.fillStyle = "#ffffff";
    octx.fillRect(0, 0, out.width, out.height);
    octx.drawImage(rotated, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const blob = await new Promise<Blob | null>((resolve) => out.toBlob(resolve, "image/jpeg", 0.9));
    if (!blob) throw new Error("Tasveer tayyar nahi ho saki");
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function slipFileName(file: File) {
  const base = file.name.replace(/\.[^./\\]+$/, "") || "slip";
  return `${base}.jpg`;
}

export default function CourierSlipUploader({
  item,
  files,
  onClose,
  onUploaded,
  onMessage,
}: {
  item: SlipCase;
  files: File[];
  onClose: () => void;
  onUploaded: (result: UploadResult) => void;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const [slips, setSlips] = useState<Slip[]>(() =>
    files.map((file, index) => {
      const isImage = file.type.startsWith("image/");
      const url = isImage ? URL.createObjectURL(file) : null;
      return {
        key: `${index}-${file.name}-${file.size}-${file.lastModified}`,
        file,
        isImage,
        rotation: 0,
        crop: FULL,
        baseUrl: url,
        previewUrl: url,
      };
    })
  );
  const [active, setActive] = useState(0);
  const [cropping, setCropping] = useState(false);
  const [draft, setDraft] = useState<Rect>(FULL);
  const [working, setWorking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const drag = useRef<{ mode: DragMode; startX: number; startY: number; start: Rect } | null>(null);

  // Band hone par saare object URLs azad.
  const slipsRef = useRef(slips);
  useEffect(() => {
    slipsRef.current = slips;
  }, [slips]);
  useEffect(
    () => () => {
      for (const slip of slipsRef.current) {
        if (slip.baseUrl) URL.revokeObjectURL(slip.baseUrl);
        if (slip.previewUrl && slip.previewUrl !== slip.baseUrl) URL.revokeObjectURL(slip.previewUrl);
      }
    },
    []
  );

  const current = slips[Math.min(active, slips.length - 1)];
  const oneLeft = slips.length === 1;

  function replaceSlip(key: string, next: Partial<Slip>) {
    setSlips((prev) =>
      prev.map((slip) => {
        if (slip.key !== key) return slip;
        if (next.previewUrl !== undefined && slip.previewUrl && slip.previewUrl !== slip.baseUrl && slip.previewUrl !== next.previewUrl) {
          URL.revokeObjectURL(slip.previewUrl);
        }
        if (next.baseUrl !== undefined && slip.baseUrl && slip.baseUrl !== next.baseUrl) URL.revokeObjectURL(slip.baseUrl);
        return { ...slip, ...next };
      })
    );
  }

  function removeSlip(key: string) {
    const target = slips.find((slip) => slip.key === key);
    if (!target) return;
    if (target.baseUrl) URL.revokeObjectURL(target.baseUrl);
    if (target.previewUrl && target.previewUrl !== target.baseUrl) URL.revokeObjectURL(target.previewUrl);
    const next = slips.filter((slip) => slip.key !== key);
    if (next.length === 0) {
      onClose();
      return;
    }
    setSlips(next);
    setActive((index) => Math.min(index, next.length - 1));
    setCropping(false);
  }

  async function rotate() {
    if (!current?.isImage || working) return;
    setWorking(true);
    try {
      const rotation = (current.rotation + 90) % 360;
      const base = rotation === 0 ? URL.createObjectURL(current.file) : URL.createObjectURL(await renderSlip(current.file, rotation, FULL, PREVIEW_MAX_SIDE));
      replaceSlip(current.key, { rotation, crop: FULL, baseUrl: base, previewUrl: base });
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Rotate nahi ho saka", "error");
    } finally {
      setWorking(false);
    }
  }

  function startCrop() {
    if (!current?.isImage) return;
    setDraft(current.crop);
    setCropping(true);
  }

  async function applyCrop() {
    if (!current) return;
    if (isFull(draft)) {
      replaceSlip(current.key, { crop: FULL, previewUrl: current.baseUrl });
      setCropping(false);
      return;
    }
    setWorking(true);
    try {
      const blob = await renderSlip(current.file, current.rotation, draft, PREVIEW_MAX_SIDE);
      replaceSlip(current.key, { crop: draft, previewUrl: URL.createObjectURL(blob) });
      setCropping(false);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Crop nahi ho saka", "error");
    } finally {
      setWorking(false);
    }
  }

  function startDrag(mode: DragMode) {
    return (event: ReactPointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { mode, startX: event.clientX, startY: event.clientY, start: draft };
    };
  }

  function onDragMove(event: ReactPointerEvent<HTMLDivElement>) {
    const state = drag.current;
    const box = wrapRef.current?.getBoundingClientRect();
    if (!state || !box || box.width === 0 || box.height === 0) return;
    setDraft(applyDrag(state.mode, state.start, (event.clientX - state.startX) / box.width, (event.clientY - state.startY) / box.height));
  }

  function endDrag() {
    drag.current = null;
  }

  async function upload() {
    if (!oneLeft || !current || busy || cropping) return;
    setBusy(true);
    setProgress(0);
    try {
      let file = current.file;
      if (current.isImage && (current.rotation !== 0 || !isFull(current.crop))) {
        const blob = await renderSlip(current.file, current.rotation, current.crop, UPLOAD_MAX_SIDE);
        file = new File([blob], slipFileName(current.file), { type: "image/jpeg", lastModified: Date.now() });
      }
      const invalid = validateCaseFiles([file]);
      if (invalid) {
        onMessage(invalid, "error");
        return;
      }
      const result = await uploadCaseFiles({
        caseId: item.id,
        department: "COURIER",
        files: [file],
        onProgress: (items) => {
          const state = items[0];
          if (state) setProgress(state.size > 0 ? Math.min(1, state.loaded / state.size) : 0);
        },
      });
      if (result.saved > 0) {
        onMessage(
          result.status === "DELIVERED" ? `Slip upload ho gayi — ${item.caseNumber} Delivered` : "Slip upload ho gayi",
          "success"
        );
        onUploaded(result);
      } else {
        onMessage(result.error || "Slip upload nahi ho saki", "error");
      }
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Slip upload nahi ho saki", "error");
    } finally {
      setBusy(false);
    }
  }

  if (!current) return null;

  const identity = [
    item.clientName || null,
    item.rollNumber ? `Roll ${item.rollNumber}` : null,
    item.registrationNumber ? `Reg ${item.registrationNumber}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const handles: Array<{ mode: DragMode; className: string }> = [
    { mode: "nw", className: "-left-1.5 -top-1.5 cursor-nwse-resize" },
    { mode: "ne", className: "-right-1.5 -top-1.5 cursor-nesw-resize" },
    { mode: "sw", className: "-bottom-1.5 -left-1.5 cursor-nesw-resize" },
    { mode: "se", className: "-bottom-1.5 -right-1.5 cursor-nwse-resize" },
    { mode: "n", className: "left-1/2 -top-1.5 -translate-x-1/2 cursor-ns-resize" },
    { mode: "s", className: "left-1/2 -bottom-1.5 -translate-x-1/2 cursor-ns-resize" },
    { mode: "w", className: "-left-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize" },
    { mode: "e", className: "-right-1.5 top-1/2 -translate-y-1/2 cursor-ew-resize" },
  ];

  const toolButton =
    "inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/10 px-3 py-2 text-sm font-semibold text-white hover:bg-white/20 disabled:opacity-40";

  return (
    <div role="dialog" aria-label="Courier slip preview" className="fixed inset-0 z-[95] flex flex-col bg-slate-950 text-white">
      {/* Upar: band, case pehchan, tools */}
      <div className="flex items-center gap-2 border-b border-white/10 px-3 py-2.5 sm:px-5">
        <button
          type="button"
          onClick={onClose}
          disabled={busy}
          aria-label="Band karein"
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full hover:bg-white/10 disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">Courier slip · {item.caseNumber}</p>
          {identity && <p className="truncate text-xs text-white/60">{identity}</p>}
        </div>
        {current.isImage &&
          (cropping ? (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={() => setDraft(FULL)} disabled={working} className={toolButton}>
                <Undo2 className="h-4 w-4" /> <span className="hidden sm:inline">Reset</span>
              </button>
              <button type="button" onClick={() => setCropping(false)} disabled={working} className={toolButton}>
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void applyCrop()}
                disabled={working}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-emerald-500 px-3.5 py-2 text-sm font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
              >
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Done
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <button type="button" onClick={startCrop} disabled={busy || working} className={toolButton} aria-label="Crop karein">
                <Crop className="h-4 w-4" /> <span className="hidden sm:inline">Crop</span>
              </button>
              <button type="button" onClick={() => void rotate()} disabled={busy || working} className={toolButton} aria-label="Ghumayein">
                {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                <span className="hidden sm:inline">Rotate</span>
              </button>
            </div>
          ))}
      </div>

      {/* Beech: tasveer (crop mode mein frame ke saath) */}
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 sm:p-6">
        {!current.isImage ? (
          <div className="flex max-w-sm flex-col items-center gap-3 rounded-2xl bg-white/5 p-8 text-center">
            <FileText className="h-14 w-14 text-white/70" />
            <p className="break-all text-sm font-semibold">{current.file.name}</p>
            <p className="text-xs text-white/50">PDF slip — crop sirf tasveer par hota hai</p>
          </div>
        ) : cropping ? (
          <div
            ref={wrapRef}
            className="relative inline-block max-h-full select-none overflow-hidden"
            onPointerMove={onDragMove}
            onPointerUp={endDrag}
            onPointerCancel={endDrag}
          >
            {current.baseUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={current.baseUrl} alt="Slip" draggable={false} className="block max-h-[calc(100vh-15rem)] max-w-full" />
            )}
            <div
              role="presentation"
              onPointerDown={startDrag("move")}
              className="absolute cursor-move touch-none border-2 border-white"
              style={{
                left: `${draft.x * 100}%`,
                top: `${draft.y * 100}%`,
                width: `${draft.w * 100}%`,
                height: `${draft.h * 100}%`,
                boxShadow: "0 0 0 9999px rgba(2, 6, 23, 0.6)",
              }}
            >
              {/* teen hisson ki lakeerein — seedha crop karna aasan */}
              <span className="pointer-events-none absolute inset-y-0 left-1/3 w-px bg-white/40" />
              <span className="pointer-events-none absolute inset-y-0 left-2/3 w-px bg-white/40" />
              <span className="pointer-events-none absolute inset-x-0 top-1/3 h-px bg-white/40" />
              <span className="pointer-events-none absolute inset-x-0 top-2/3 h-px bg-white/40" />
              {handles.map((handle) => (
                <span
                  key={handle.mode}
                  role="presentation"
                  aria-label={`crop-${handle.mode}`}
                  onPointerDown={startDrag(handle.mode)}
                  className={`absolute h-5 w-5 touch-none rounded-sm border-2 border-slate-900 bg-white shadow ${handle.className}`}
                />
              ))}
            </div>
          </div>
        ) : (
          current.previewUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.previewUrl}
              alt="Slip preview"
              className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
            />
          )
        )}
      </div>

      {/* Neeche: chuni hui slips (delete), hidayat, upload */}
      <div className="space-y-2 border-t border-white/10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 sm:px-5">
        {!oneLeft && (
          <p className="rounded-xl bg-amber-500/15 px-3 py-2 text-xs font-semibold text-amber-200">
            Aik dafa mein sirf aik slip upload hoti hai — {slips.length} chuni hain. Izafi slips (X) se delete karein;
            doosri slip ke liye upload dobara karein.
          </p>
        )}
        <div className="flex items-end gap-3">
          {/* pt / pr: delete (X) badge strip ke clip se na kate */}
          <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1 pr-2 pt-2">
            {slips.map((slip, index) => (
              <div key={slip.key} className="relative shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setActive(index);
                    setCropping(false);
                  }}
                  disabled={busy}
                  aria-label={`Slip ${index + 1} dekhein`}
                  className={`block h-16 w-16 overflow-hidden rounded-xl border-2 ${
                    index === active ? "border-emerald-400" : "border-white/20"
                  }`}
                >
                  {slip.isImage && slip.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={slip.previewUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <span className="grid h-full w-full place-items-center bg-white/10">
                      <FileText className="h-6 w-6" />
                    </span>
                  )}
                </button>
                {!busy && (
                  <button
                    type="button"
                    onClick={() => removeSlip(slip.key)}
                    aria-label={`Slip ${index + 1} delete karein`}
                    className="absolute -right-1.5 -top-1.5 grid h-6 w-6 place-items-center rounded-full bg-red-600 text-white shadow ring-2 ring-slate-950"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => void upload()}
            disabled={!oneLeft || busy || cropping || working}
            aria-label="Slip upload karein"
            className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-emerald-500 text-white shadow-lg hover:bg-emerald-600 disabled:bg-white/15 disabled:text-white/40"
          >
            {busy ? <Loader2 className="h-6 w-6 animate-spin" /> : <Send className="h-6 w-6" />}
          </button>
        </div>
        {busy && (
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-emerald-400 transition-all" style={{ width: `${Math.max(5, progress * 100)}%` }} />
          </div>
        )}
        <p className="text-[11px] text-white/45">
          {cropping
            ? "Frame ke kone / kinare kheench kar slip ka hissa chunein, phir Done."
            : "Crop / Rotate se slip theek karein, phir hara button. Slip ke baad case Delivered ho jata hai."}
        </p>
      </div>
    </div>
  );
}
