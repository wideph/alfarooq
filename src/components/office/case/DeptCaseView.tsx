"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Building2,
  Download,
  Eye,
  FileText,
  FolderOpen,
  Info,
  Loader2,
  Stamp,
  Upload,
} from "lucide-react";
import Toast, { type ToastData, type ToastKind } from "@/components/Toast";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import CaseFileViewer, { type ViewableFile } from "@/components/office/case/CaseFileViewer";
import StickerChip, { isVerificationSticker } from "@/components/office/case/StickerChip";
import { formatDate, formatDateTime, officeFetch } from "@/lib/office/client";
import { announceOfficeChange } from "@/lib/office/live";
import {
  ATTESTATION_STATUS_LABELS,
  ATTESTATION_STATUS_STYLES,
  STATUS_LABELS,
  STATUS_STYLES,
} from "@/lib/office/labels";
import { inputClass, primaryBtnClass } from "@/lib/office/types";

// §W18 — cross-office department worker ka limited case view. API (B2 contract)
// `{ ok: true, limited: true, depts: [...], detail: {...} }` return karta hai —
// money / payments / expenses / contacts KABHI nahi (na API mein, na UI mein).
// Worker sirf apne departments ki files dekhta hai + per-department upload.

export type DeptKey = "FILING" | "PRINTING" | "ATTESTATION" | "COURIER";

export type DeptLimitedAttestation = {
  id: string;
  status: string;
  scheduledDate: string | null;
  completedDate: string | null;
  attestationType: { name: string };
};

export type DeptLimitedDetail = {
  id: string;
  caseNumber: string;
  status: string;
  currentAttestationId: string | null;
  category: { id?: string; name: string } | null;
  rollNumber: string | null;
  registrationNumber: string | null;
  setName: string | null;
  bookingOffice: { id: string; name: string } | null;
  expectedPrintingDate: string | null;
  isPrinted: boolean;
  courierNumber: string | null;
  createdAt: string;
  attestations: DeptLimitedAttestation[];
};

export type DeptLimitedResponse = {
  ok: true;
  limited: true;
  depts: DeptKey[];
  detail: DeptLimitedDetail;
};

// GET /api/office/cases/[id]/files item (dept worker ko sirf uske departments
// ki files milti hain — server enforce karta hai).
type DeptFileItem = {
  id: string;
  department: DeptKey;
  stepKey: string | null;
  title: string | null;
  fileType: "pdf" | "image" | "video";
  createdAt: string;
  uploadedByName: string | null;
  url: string;
  // §W21: signed download URL (download force karta hai) — contract field.
  downloadUrl?: string | null;
};

const DEPT_LABELS: Record<DeptKey, string> = {
  FILING: "Filing",
  PRINTING: "Printing",
  ATTESTATION: "Attestation",
  COURIER: "Courier",
};

const DEPT_URL_KEYS: Record<DeptKey, string> = {
  FILING: "filing",
  PRINTING: "printing",
  ATTESTATION: "attestation",
  COURIER: "courier",
};

const UPLOAD_HINTS: Record<DeptKey, string> = {
  FILING: "1–2 files (pdf ya image)",
  PRINTING: "Printed proof (image / pdf / video)",
  ATTESTATION: "Step file (optional step select karein) — FINAL file lazmi hai",
  COURIER: "Courier slip (image / pdf / video) — admin + booking office ko dikhegi",
};

const ACCEPT_DOC = "application/pdf,.pdf,image/*";
const ACCEPT_ALL = "application/pdf,.pdf,image/*,video/*";

// Attestation type naam → set stepKey (scripts/seed-office-defaults.ts STEP_LABELS
// ka reverse; naam match na ho to step skip — stepKey optional hai).
const ATTESTATION_STEP_KEY_BY_NAME: Record<string, string> = {
  board: "BOARD",
  "uv ibcc": "UV_IBCC",
  "qr code ibcc": "QR_IBCC",
  "special mofa": "SPECIAL_MOFA",
  "saudi embassy": "SAUDI_EMBASSY",
  // §W24: live DB ke set steps "MOFA_SAUDI" key use karte hain (date-engine
  // dono keys accept karta hai) — upload tag live sets se match rakho.
  "mofa saudi": "MOFA_SAUDI",
  "back navttc": "BACK_NAVTTC",
  "current navttc": "CURRENT_NAVTTC",
  "bmfq verification": "BMFQ_VERIFICATION",
  "moh attestation": "MOH_ATTESTATION",
  "cpls attestation": "CPLS_ATTESTATION",
  "apac attestation": "APAC_ATTESTATION",
  navttc: "NAVTTC",
};

function attestationStepOptions(attestations: DeptLimitedAttestation[]) {
  const options: Array<{ stepKey: string; label: string }> = [];
  for (const attestation of attestations) {
    const key = ATTESTATION_STEP_KEY_BY_NAME[attestation.attestationType.name.trim().toLowerCase()];
    if (key && !options.some((option) => option.stepKey === key)) {
      options.push({ stepKey: key, label: attestation.attestationType.name });
    }
  }
  options.push({ stepKey: "FINAL", label: "FINAL — Final file (lazmi)" });
  return options;
}

export default function DeptCaseView({
  id,
  data,
  onReload,
}: {
  id: string;
  data: DeptLimitedResponse;
  onReload: () => Promise<void>;
}) {
  const { detail, depts } = data;
  const [files, setFiles] = useState<DeptFileItem[]>([]);
  const [filesLoading, setFilesLoading] = useState(true);
  const [toast, setToast] = useState<ToastData | null>(null);
  const [viewer, setViewer] = useState<ViewableFile | null>(null);
  const [busy, setBusy] = useState(false);
  const setMessage = (m: string, kind: ToastKind = "success") =>
    setToast(m ? { message: m, kind } : null);

  const loadFiles = useCallback(async () => {
    const res = await officeFetch<{ items: DeptFileItem[] }>(`/api/office/cases/${id}/files`);
    if (res.ok) {
      // Apne departments ki files + FILING files (§W24: printing/attestation
      // worker ko filing files sirf dekhne ke liye milti hain — server bhi
      // yahi set return karta hai; filter defensive hai).
      setFiles(
        res.data.items.filter((file) => depts.includes(file.department) || file.department === "FILING")
      );
    }
    setFilesLoading(false);
  }, [id, depts]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  async function upload(department: DeptKey, stepKey: string, file: File | null, title: string) {
    if (!file) return;
    setBusy(true);
    const fd = new FormData();
    fd.append("file", file);
    fd.append("department", department);
    if (stepKey) fd.append("stepKey", stepKey);
    if (title.trim()) fd.append("title", title.trim());
    const res = await fetch(`/api/office/cases/${id}/files`, { method: "POST", body: fd });
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      // officeFetch multipart nahi use karta — live refresh signal khud bhejein.
      announceOfficeChange();
      setMessage("File upload ho gayi");
      await loadFiles();
      await onReload(); // status aage barh sakta hai (workflow)
    } else {
      setMessage(body.error || "File upload nahi ho saki", "error");
    }
    setBusy(false);
  }

  function fileRow(file: DeptFileItem) {
    return (
      <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
        <span className="min-w-0">
          <span className="font-medium text-slate-800">{file.title || `${DEPT_LABELS[file.department]} file`}</span>
          {isVerificationSticker(file) && <StickerChip />}
          <span className="ml-2 text-xs text-slate-400">
            {file.fileType.toUpperCase()}
            {file.stepKey ? ` · ${file.stepKey}` : ""} · {formatDateTime(file.createdAt)}
            {file.uploadedByName ? ` · ${file.uploadedByName}` : ""}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <button
            onClick={() =>
              setViewer({
                url: file.url,
                downloadUrl: file.downloadUrl,
                fileType: file.fileType,
                title: file.title || "Case file",
              })
            }
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-primary-300 hover:text-primary-700"
          >
            <Eye className="h-3.5 w-3.5" /> Dekhein
          </button>
          <a
            href={file.downloadUrl || file.url}
            download={file.title || "case-file"}
            title={`Download — ${file.title || "case file"}`}
            aria-label={`Download ${file.title || "case file"}`}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-primary-300 hover:text-primary-700"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </a>
        </span>
      </li>
    );
  }

  const backDept = DEPT_URL_KEYS[depts[0]] || "filing";

  return (
    <div className="space-y-4">
      <Toast toast={toast} onClose={() => setToast(null)} />

      <div className="sticky top-16 z-30 -mx-4 border-b border-slate-200 bg-slate-50/95 px-4 py-2 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Link
            href={`/office/cases?dept=${backDept}`}
            aria-label={`${DEPT_LABELS[depts[0]]} queue`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:border-primary-300 hover:text-primary-700"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{detail.caseNumber}</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[detail.status] || "bg-slate-100 text-slate-700"}`}
              >
                {STATUS_LABELS[detail.status] || detail.status}
              </span>
              {detail.bookingOffice?.name && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
                  <Building2 className="h-3 w-3" />
                  {detail.bookingOffice.name}
                </span>
              )}
            </div>
            <h1 className="truncate text-base font-bold leading-tight text-slate-900">
              {detail.category?.name || "Case"}
              <span className="ml-2 text-[11px] font-normal text-slate-400">
                {depts.map((dept) => DEPT_LABELS[dept]).join(" + ")} department view (limited)
              </span>
            </h1>
          </div>
        </div>
      </div>

      <SectionCard icon={Info} title="Case details">
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm sm:grid-cols-3">
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Roll Number</dt>
            <dd className="truncate text-slate-800">{detail.rollNumber || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Registration Number</dt>
            <dd className="truncate text-slate-800">{detail.registrationNumber || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Category</dt>
            <dd className="truncate text-slate-800">{detail.category?.name || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Office</dt>
            <dd className="truncate text-slate-800">{detail.bookingOffice?.name || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Set of Attestations</dt>
            <dd className="truncate text-slate-800">{detail.setName || "—"}</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Created</dt>
            <dd className="truncate text-slate-800">{formatDate(detail.createdAt)}</dd>
          </div>
          {depts.includes("PRINTING") && (
            <>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Expected printing</dt>
                <dd className="truncate text-slate-800">{formatDate(detail.expectedPrintingDate)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Printed</dt>
                <dd>
                  <span
                    className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                      detail.isPrinted ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {detail.isPrinted ? "Printed" : "Not printed"}
                  </span>
                </dd>
              </div>
            </>
          )}
          {depts.includes("COURIER") && (
            <div className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Courier Number</dt>
              <dd className="truncate text-slate-800">{detail.courierNumber || "—"}</dd>
            </div>
          )}
        </dl>
      </SectionCard>

      {depts.includes("ATTESTATION") && (
        <SectionCard icon={Stamp} title="Attestation steps" count={detail.attestations.length}>
          {detail.attestations.length === 0 ? (
            <EmptyState icon={Stamp} hint="Is case par abhi koi attestation step nahi" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {detail.attestations.map((attestation) => {
                const isCurrent = attestation.id === detail.currentAttestationId;
                return (
                  <li key={attestation.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className={`truncate font-medium text-slate-800 ${isCurrent ? "underline decoration-violet-300 decoration-2 underline-offset-4" : ""}`}>
                        {attestation.attestationType.name}
                      </span>
                      {isCurrent && (
                        <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                          CURRENT
                        </span>
                      )}
                    </span>
                    <span className="flex items-center gap-2 text-xs text-slate-500">
                      {attestation.completedDate
                        ? `Completed at ${formatDate(attestation.completedDate)}`
                        : attestation.scheduledDate
                          ? `Scheduled ${formatDate(attestation.scheduledDate)}`
                          : ""}
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${ATTESTATION_STATUS_STYLES[attestation.status] || "bg-slate-100 text-slate-700"}`}
                      >
                        {ATTESTATION_STATUS_LABELS[attestation.status] || attestation.status}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </SectionCard>
      )}

      <SectionCard icon={FolderOpen} title="Department files" count={files.length}>
        {filesLoading ? (
          <SkeletonRows rows={3} />
        ) : (
          <div className="space-y-3">
            {depts.map((department) => {
              const deptFiles = files.filter((file) => file.department === department);
              return (
                <section key={department} className="overflow-hidden rounded-xl border border-slate-200">
                  <header className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      {DEPT_LABELS[department]}
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                        {deptFiles.length}
                      </span>
                    </span>
                  </header>
                  <div className="space-y-2 p-3">
                    {deptFiles.length === 0 ? (
                      <EmptyState icon={FileText} hint={`${DEPT_LABELS[department]} ki koi file nahi`} />
                    ) : (
                      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                        {deptFiles.map(fileRow)}
                      </ul>
                    )}
                    <DeptUploadBox
                      department={department}
                      accept={department === "FILING" ? ACCEPT_DOC : ACCEPT_ALL}
                      hint={UPLOAD_HINTS[department]}
                      stepOptions={department === "ATTESTATION" ? attestationStepOptions(detail.attestations) : []}
                      busy={busy}
                      onUpload={upload}
                    />
                  </div>
                </section>
              );
            })}

            {/* §W24: printing/attestation worker ke apne departments mein FILING
                nahi — magar filing files dekhne ki permission hai. Read-only
                section (koi upload box nahi, koi delete nahi). */}
            {!depts.includes("FILING") &&
              (depts.includes("PRINTING") || depts.includes("ATTESTATION")) && (
                <section className="overflow-hidden rounded-xl border border-slate-200">
                  <header className="flex items-center justify-between gap-2 bg-slate-50 px-3 py-2.5">
                    <span className="flex items-center gap-2 text-sm font-bold text-slate-800">
                      {DEPT_LABELS.FILING}
                      <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold text-slate-500 ring-1 ring-slate-200">
                        {files.filter((file) => file.department === "FILING").length}
                      </span>
                    </span>
                    <span className="text-[11px] text-slate-400">sirf dekhne ke liye</span>
                  </header>
                  <div className="p-3">
                    {files.filter((file) => file.department === "FILING").length === 0 ? (
                      <EmptyState icon={FileText} hint="Filing department ne abhi koi file upload nahi ki" />
                    ) : (
                      <ul className="divide-y divide-slate-100 rounded-lg border border-slate-100">
                        {files.filter((file) => file.department === "FILING").map(fileRow)}
                      </ul>
                    )}
                  </div>
                </section>
              )}
          </div>
        )}
      </SectionCard>

      {viewer && <CaseFileViewer file={viewer} onClose={() => setViewer(null)} />}
    </div>
  );
}

// Per-department upload box: file + optional title (+ attestation ke liye optional
// step selector). Multiple departments hon to har department ka apna box hota hai.
function DeptUploadBox({
  department,
  accept,
  hint,
  stepOptions,
  busy,
  onUpload,
}: {
  department: DeptKey;
  accept: string;
  hint: string;
  stepOptions: Array<{ stepKey: string; label: string }>;
  busy: boolean;
  onUpload: (department: DeptKey, stepKey: string, file: File | null, title: string) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [stepKey, setStepKey] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit() {
    await onUpload(department, stepKey, file, title);
    setFile(null);
    setTitle("");
    setStepKey("");
    if (inputRef.current) inputRef.current.value = "";
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
        <button disabled={busy || !file} onClick={submit} className={`${primaryBtnClass} min-h-[40px] shrink-0`}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Upload
        </button>
      </div>
      <p className="text-[11px] text-slate-400">{hint}</p>
    </div>
  );
}
