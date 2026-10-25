"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  Download,
  Eye,
  EyeOff,
  FileText,
  FolderOpen,
  Loader2,
  Trash2,
} from "lucide-react";
import type { AdminNavUser, AdminPermission } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import SectionCard from "@/components/ui/SectionCard";
import EmptyState from "@/components/ui/EmptyState";
import { SkeletonRows } from "@/components/ui/Skeleton";
import CaseFileViewer, { type ViewableFile } from "@/components/office/case/CaseFileViewer";
import FileUploadBox from "@/components/office/case/FileUploadBox";
import CompleteAttestationButton from "@/components/office/case/CompleteAttestationButton";
import StickerChip, { isVerificationSticker } from "@/components/office/case/StickerChip";
import { formatDateTime, officeFetch } from "@/lib/office/client";
import type { CaseFileItem, CategorySetWithSteps } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

// docs 06 §N7 — department files: FILING (1–2 pdf/image), PRINTING (printed
// proof; filing ki files upar Filing section se dekhta hai — §W24), ATTESTATION
// (per set-step optional + FINAL lazmi), COURIER (printing+attestation files
// in-app viewer mein + courier slip).
// Upload sirf us department ki write permission par; lists sab ko (read).
// §W26: har section mein kai files ek sath (FileUploadBox — browser se seedha
// R2, progress ke saath; fail ho to bhi page/button nahi atakta).

// §W18: ATTA → ATTESTATION rename (department value + permission key).
type Department = "FILING" | "PRINTING" | "ATTESTATION" | "COURIER";

const DEPARTMENTS: Department[] = ["FILING", "PRINTING", "ATTESTATION", "COURIER"];

const DEPARTMENT_LABELS: Record<Department, string> = {
  FILING: "Filing",
  PRINTING: "Printing",
  ATTESTATION: "Attestation",
  COURIER: "Courier",
};

// Client-side mirror of workflow.ts DEPARTMENT_PERMISSIONS (server-only file).
// office:attestation-dept:write — auth.ts mid-flight rename; cast safe hai.
const DEPARTMENT_PERMISSIONS_CLIENT: Record<Department, AdminPermission> = {
  FILING: "office:filing:write",
  PRINTING: "office:printing:write",
  ATTESTATION: "office:attestation-dept:write" as AdminPermission,
  COURIER: "office:courier:write",
};

type FileItem = Omit<CaseFileItem, "department"> & { department: Department };

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
    // §W11.6: booking office ko FILING files tabhi dikhti hain jab ye on ho.
    filingFilesVisibleToBooking?: boolean;
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
  const [files, setFiles] = useState<FileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewer, setViewer] = useState<ViewableFile | null>(null);
  const [setSteps, setSetSteps] = useState<Array<{ stepKey: string; label: string }>>([]);
  const [open, setOpen] = useState<Record<Department, boolean>>(() => {
    const initial = {} as Record<Department, boolean>;
    for (const d of departments) initial[d] = true;
    return initial;
  });

  const canCompleteAll = adminCanAny(admin, [DEPARTMENT_PERMISSIONS_CLIENT.ATTESTATION, "office:attestation:write"]);
  // §W32: printing / attestation / courier department ka user (super admin
  // nahi) printed proof ke baad FINAL file ke baghair, WAJAH ke saath complete
  // kar sakta hai.
  const deptUser =
    admin.role !== "admin" &&
    adminCanAny(admin, [
      DEPARTMENT_PERMISSIONS_CLIENT.PRINTING,
      DEPARTMENT_PERMISSIONS_CLIENT.ATTESTATION,
      DEPARTMENT_PERMISSIONS_CLIENT.COURIER,
    ]);

  const load = useCallback(async () => {
    try {
      const res = await officeFetch<{ items: FileItem[] }>(`/api/office/cases/${detail.id}/files`);
      if (res.ok) setFiles(res.data.items);
    } catch {
      // network error — purani list rehne dein, skeleton par na atkein
    } finally {
      setLoading(false);
    }
  }, [detail.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // ATTA per-step upload ke liye selected set ke steps (stepKey + label).
  useEffect(() => {
    if (!detail.setId || !detail.category?.id) return;
    const params = new URLSearchParams({ categoryId: detail.category.id });
    if (detail.rollNumber) params.set("rollNumber", detail.rollNumber);
    officeFetch<CategorySetWithSteps[]>(`/api/office/setup/sets?${params}`)
      .then((res) => {
        if (!res.ok) return;
        const selected = res.data.find((set) => set.id === detail.setId);
        if (selected) setSetSteps(selected.steps.map((step) => ({ stepKey: step.stepKey, label: step.label })));
      })
      .catch(() => undefined);
  }, [detail.setId, detail.category?.id, detail.rollNumber]);

  // Upload ke baad: list + case detail (status workflow se aage barh sakta hai).
  async function afterUpload() {
    await load();
    await onReload();
  }

  async function remove(file: FileItem) {
    if (!confirm("File delete karein?")) return;
    const res = await officeFetch(`/api/office/cases/${detail.id}/files?id=${file.id}`, { method: "DELETE" }).catch(
      () => ({ ok: false as const, error: "Internet / server se rabta nahi ho saka", status: 0 })
    );
    onMessage(res.ok ? "File delete ho gayi" : res.error, res.ok ? "success" : "error");
    if (res.ok) await load();
  }


  function canWrite(department: Department) {
    return adminCanAny(admin, [DEPARTMENT_PERMISSIONS_CLIENT[department]]);
  }

  function canDelete(file: FileItem) {
    return admin.role === "admin" || canWrite(file.department);
  }

  // §W11.6: admin toggle — booking office ko filing files dikhayein / chhupayein.
  const [togglingVisibility, setTogglingVisibility] = useState(false);
  async function toggleFilingVisibility() {
    setTogglingVisibility(true);
    const next = !detail.filingFilesVisibleToBooking;
    try {
      const res = await officeFetch(`/api/office/cases/${detail.id}`, {
        method: "PATCH",
        json: { filingFilesVisibleToBooking: next },
      });
      if (res.ok) {
        onMessage(next ? "Booking office ab filing files dekh sakta hai" : "Filing files booking office se hide ho gayi");
        await onReload();
      } else onMessage(res.error, "error");
    } catch {
      onMessage("Internet / server se rabta nahi ho saka", "error");
    } finally {
      setTogglingVisibility(false);
    }
  }

  function fileRow(file: FileItem) {
    const label = file.title || file.fileName || `${DEPARTMENT_LABELS[file.department]} file`;
    return (
      <li key={file.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
        <span className="min-w-0">
          <span className="break-all font-medium text-slate-800">{label}</span>
          {isVerificationSticker(file) && <StickerChip />}
          <span className="ml-2 text-xs text-slate-400">
            {String(file.fileType || "file").toUpperCase()}
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
                title: label,
                fileName: file.fileName,
              })
            }
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-primary-300 hover:text-primary-700"
          >
            <Eye className="h-3.5 w-3.5" /> Dekhein
          </button>
          {/* §W21/§W23: download hamesha original file name se (server
              Content-Disposition) — title kabhi filename nahi. */}
          <a
            href={file.downloadUrl || file.url}
            download={file.fileName || ""}
            title={`Download — ${label}`}
            aria-label={`Download ${label}`}
            className="inline-flex min-h-[36px] items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-700 hover:border-primary-300 hover:text-primary-700"
          >
            <Download className="h-3.5 w-3.5" /> Download
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
    <SectionCard
      icon={FolderOpen}
      title="Department files"
      count={files.length}
      actions={
        admin.role === "admin" ? (
          <button
            type="button"
            disabled={togglingVisibility}
            onClick={toggleFilingVisibility}
            title="On ho to booking office bhi FILING files dekh sakta hai"
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold disabled:opacity-50 ${
              detail.filingFilesVisibleToBooking
                ? "bg-emerald-600 text-white"
                : "border border-slate-200 bg-white text-slate-600"
            }`}
          >
            {togglingVisibility ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : detail.filingFilesVisibleToBooking ? (
              <Eye className="h-3.5 w-3.5" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" />
            )}
            Booking ko filing files: {detail.filingFilesVisibleToBooking ? "On" : "Off"}
          </button>
        ) : undefined
      }
    >
      {/* §W11.6: booking office ko filing files hidden hon to wazahat */}
      {admin.role === "booking_office" && !detail.filingFilesVisibleToBooking && (
        <p className="mb-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500">
          Filing department ki files is case par hidden hain — admin on kare to yahan nazar aayen gi.
        </p>
      )}
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

                {/* §W26: section band ho to bhi upload box mounted rehta hai
                    (hidden) — upload ke dauran collapse karne se upload nahi tootti. */}
                <div className="space-y-2 p-3" hidden={!isOpen}>
                  {/* §W24: filing files SIRF Filing section mein show hoti hain —
                      printing section ke andar duplicate block hata diya (confusing
                      tha). View/download permission sab ke paas hai: Filing section
                      har viewer ko "sirf dekhne ke liye" mode mein milta hai. */}
                  {/* COURIER: printing + atta files in-app viewer mein (sirf download nahi) */}
                  {department === "COURIER" && (
                    <div className="rounded-lg bg-slate-50 p-2">
                      <p className="px-1 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                        Printing + Attestation files (yahan dekhein)
                      </p>
                      {files.filter((file) => file.department === "PRINTING" || file.department === "ATTESTATION").length === 0 ? (
                        <p className="p-2 text-xs text-slate-400">Abhi koi printing / attestation file nahi</p>
                      ) : (
                        <ul className="divide-y divide-slate-100">
                          {files
                            .filter((file) => file.department === "PRINTING" || file.department === "ATTESTATION")
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
                    <FileUploadBox
                      caseId={detail.id}
                      department={department}
                      accept={department === "FILING" ? ACCEPT_DOC : ACCEPT_ALL}
                      hint={
                        department === "FILING"
                          ? "Files (pdf ya image)"
                          : department === "PRINTING"
                            ? "Printed proof (images / pdf / video)"
                            : department === "COURIER"
                              ? "Courier slip (image / pdf / video) — admin + booking office ko dikhegi"
                              : "Step files / proof (optional)"
                      }
                      stepOptions={department === "ATTESTATION" ? setSteps : []}
                      onUploaded={afterUpload}
                      onMessage={onMessage}
                    />
                  )}

                  {/* ATTA: FINAL file(s) lazmi — kai files bhi ho sakti hain */}
                  {department === "ATTESTATION" && canWrite(department) && (
                    <FileUploadBox
                      caseId={detail.id}
                      department="ATTESTATION"
                      accept={ACCEPT_ALL}
                      fixedStepKey="FINAL"
                      tone="final"
                      finalHeading={
                        deptUser
                          ? "Final file (optional) — printed proof ke baad iske baghair bhi wajah likh kar complete ho sakta hai"
                          : undefined
                      }
                      buttonLabel="Final upload"
                      hint="Final proof (images / pdf / video)"
                      onUploaded={afterUpload}
                      onMessage={onMessage}
                    />
                  )}

                  {/* ATTA: ek click mein tamam steps complete. FINAL file ho to
                      wajah optional; na ho to (§W32) printed proof ke baad wajah lazmi. */}
                  {department === "ATTESTATION" && (canCompleteAll || deptUser) && (
                    <CompleteAttestationButton
                      caseId={detail.id}
                      label="Saari attestations complete karein"
                      fullWidth
                      reasonRequired={
                        !files.some((file) => file.department === "ATTESTATION" && file.stepKey === "FINAL")
                      }
                      onDone={onReload}
                      onMessage={onMessage}
                    />
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      {viewer && <CaseFileViewer file={viewer} onClose={() => setViewer(null)} />}
    </SectionCard>
  );
}
