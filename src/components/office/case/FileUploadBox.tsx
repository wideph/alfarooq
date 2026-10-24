"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, FileText, Film, ImageIcon, Loader2, Paperclip, Plus, Upload, X } from "lucide-react";
import type { ToastKind } from "@/components/Toast";
import { inputClass, primaryBtnClass } from "@/lib/office/types";
import {
  CASE_FILES_MAX_COUNT,
  formatFileSize,
  isVideoFile,
  uploadCaseFiles,
  validateCaseFiles,
  type UploadItemState,
  type UploadResult,
} from "@/lib/office/upload-files";

// §W26 — department files ka shared upload box (CaseFilesTab, DeptCaseView,
// DeptQueue modal). Kai files ek sath chunein (ya baad mein "aur add" karein),
// har file ki progress dikhe, fail files list mein retry ke liye reh jayen.
// Busy state hamesha `finally` mein release hota hai — upload fail ho kar
// page/button kabhi atakta nahi.

export type UploadDepartment = "FILING" | "PRINTING" | "ATTESTATION" | "COURIER";

type Props = {
  caseId: string;
  department: UploadDepartment;
  accept: string;
  hint?: string;
  stepOptions?: Array<{ stepKey: string; label: string }>;
  // Fixed stepKey (FINAL / VERIFICATION_STICKER) — step select nahi dikhta.
  fixedStepKey?: string;
  // Fixed title (sticker) — title input nahi dikhta.
  fixedTitle?: string;
  buttonLabel?: string;
  tone?: "default" | "final";
  // §W30: final tone ki heading (default: "Final file (lazmi) …").
  finalHeading?: string;
  // Tang jagah (modal) — controls hamesha ek ke neeche ek.
  stacked?: boolean;
  onUploaded: (result: UploadResult) => void | Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
  onBusyChange?: (busy: boolean) => void;
};

function fileKey(file: File) {
  return `${file.name}:${file.size}:${file.lastModified}`;
}

function FileIcon({ file }: { file: File }) {
  if (isVideoFile(file)) return <Film className="h-4 w-4 shrink-0 text-violet-500" />;
  if (file.type.startsWith("image/")) return <ImageIcon className="h-4 w-4 shrink-0 text-sky-500" />;
  return <FileText className="h-4 w-4 shrink-0 text-slate-400" />;
}

export default function FileUploadBox({
  caseId,
  department,
  accept,
  hint,
  stepOptions = [],
  fixedStepKey,
  fixedTitle,
  buttonLabel = "Upload",
  tone = "default",
  finalHeading = "Final file (lazmi) — attestation complete karne ke liye zaroori",
  stacked = false,
  onUploaded,
  onMessage,
  onBusyChange,
}: Props) {
  const [files, setFiles] = useState<File[]>([]);
  // Progress file ki pehchan (name+size+lastModified) se — partial failure ke
  // baad list sirf fail files ki reh jati hai, index par bharosa nahi.
  const [progress, setProgress] = useState<Record<string, UploadItemState>>({});
  const [title, setTitle] = useState("");
  const [stepKey, setStepKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Upload ke dauran tab band / reload karne se pehle warning (aadhi upload zaya na ho).
  useEffect(() => {
    if (!busy) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function addFiles(list: FileList | null) {
    if (!list || list.length === 0) return;
    const incoming = Array.from(list);
    setProgress({});
    setFiles((prev) => {
      const seen = new Set(prev.map(fileKey));
      const merged = [...prev];
      for (const file of incoming) {
        if (!seen.has(fileKey(file))) {
          merged.push(file);
          seen.add(fileKey(file));
        }
      }
      if (merged.length > CASE_FILES_MAX_COUNT) {
        onMessage(`Ek dafa mein zyada se zyada ${CASE_FILES_MAX_COUNT} files`, "error");
        return merged.slice(0, CASE_FILES_MAX_COUNT);
      }
      return merged;
    });
    // Same file dobara chunne par bhi onChange chale.
    if (inputRef.current) inputRef.current.value = "";
  }

  function removeFile(index: number) {
    setProgress({});
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function submit() {
    if (busy) return;
    const invalid = validateCaseFiles(files);
    if (invalid) {
      onMessage(invalid, "error");
      return;
    }
    const picked = files;
    setBusy(true);
    onBusyChange?.(true);
    let result: UploadResult | null = null;
    try {
      result = await uploadCaseFiles({
        caseId,
        department,
        stepKey: fixedStepKey ?? stepKey,
        title: fixedTitle ?? title,
        files: picked,
        onProgress: (items) =>
          setProgress(Object.fromEntries(items.map((item, i) => [fileKey(picked[i]), item]))),
      });
    } catch (error) {
      // uploadCaseFiles throw nahi karta — sirf hifazat.
      onMessage(error instanceof Error ? error.message : "File upload nahi ho saki", "error");
    } finally {
      setBusy(false);
      onBusyChange?.(false);
    }
    if (!result) return;

    if (result.saved > 0) {
      const savedText = result.saved === 1 ? "File upload ho gayi" : `${result.saved} files upload ho gayin`;
      onMessage(
        result.failed === 0 ? savedText : `${savedText} — ${result.error}`,
        result.failed === 0 ? "success" : "error"
      );
      // Sirf fail files list mein rahen (retry ke liye).
      const keep = new Set(result.failedIndexes);
      setFiles(picked.filter((_, i) => keep.has(i)));
      if (result.failed === 0) {
        setTitle("");
        setStepKey("");
        setProgress({});
      }
      try {
        await onUploaded(result);
      } catch {
        // reload fail ho to bhi upload ho chuki hai — UI atakna nahi chahiye.
      }
    } else {
      onMessage(result.error || "File upload nahi ho saki", "error");
    }
  }

  const final = tone === "final";
  const progressFor = (file: File): UploadItemState | null => progress[fileKey(file)] || null;

  return (
    <div
      className={`space-y-2 ${final ? "rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-3" : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        if (!busy) setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragging(false);
        if (!busy) addFiles(event.dataTransfer.files);
      }}
    >
      {final && (
        <p className="text-xs font-bold text-amber-800">{finalHeading}</p>
      )}
      <div className={`flex flex-col gap-2 ${stacked ? "" : "sm:flex-row sm:items-center"}`}>
        {!fixedStepKey && stepOptions.length > 0 && (
          <select
            className={`${inputClass} sm:max-w-[12rem]`}
            value={stepKey}
            disabled={busy}
            onChange={(e) => setStepKey(e.target.value)}
          >
            <option value="">Step (optional)…</option>
            {stepOptions.map((step) => (
              <option key={step.stepKey} value={step.stepKey}>
                {step.label}
              </option>
            ))}
          </select>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => addFiles(e.target.files)}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => inputRef.current?.click()}
          className={`inline-flex min-h-[40px] shrink-0 items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50 ${
            dragging
              ? "border-primary-400 bg-primary-50 text-primary-700"
              : "border-slate-200 bg-white text-slate-700 hover:border-primary-300 hover:text-primary-700"
          }`}
        >
          {files.length > 0 ? <Plus className="h-4 w-4" /> : <Paperclip className="h-4 w-4" />}
          {files.length > 0 ? "Aur files add karein" : "Files chunein"}
        </button>
        {!fixedTitle && (
          <input
            className={`${inputClass} sm:max-w-[12rem]`}
            placeholder="Title (optional)"
            value={title}
            disabled={busy}
            onChange={(e) => setTitle(e.target.value)}
          />
        )}
        <button
          type="button"
          disabled={busy || files.length === 0}
          onClick={submit}
          className={`${primaryBtnClass} min-h-[40px] shrink-0 justify-center`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
          {busy ? "Upload ho rahi hai…" : files.length > 1 ? `${buttonLabel} (${files.length} files)` : buttonLabel}
        </button>
      </div>

      {files.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 bg-white">
          {files.map((file, index) => {
            const state = progressFor(file);
            const percent = state && file.size > 0 ? Math.min(100, Math.round((state.loaded / file.size) * 100)) : 0;
            return (
              <li key={fileKey(file)} className="space-y-1 px-3 py-2 text-xs">
                <div className="flex items-center gap-2">
                  <FileIcon file={file} />
                  <span className="min-w-0 flex-1 truncate font-medium text-slate-700" title={file.name}>
                    {file.name}
                  </span>
                  <span className="shrink-0 text-slate-400">{formatFileSize(file.size)}</span>
                  {state?.status === "done" && <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />}
                  {state?.status === "error" && <AlertCircle className="h-4 w-4 shrink-0 text-red-500" />}
                  {(state?.status === "uploading" || state?.status === "saving") && (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary-500" />
                  )}
                  {!busy && (
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      aria-label={`${file.name} hatayein`}
                      className="shrink-0 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-500"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {state && (state.status === "uploading" || state.status === "saving") && (
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <span
                        className="block h-full rounded-full bg-primary-500 transition-[width] duration-200"
                        style={{ width: `${state.status === "saving" ? 100 : percent}%` }}
                      />
                    </span>
                    <span className="w-16 shrink-0 text-right text-[11px] text-slate-400">
                      {state.status === "saving" ? "Save…" : `${percent}%`}
                    </span>
                  </div>
                )}
                {state?.status === "error" && state.error && <p className="text-[11px] text-red-600">{state.error}</p>}
              </li>
            );
          })}
        </ul>
      )}

      <p className="text-[11px] text-slate-400">
        {hint ? `${hint} · ` : ""}Ek sath kai files chun sakte hain (video 100 MB, baqi 10 MB tak)
      </p>
    </div>
  );
}
