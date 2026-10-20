"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BadgeCheck, Building2, CheckCircle2, Flame, ImagePlus, Loader2, Upload, X } from "lucide-react";
import { formatDate } from "@/lib/office/client";
import { caseStatusLabel, caseStatusStyle } from "@/lib/office/labels";
import { announceOfficeChange } from "@/lib/office/live";
import { useToast } from "@/hooks/useToast";

// §W18 — department queues (?dept=filing|printing|attestation|courier). Cross-office
// "slim" rows (limited: true) mein money fields nahi hote — dept mode apna column
// set use karta hai jisme kabhi money render nahi hota. Own-office rows full shape
// rakhte hain, is liye extra fields optional hain.
export type DeptQueueKey = "filing" | "printing" | "attestation" | "courier";

export type DeptQueueRow = {
  id: string;
  caseNumber: string;
  status: string;
  limited?: boolean;
  // §W25: dept queues ki list mein client ka naam bhi dikhta hai (slim
  // payload ab clientName carry karta hai; purane rows par optional).
  clientName?: string | null;
  category: { id?: string; name: string } | null;
  rollNumber: string | null;
  registrationNumber: string | null;
  setName?: string | null;
  bookingOffice?: { id: string; name: string; type?: string } | null;
  currentAttestationId?: string | null;
  attestations?: Array<{
    id: string;
    status: string;
    scheduledDate?: string | null;
    completedDate: string | null;
    attestationType: { name: string };
  }>;
  expectedPrintingDate?: string | null;
  isPrinted?: boolean;
  courierNumber?: string | null;
  createdAt?: string;
  isUrgent?: boolean;
  // §W21: filing queue pending + done rows (pending-first, server sorted) —
  // har filing row par filing state; online verification # BMFQ cases ka.
  filingFilesCount?: number;
  filingDone?: boolean;
  onlineVerificationNumber?: string | null;
};

const DEPT_CONFIG: Record<
  DeptQueueKey,
  {
    workHeading: string;
    actionLabel: string;
    empty: string;
    // Filing history mode (filing se aage ke cases) — wahan upload action nahi.
    historyActionLabel?: string;
    historyEmpty?: string;
  }
> = {
  filing: {
    workHeading: "Roll / Reg No",
    actionLabel: "Files upload karein",
    historyActionLabel: "Case dekhein",
    empty: "Sab cases ki files upload ho chuki hain — koi pending kaam nahi",
    historyEmpty: "Abhi koi case filing stage se aage nahi pohncha",
  },
  printing: {
    workHeading: "Printing",
    actionLabel: "Printed proof upload karein",
    empty: "Printing ke liye koi case pending nahi",
  },
  attestation: {
    workHeading: "Attestation",
    actionLabel: "Files / steps dekhein",
    empty: "Attestation ke liye koi case pending nahi",
  },
  courier: {
    workHeading: "Courier",
    actionLabel: "Courier slip upload karein",
    empty: "Courier ke liye koi case pending nahi",
  },
};

// §W21: filing queue upload — normal files pdf/image; verification sticker
// image/pdf/word bhi accept karta hai.
const ACCEPT_FILING = "application/pdf,.pdf,image/*";
const ACCEPT_STICKER =
  "image/*,application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const STICKER_STEP_KEY = "VERIFICATION_STICKER";
const STICKER_TITLE = "Verification Sticker/Picture of student";

// Current attestation step ka naam — full rows mein currentAttestationId hota hai;
// slim cross-office rows mein nahi, wahan pehla non-DONE step current maana jata hai.
function currentStepName(item: DeptQueueRow): string | null {
  const attestations = item.attestations || [];
  if (item.currentAttestationId) {
    const current = attestations.find((a) => a.id === item.currentAttestationId);
    if (current) return current.attestationType.name;
  }
  return attestations.find((a) => a.status !== "DONE")?.attestationType.name || null;
}

function attestationProgress(item: DeptQueueRow): { done: number; total: number } | null {
  const attestations = item.attestations || [];
  if (attestations.length === 0) return null;
  return { done: attestations.filter((a) => a.status === "DONE").length, total: attestations.length };
}

function stopRowClick(e: React.MouseEvent) {
  e.stopPropagation();
}

export default function DeptQueue({
  dept,
  items,
  loading,
  history = false,
}: {
  dept: DeptQueueKey;
  items: DeptQueueRow[];
  loading: boolean;
  history?: boolean;
}) {
  const router = useRouter();
  const config = DEPT_CONFIG[dept];
  const actionLabel = history && config.historyActionLabel ? config.historyActionLabel : config.actionLabel;
  const emptyMessage = history && config.historyEmpty ? config.historyEmpty : config.empty;

  // §W21: filing mode (history nahi) — done rows bhi dikhti hain (emerald tint),
  // pending rows amber tint; inline upload modal se hi filing complete hoti hai.
  const filingMode = dept === "filing" && !history;
  const { showToast, ToastElement } = useToast();
  const [uploadFor, setUploadFor] = useState<{ item: DeptQueueRow; sticker: boolean } | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  // Upload ke foran baad row foran done-color ho jaye (live-refresh 300ms mein
  // server truth la deta hai — ye sirf instant feedback hai).
  const [localFiling, setLocalFiling] = useState<Record<string, { done: boolean; count: number }>>({});

  function openCase(item: DeptQueueRow) {
    router.push(`/office/cases/${item.id}`);
  }

  function filingState(item: DeptQueueRow): { done: boolean; count: number } {
    const local = localFiling[item.id];
    // filingDone contract field hai; purane payload par status se fallback.
    const done = local?.done ?? item.filingDone ?? item.status !== "WAITING_FOR_FILE";
    const count = local?.count ?? item.filingFilesCount ?? 0;
    return { done, count };
  }

  // Row background color-coding: pending = amber tint, done = emerald tint.
  function rowTint(item: DeptQueueRow): string {
    if (!filingMode) return "bg-white hover:bg-slate-50";
    return filingState(item).done
      ? "bg-emerald-50/60 hover:bg-emerald-100/60 border-emerald-200"
      : "bg-amber-50/60 hover:bg-amber-100/60 border-amber-200";
  }

  function openUpload(item: DeptQueueRow, sticker: boolean) {
    setUploadFor({ item, sticker });
    setUploadFile(null);
    setUploadTitle("");
  }

  async function submitUpload() {
    if (!uploadFor || !uploadFile) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("file", uploadFile);
    fd.append("department", "FILING");
    if (uploadFor.sticker) {
      // stepKey VERIFICATION_STICKER — workflow advance nahi hota, sirf sticker save.
      fd.append("stepKey", STICKER_STEP_KEY);
      fd.append("title", STICKER_TITLE);
    } else if (uploadTitle.trim()) {
      fd.append("title", uploadTitle.trim());
    }
    const res = await fetch(`/api/office/cases/${uploadFor.item.id}/files`, { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    setUploading(false);
    if (res.ok) {
      // Raw fetch (multipart) office:changed khud nahi bhejta — khud announce karein
      // taake queue/navbar 300ms mein refresh ho jayein.
      announceOfficeChange();
      showToast(uploadFor.sticker ? "Verification sticker upload ho gaya" : "File upload ho gayi — filing done");
      if (!uploadFor.sticker) {
        const { count } = filingState(uploadFor.item);
        setLocalFiling((prev) => ({ ...prev, [uploadFor.item.id]: { done: true, count: count + 1 } }));
      }
      setUploadFor(null);
      setUploadFile(null);
      setUploadTitle("");
    } else {
      showToast(data.error || "File upload nahi ho saki", "error");
    }
  }

  // Dept mode mein office chip HAMESHA — cross-office queues scannable hon.
  function officeChip(item: DeptQueueRow) {
    if (!item.bookingOffice?.name) return <span className="text-xs text-slate-400">—</span>;
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-600">
        <Building2 className="h-3 w-3" />
        {item.bookingOffice.name}
      </span>
    );
  }

  function identityBlock(item: DeptQueueRow) {
    const currentName = currentStepName(item);
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-primary-700">{item.caseNumber}</span>
          {item.isUrgent && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
              <Flame className="w-3 h-3" /> URGENT
            </span>
          )}
          <span
            className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${caseStatusStyle(item.status)}`}
          >
            {caseStatusLabel(item.status, item.status === "ATTESTATION" ? currentName : null)}
          </span>
        </div>
        {/* §W25: har dept row mein client ka naam — case pehchan ek nazar mein */}
        {item.clientName && <p className="mt-0.5 truncate text-sm font-bold text-slate-800">{item.clientName}</p>}
        {item.createdAt && <p className="text-xs text-slate-400">{formatDate(item.createdAt)}</p>}
      </>
    );
  }

  // Har department ka apna "work info" cell — kaam ek nazar mein samajh aaye.
  function workInfo(item: DeptQueueRow) {
    switch (dept) {
      case "filing":
        return (
          <div className="text-xs text-slate-600">
            <p>{item.rollNumber ? `Roll ${item.rollNumber}` : "Roll —"}</p>
            <p>{item.registrationNumber ? `Reg ${item.registrationNumber}` : "Reg —"}</p>
            {item.onlineVerificationNumber && (
              <p className="font-semibold text-indigo-600">Online Verification #: {item.onlineVerificationNumber}</p>
            )}
          </div>
        );
      case "printing": {
        // §W23: chip STATUS se decide hota hai, isPrinted flag se nahi —
        // AF-2026-000016 jaisa stale state (status WAITING_FOR_PRINTING magar
        // isPrinted=true) ghalat "Printed" dikhata tha.
        const printed = item.status !== "WAITING_FOR_PRINTING" && Boolean(item.isPrinted);
        return (
          <div className="space-y-1 text-xs">
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                printed ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {printed ? "Printed" : "Not printed"}
            </span>
            {/* §W25: printing row mein Roll/Reg — list se hi pehchan */}
            <p className="text-slate-600">
              {item.rollNumber ? `Roll ${item.rollNumber}` : "Roll —"} ·{" "}
              {item.registrationNumber ? `Reg ${item.registrationNumber}` : "Reg —"}
            </p>
            <p className="text-slate-500">Expected: {formatDate(item.expectedPrintingDate)}</p>
          </div>
        );
      }
      case "attestation": {
        const step = currentStepName(item);
        const progress = attestationProgress(item);
        return (
          <div className="space-y-1 text-xs">
            {/* §W25: attestation row mein Roll/Reg — list se hi pehchan */}
            <p className="text-slate-600">
              {item.rollNumber ? `Roll ${item.rollNumber}` : "Roll —"} ·{" "}
              {item.registrationNumber ? `Reg ${item.registrationNumber}` : "Reg —"}
            </p>
            <p className="text-slate-500">Set: {item.setName || "—"}</p>
            {step && (
              <p className="text-slate-600">
                Current step: <span className="font-semibold text-violet-700">{step}</span>
              </p>
            )}
            {progress && (
              <div className="flex items-center gap-2">
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                  <span
                    className="block h-full rounded-full bg-emerald-500"
                    style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }}
                  />
                </span>
                <span className="text-[11px] text-slate-400">
                  {progress.done}/{progress.total} steps done
                </span>
              </div>
            )}
          </div>
        );
      }
      case "courier":
        return (
          <div className="space-y-1 text-xs">
            <p className="text-slate-600">
              Courier #: <span className="font-semibold text-slate-800">{item.courierNumber || "—"}</span>
            </p>
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                item.status === "DELIVERED" ? "bg-emerald-100 text-emerald-700" : "bg-teal-100 text-teal-700"
              }`}
            >
              {item.status === "DELIVERED" ? "Delivered" : "Courier pending"}
            </span>
          </div>
        );
    }
  }

  function actionButton(item: DeptQueueRow, fullWidth = false) {
    return (
      <Link
        href={`/office/cases/${item.id}`}
        onClick={stopRowClick}
        onMouseEnter={() => router.prefetch(`/office/cases/${item.id}`)}
        className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700 ${
          fullWidth ? "w-full" : ""
        }`}
      >
        <Upload className="h-3.5 w-3.5" /> {actionLabel}
      </Link>
    );
  }

  // §W21 filing actions: pending row → inline upload modal (detail page par
  // navigate nahi); sticker button pending + done DONO rows par (sticker kabhi
  // bhi add ho sakta hai). Done row apna files count subtly dikhati hai.
  function filingActions(item: DeptQueueRow, fullWidth = false) {
    const { done, count } = filingState(item);
    return (
      <div
        className={`flex flex-col gap-1.5 ${fullWidth ? "w-full" : "min-w-[11rem]"}`}
        onClick={stopRowClick}
        onMouseEnter={stopRowClick}
      >
        {done ? (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" />
            {count > 0 ? `${count} file${count !== 1 ? "s" : ""} ✓` : "Files uploaded ✓"}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => openUpload(item, false)}
            className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700 ${
              fullWidth ? "w-full" : ""
            }`}
          >
            <Upload className="h-3.5 w-3.5" /> Files upload karein
          </button>
        )}
        <button
          type="button"
          title={STICKER_TITLE}
          onClick={() => openUpload(item, true)}
          className={`inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl border border-indigo-200 bg-white px-3 py-1.5 text-left text-[11px] font-semibold leading-tight text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50 ${
            fullWidth ? "w-full" : ""
          }`}
        >
          <ImagePlus className="h-3.5 w-3.5 shrink-0" />
          <span>{STICKER_TITLE}</span>
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
        <CheckCircle2 className="h-8 w-8 text-emerald-500" />
        <p className="text-sm font-semibold text-slate-700">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <>
      {/* MOBILE: compact cards (md se neeche) */}
      <div className="space-y-2 md:hidden">
        {items.map((item) => (
          <div
            key={item.id}
            role="link"
            tabIndex={0}
            onClick={() => openCase(item)}
            onKeyDown={(e) => {
              if (e.key === "Enter") openCase(item);
            }}
            onMouseEnter={() => router.prefetch(`/office/cases/${item.id}`)}
            className={`cursor-pointer space-y-2 rounded-2xl border border-slate-200 p-3 shadow-sm ${rowTint(item)}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              {identityBlock(item)}
              {officeChip(item)}
            </div>
            <p className="text-xs text-slate-500">{item.category?.name || "—"}</p>
            {workInfo(item)}
            {filingMode ? filingActions(item, true) : actionButton(item, true)}
          </div>
        ))}
      </div>

      {/* DESKTOP: table — dept mode ka apna column set (koi money column nahi) */}
      <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
        <table className="min-w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Case</th>
              <th className="px-3 py-2">Category</th>
              <th className="px-3 py-2">Office</th>
              <th className="px-3 py-2">{config.workHeading}</th>
              <th className="px-3 py-2">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.map((item) => (
              <tr
                key={item.id}
                onClick={() => openCase(item)}
                onMouseEnter={() => router.prefetch(`/office/cases/${item.id}`)}
                className={`cursor-pointer ${rowTint(item)}`}
              >
                <td className="px-3 py-3 align-top">{identityBlock(item)}</td>
                <td className="px-3 py-3 align-top text-xs text-slate-600">{item.category?.name || "—"}</td>
                <td className="px-3 py-3 align-top">{officeChip(item)}</td>
                <td className="px-3 py-3 align-top">{workInfo(item)}</td>
                <td className="px-3 py-3 align-top">{filingMode ? filingActions(item) : actionButton(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* §W21: inline filing upload modal — pending row ki filing files ya
          kisi bhi row ka verification sticker yahin se upload hota hai
          (detail page par jaye baghair). */}
      {uploadFor && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          onClick={() => !uploading && setUploadFor(null)}
        >
          <div
            className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {uploadFor.sticker ? STICKER_TITLE : "Filing files upload karein"}
                </h3>
                <p className="text-xs text-slate-500">Case {uploadFor.item.caseNumber}</p>
              </div>
              <button
                type="button"
                onClick={() => setUploadFor(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Band karein"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>
              <label className="mb-1 block text-xs text-slate-500">
                File * {uploadFor.sticker ? "(image / pdf / word)" : "(pdf ya image)"}
              </label>
              <input
                type="file"
                accept={uploadFor.sticker ? ACCEPT_STICKER : ACCEPT_FILING}
                className="w-full text-sm"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </div>
            {uploadFor.sticker ? (
              <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                Title: {STICKER_TITLE} — workflow aage nahi barhega, sirf sticker save hoga.
              </p>
            ) : (
              <div>
                <label className="mb-1 block text-xs text-slate-500">Title (optional)</label>
                <input
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  placeholder="Maslan: Degree front"
                  value={uploadTitle}
                  onChange={(e) => setUploadTitle(e.target.value)}
                />
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                disabled={uploading}
                onClick={() => setUploadFor(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={uploading || !uploadFile}
                onClick={submitUpload}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                Upload
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastElement}
    </>
  );
}
