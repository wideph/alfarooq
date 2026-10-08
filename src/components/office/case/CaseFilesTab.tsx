"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCheck,
  ChevronDown,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Loader2,
  Trash2,
  Upload,
} from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import CaseFileViewer, { type ViewableFile } from "@/components/office/case/CaseFileViewer";
import { formatDateTime, officeFetch } from "@/lib/office/client";
import { type CaseFileItem, type CategorySetWithSteps, inputClass, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

// docs 06 §N7 — department files: FILING (1–2 pdf/image), PRINTING (filing
// files dekhe + printed proof), ATTA (per set-step optional + FINAL lazmi),
// COURIER (printing+atta files in-app viewer mein + courier slip).
// Upload sirf us department ki write permission par; lists sab ko (read).

type Department = "FILING" | "PRINTING" | "ATTA" | "COURIER";

const DEPARTMENTS: Department[] = ["FILING", "PRINTING", "ATTA", "COURIER"];

const DEPARTMENT_LABELS: Record<Department, string> = {
  FILING: "Filing",
  PRINTING: "Printing",
  ATTA: "Atta",
  COURIER: "Courier",
};

// Client-side mirror of workflow.ts DEPARTMENT_PERMISSIONS (server-only file).
const DEPARTMENT_PERMISSIONS_CLIENT = {
  FILING: "office:filing:write",
  PRINTING: "office:printing:write",
  ATTA: "office:atta:write",
  COURIER: "office:courier:write",
} as const;

const ACCEPT_DOC = "application/pdf,.pdf,image/*";
const ACCEPT_ALL = "application/pdf,.pdf,image/*,video/*";

type Props = {
  detail: {
    id: string;
    caseNumber?: string;
    category: { id?: string; name: string } | null;
    rollNumber: string | null;
    setId?: string | null;
    setName: string | null;
  };
  admin: AdminNavUser;
  onReload: () => Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
  departments?: Department[];
};

// Files tab: per-department collapsible sections + upload + in-app viewer.
// ATTA section mein prominent FINAL uploader + "Saari attestations complete
// karein" button (POST .../attestations/complete-all; FINAL lazmi, warna API
// ka error toast; success par detail reload).
export default function CaseFilesTab({ detail, admin, onReload, onMessage, departments = DEPARTMENTS }: Props) {
  const [files, setFiles] = useState<CaseFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<ViewableFile | null>(null);
  const [setSteps, setSetSteps] = useState<Array<{ stepKey: string; label: string }>>([]);
  const [busy, setBusy] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [open, setOpen] = useState<Record<Department, boolean>>(() => {
    const initial = {} as Record<Department, boolean>;
    for (const d of departments) initial[d] = true;
    return initial;
  });

  const canCompleteAll = adminCanAny(admin, ["office:atta:write", "office:attestation:write"]);

  const load = useCallback(async () => {
    const res = await officeFetch<{ items: CaseFileItem[] }>(`/api/office/cases/${detail.id}/files`);
    if (res.ok) setFiles(res.data.items);
    setLoading(false);
  }, [detail.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // ATTA per-step upload ke liye selected set ke steps (stepKey + label).
  useEffect(() => {
    if (!detail.setId || !detail.category?.id) return;
    const params = new URLSearchParams({ categoryId: detail.category.id });
    if (detail.rollNumber) params.set("rollNumber", detail.rollNumber);
    officeFetch<CategorySetWithSteps[]>(`/api/office/setup/sets?${params}`).then((res) => {
      if (!res.ok) return;
      const selected = res.data.find((set) => set.id === detail.setId);
      if (selected) setSetSteps(selected.steps.map((step) => ({ stepKey: step.stepKey, label: step.label })));
    });
  }, [detail.setId, detail.category?.id, detail.rollNumber]);

  async function upload(department: Department, stepKey: string, file: File | null, title: string) {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("department", department);
    if (stepKey) fd.append("stepKey", stepKey);
    if (title.trim()) fd.append("title", title.trim());
    const res = await fetch(`/api/office/cases/${detail.id}/files`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      onMessage("File upload ho gayi");
      await load();
      await onReload(); // status aage barh sakta hai (workflow)
    } else onMessage(data.error || "File upload nahi ho saki", "error");
    setBusy(false);
  }

  async function remove(file: CaseFileItem) {
    if (!confirm("File delete karein?")) return;
    const res = await officeFetch(`/api/office/cases/${detail.id}/files?id=${file.id}`, { method: "DELETE" });
    onMessage(res.ok ? "File delete ho gayi" : res.error, res.ok ? "success" : "error");
    if (res.ok) await load();
  }

  // Ek click mein tamam attestation steps DONE + case COMPLETED (API contract:
  // FINAL atta file lazmi — missing ho to API ka error toast dikhta hai).
  async function completeAll() {
    if (!confirm("Saari attestations complete karein? Tamam steps DONE mark ho jayen gi.")) return;
    setCompleting(true);
    const res = await officeFetch(`/api/office/cases/${detail.id}/attestations/complete-all`, { method: "POST" });
    if (res.ok) {
      onMessage("Saari attestations complete ho gayi — case COMPLETED");
      await onReload();
    } else onMessage(res.error, "error");
    setCompleting(false);
  }

  function canWrite(department: Department) {
    return adminCanAny(admin, [DEPARTMENT_PERMISSIONS_CLIENT[department]]);
  }

  function canDelete(file: CaseFileItem) {
    return admin.role === "admin" || canWrite(file.department);
  }

  function fileRow(file: CaseFileItem) {
    return (
      <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
        <span className="min-w-0">
          <span className="font-medium text-slate-800">{file.title || `${DEPARTMENT_LABELS[file.department]} file`}</span>
          <span className="ml-2 text-xs text-slate-400">
            {file.fileType.toUpperCase()}
            {file.stepKey ? ` · ${file.stepKey}` : ""} · {formatDateTime(file.createdAt)}
            {file.uploadedByName ? ` · ${file.uploadedByName}` : ""}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <button
            onClick={() => setViewer({ url: file.url, fileType: file.fileType, title: file.title || "Case file" })}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-primary-300 hover:text-primary-700"
          >
            <Eye className="h-3.5 w-3.5" /> Dekhein
          </button>
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Download"
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
          >
            <Download className="h-3.5 w-3.5" />
          </a>
          {canDelete(file) && (
            <button onClick={() => remove(file)} aria-label="File delete karein" className="rounded-lg p-2 text-red-500 hover:bg-red-50">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </span>
      </li>
    );
  }

  return (
    <SectionCard icon={FolderOpen} title="Department files" count={files.length}>
      {loading ? (
        <SkeletonRows rows={4} />
      ) : (
        <div className="space-y-3">
          {departments.map((department) => {
            const deptFiles = files.filter((file) => file.department === department);
            const isOpen = open[department] ?? true;
            return (
              <section key={department} className="overflow-hidden rounded-xl border border-slate-200">
                <button
                  onClick={() => setOpen((prev) => ({ ...prev, [department]: !isOpen }))}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between gap-2 bg-slate-50 px-3 py-2.5 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                    <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
                    {DEPARTMENT_LABELS[department]}
                    <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                      {deptFiles.length}
                    </span>
                  </span>
                  {!canWrite(department) && <span className="text-[11px] text-slate-400">sirf dekhne ke liye</span>}
                </button>

                {isOpen && (
                  <div className="space-y-2 p-3">
                    {/* PRINTING: filing ki files download/dekhne ke liye alag se */}
                    {department === "PRINTING" && (
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Filing files (print ke liye)
                        </p>
                        {files.filter((file) => file.department === "FILING").length === 0 ? (
                          <p className="p-2 text-xs text-slate-400">Filing department ne abhi koi file upload nahi ki</p>
                        ) : (
                          <ul className="divide-y divide-slate-100">
                            {files.filter((file) => file.department === "FILING").map(fileRow)}
                          </ul>
                        )}
                      </div>
                    )}

                    {/* COURIER: printing + atta files in-app viewer mein (sirf download nahi) */}
                    {department === "COURIER" && (
                      <div className="rounded-lg bg-slate-50 p-2">
                        <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                          Printing + Atta files (yahan dekhein)
                        </p>
                        {files.filter((file) => file.department === "PRINTING" || file.department === "ATTA").length === 0 ? (
                          <p className="p-2 text-xs text-slate-400">Abhi koi printing / atta file nahi</p>
                        ) : (
                          <ul className="divide-y divide-slate-100">
                            {files
                              .filter((file) => file.department === "PRINTING" || file.department === "ATTA")
                              .map(fileRow)}
                          </ul>
                        )}
                      </div>
                    )}

                    {deptFiles.length === 0 ? (
                      <EmptyState icon={FileText} hint={`${DEPARTMENT_LABELS[department]} ki koi file nahi`} />
                    ) : (
                      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">{deptFiles.map(fileRow)}</ul>
                    )}

                    {canWrite(department) && (
                      <UploadRow
                        department={department}
                        accept={department === "FILING" ? ACCEPT_DOC : ACCEPT_ALL}
                        hint={
                          department === "FILING"
                            ? "1–2 files (pdf ya image)"
                            : department === "PRINTING"
                              ? "Printed proof (image / pdf / video)"
                              : department === "COURIER"
                                ? "Courier slip (image / pdf / video) — admin + booking office ko dikhegi"
                                : "Step file (optional)"
                        }
                        stepOptions={department === "ATTA" ? setSteps : []}
                        showFinal={department === "ATTA"}
                        busy={busy}
                        onUpload={upload}
                      />
                    )}

                    {/* ATTA: ek click mein tamam steps complete (FINAL lazmi) */}
                    {department === "ATTA" && canCompleteAll && (
                      <button
                        disabled={completing}
                        onClick={completeAll}
                        className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"
                      >
                        {completing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                        Saari attestations complete karein
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
      {viewer && <CaseFileViewer file={viewer} onClose={() => setViewer(null)} />}
    </SectionCard>
  );
}

function UploadRow({
  department,
  accept,
  hint,
  stepOptions,
  showFinal,
  busy,
  onUpload,
}: {
  department: Department;
  accept: string;
  hint: string;
  stepOptions: Array<{ stepKey: string; label: string }>;
  showFinal: boolean;
  busy: boolean;
  onUpload: (department: Department, stepKey: string, file: File | null, title: string) => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [stepKey, setStepKey] = useState("");
  const [finalFile, setFinalFile] = useState<File | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const finalRef = useRef<HTMLInputElement>(null);

  async function submit(selectedStep: string, picked: File | null, clear: () => void) {
    await onUpload(department, selectedStep, picked, title);
    clear();
    setTitle("");
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-col gap-2 sm:flex-row">
        {stepOptions.length > 0 && (
          <select className={`${inputClass} sm:max-w-[12rem]`} value={stepKey} onChange={(e) => setStepKey(e.target.value)}>
            <option value="">Step (optional)…</option>
            {stepOptions.map((step) => (
              <option key={step.stepKey} value={step.stepKey}>
                {step.label}
              </option>
            ))}
          </select>
        )}
        <input ref={inputRef} type="file" accept={accept} className="text-sm" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <input
          className={`${inputClass} sm:max-w-[10rem]`}
          placeholder="Title (optional)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          disabled={busy || !file}
          onClick={() =>
            submit(stepKey, file, () => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = "";
            })
          }
          className={`${primaryBtnClass} min-h-[40px] shrink-0`}
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
        </button>
      </div>
      <p className="text-[11px] text-slate-400">{hint}</p>

      {showFinal && (
        <div className="space-y-2 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-800">Final file (lazmi) — attestation complete karne ke liye zaroori</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input ref={finalRef} type="file" accept={accept} className="text-sm" onChange={(e) => setFinalFile(e.target.files?.[0] || null)} />
            <button
              disabled={busy || !finalFile}
              onClick={() =>
                submit("FINAL", finalFile, () => {
                  setFinalFile(null);
                  if (finalRef.current) finalRef.current.value = "";
                })
              }
              className={`${primaryBtnClass} min-h-[40px] shrink-0`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Final upload
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
