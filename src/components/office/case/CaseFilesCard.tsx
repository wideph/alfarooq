"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Eye, FileText, Loader2, Trash2, Upload } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import CaseFileViewer, { type ViewableFile } from "@/components/office/case/CaseFileViewer";
import { formatDateTime, officeFetch } from "@/lib/office/client";
import {
  type CaseFileItem,
  type CategorySetWithSteps,
  inputClass,
  primaryBtnClass,
} from "@/lib/office/types";

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

export default function CaseFilesCard({
  detail,
  admin,
  onReload,
  onMessage,
  departments = DEPARTMENTS,
}: {
  detail: {
    id: string;
    category: { id?: string; name: string } | null;
    rollNumber: string | null;
    setId?: string | null;
    setName: string | null;
  };
  admin: AdminNavUser;
  onReload: () => Promise<void>;
  onMessage: (message: string) => void;
  departments?: Department[];
}) {
  const [files, setFiles] = useState<CaseFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<ViewableFile | null>(null);
  const [setSteps, setSetSteps] = useState<Array<{ stepKey: string; label: string }>>([]);
  const [busy, setBusy] = useState(false);

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
    } else onMessage(data.error || "File upload nahi ho saki");
    setBusy(false);
  }

  async function remove(file: CaseFileItem) {
    if (!confirm("File delete karein?")) return;
    const res = await officeFetch(`/api/office/cases/${detail.id}/files?id=${file.id}`, { method: "DELETE" });
    onMessage(res.ok ? "File delete ho gayi" : res.error);
    if (res.ok) await load();
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
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-primary-300 hover:text-primary-700"
          >
            <Eye className="w-3.5 h-3.5" /> Dekhein
          </button>
          <a
            href={file.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700"
          >
            <Download className="w-3.5 h-3.5" />
          </a>
          {canDelete(file) && (
            <button onClick={() => remove(file)} className="rounded-lg p-1.5 text-red-500 hover:bg-red-50">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </span>
      </li>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
      <h3 className="flex items-center gap-2 font-bold text-slate-900">
        <FileText className="w-4 h-4 text-primary-600" /> Department files
      </h3>
      {loading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
        </div>
      ) : (
        departments.map((department) => {
          const deptFiles = files.filter((file) => file.department === department);
          return (
            <section key={department} className="space-y-2 rounded-xl border border-slate-200 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-bold text-slate-800">
                  {DEPARTMENT_LABELS[department]}
                  <span className="ml-2 text-xs font-normal text-slate-400">{deptFiles.length} file(s)</span>
                </p>
                {!canWrite(department) && <span className="text-[11px] text-slate-400">sirf dekhne ke liye</span>}
              </div>

              {/* PRINTING: filing ki files download/dekhne ke liye alag se */}
              {department === "PRINTING" && (
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="px-1 pb-1 text-[11px] font-semibold uppercase text-slate-400">Filing files (print ke liye)</p>
                  {files.filter((file) => file.department === "FILING").length === 0 ? (
                    <p className="p-2 text-xs text-slate-400">Filing department ne abhi koi file upload nahi ki</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">{files.filter((file) => file.department === "FILING").map(fileRow)}</ul>
                  )}
                </div>
              )}

              {/* COURIER: printing + atta files in-app viewer mein (sirf download nahi) */}
              {department === "COURIER" && (
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="px-1 pb-1 text-[11px] font-semibold uppercase text-slate-400">Printing + Atta files (yahan dekhein)</p>
                  {files.filter((file) => file.department === "PRINTING" || file.department === "ATTA").length === 0 ? (
                    <p className="p-2 text-xs text-slate-400">Abhi koi printing / atta file nahi</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {files.filter((file) => file.department === "PRINTING" || file.department === "ATTA").map(fileRow)}
                    </ul>
                  )}
                </div>
              )}

              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                {deptFiles.length === 0 && <li className="p-3 text-xs text-slate-400">Koi file nahi</li>}
                {deptFiles.map(fileRow)}
              </ul>

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
            </section>
          );
        })
      )}
      {viewer && <CaseFileViewer file={viewer} onClose={() => setViewer(null)} />}
    </div>
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
      <div className="flex flex-col sm:flex-row gap-2">
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
        <input className={`${inputClass} sm:max-w-[10rem]`} placeholder="Title (optional)" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button
          disabled={busy || !file}
          onClick={() =>
            submit(stepKey, file, () => {
              setFile(null);
              if (inputRef.current) inputRef.current.value = "";
            })
          }
          className={primaryBtnClass}
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Upload
        </button>
      </div>
      <p className="text-[11px] text-slate-400">{hint}</p>

      {showFinal && (
        <div className="space-y-1 rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 p-3">
          <p className="text-xs font-bold text-amber-800">Final file (lazmi) — attestation complete karne ke liye zaroori</p>
          <div className="flex flex-col sm:flex-row gap-2">
            <input ref={finalRef} type="file" accept={accept} className="text-sm" onChange={(e) => setFinalFile(e.target.files?.[0] || null)} />
            <button
              disabled={busy || !finalFile}
              onClick={() =>
                submit("FINAL", finalFile, () => {
                  setFinalFile(null);
                  if (finalRef.current) finalRef.current.value = "";
                })
              }
              className={primaryBtnClass}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />} Final upload
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
