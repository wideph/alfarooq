"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  Copy,
  ExternalLink,
  Eye,
  Flame,
  ImagePlus,
  Loader2,
  MapPin,
  Upload,
  X,
} from "lucide-react";
import FileUploadBox from "@/components/office/case/FileUploadBox";
import { formatDate } from "@/lib/office/client";
import { caseStatusLabel, caseStatusStyle } from "@/lib/office/labels";
import type { UploadResult } from "@/lib/office/upload-files";
import { useToast } from "@/hooks/useToast";
import CustomLabelChip from "@/components/office/case/CustomLabelChip";
import { caseDetailHref } from "@/lib/office/case-nav";

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
  // §W35: super admin ke liye — case unread (naya ya doosri queue mein gaya).
  unread?: boolean;
  // §W44: admin ka custom label.
  customLabel?: string | null;
  customLabelColor?: string | null;
  // §W46: courier queue — delivery address(es), purane pehle.
  addresses?: Array<{ id: string; address: string; label: string | null }>;
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
    // §W47: Delivered page (history) — slip ho chuki, sirf case dekhna.
    historyActionLabel: "Case dekhein",
    empty: "Courier slip ke liye koi case pending nahi",
    historyEmpty: "Abhi koi case delivered nahi",
  },
};

// §W21: filing queue upload — normal files pdf/image; verification sticker
// image/pdf/word bhi accept karta hai.
const ACCEPT_FILING = "application/pdf,.pdf,image/*";
const ACCEPT_STICKER =
  "image/*,application/pdf,.pdf,.doc,.docx,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const STICKER_STEP_KEY = "VERIFICATION_STICKER";
const STICKER_TITLE = "Verification Sticker/Picture of student";
// §W27: printing proof — images / pdf / video (kai files ek sath).
const ACCEPT_PROOF = "application/pdf,.pdf,image/*,video/*";

// Inline upload modal ki qisam: filing files, verification sticker, printing proof.
type UploadKind = "filing" | "sticker" | "printing";
type UploadTarget = { item: DeptQueueRow; kind: UploadKind };

const UPLOAD_MODAL: Record<
  UploadKind,
  {
    heading: string;
    department: "FILING" | "PRINTING";
    accept: string;
    hint: string;
    fixedStepKey?: string;
    fixedTitle?: string;
    note?: string;
  }
> = {
  filing: { heading: "Filing files upload karein", department: "FILING", accept: ACCEPT_FILING, hint: "Pdf ya image" },
  sticker: {
    heading: STICKER_TITLE,
    department: "FILING",
    accept: ACCEPT_STICKER,
    hint: "Image / pdf / word",
    fixedStepKey: STICKER_STEP_KEY,
    fixedTitle: STICKER_TITLE,
    note: `Title: ${STICKER_TITLE} — workflow aage nahi barhega, sirf sticker save hoga.`,
  },
  printing: {
    heading: "Printed proof upload karein",
    department: "PRINTING",
    accept: ACCEPT_PROOF,
    hint: "Printed proof (images / pdf / video)",
    note: "Pehla proof upload hote hi case Printed ho jata hai aur attestation ko chala jata hai.",
  },
};

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

function rollRegText(item: DeptQueueRow) {
  return `${item.rollNumber ? `Roll ${item.rollNumber}` : "Roll —"} · ${
    item.registrationNumber ? `Reg ${item.registrationNumber}` : "Reg —"
  }`;
}

// §W46: courier row mein address ki EK line; lambi ho to "poora" nazar aata
// hai aur click par poore address ka view (row ka case detail click nahi).
function AddressLine({ item, onOpen }: { item: DeptQueueRow; onOpen: () => void }) {
  const textRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);
  const addresses = item.addresses || [];
  const first = addresses[0]?.address || "";

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    const measure = () => setOverflow(el.scrollWidth > el.clientWidth + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [first]);

  if (!first) {
    return (
      <p className="inline-flex items-center gap-1 text-amber-700">
        <MapPin className="h-3.5 w-3.5 shrink-0" /> Delivery address abhi nahi
      </p>
    );
  }
  const more = addresses.length - 1;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onOpen();
      }}
      title="Poora address dekhein"
      className="flex w-full max-w-[20rem] items-center gap-1 rounded-lg text-left text-slate-700 hover:text-primary-700"
    >
      <MapPin className="h-3.5 w-3.5 shrink-0 text-teal-600" />
      <span ref={textRef} className="min-w-0 truncate">
        {first}
      </span>
      {(overflow || more > 0) && (
        <span className="shrink-0 font-semibold text-primary-700">{more > 0 ? `+${more} · poora` : "poora"}</span>
      )}
    </button>
  );
}

export default function DeptQueue({
  dept,
  items,
  loading,
  history = false,
  from,
  readControl,
}: {
  dept: DeptQueueKey;
  items: DeptQueueRow[];
  loading: boolean;
  history?: boolean;
  // §W34: ye queue (path + query) — detail page se wapsi isi tab par.
  from?: string;
  // §W35: super admin ka har row par Read button (cases page deta hai).
  readControl?: (item: DeptQueueRow) => ReactNode;
}) {
  const router = useRouter();
  const config = DEPT_CONFIG[dept];
  const actionLabel = history && config.historyActionLabel ? config.historyActionLabel : config.actionLabel;
  const emptyMessage = history && config.historyEmpty ? config.historyEmpty : config.empty;

  // §W21: filing mode (history nahi) — done rows bhi dikhti hain (emerald tint),
  // pending rows amber tint; inline upload modal se hi filing complete hoti hai.
  const filingMode = dept === "filing" && !history;
  const { showToast, ToastElement } = useToast();
  const [uploadFor, setUploadFor] = useState<UploadTarget | null>(null);
  // FileUploadBox ka busy — upload ke dauran modal band na ho.
  const [uploading, setUploading] = useState(false);
  // Upload ke foran baad row foran done-color ho jaye (live-refresh 300ms mein
  // server truth la deta hai — ye sirf instant feedback hai).
  const [localFiling, setLocalFiling] = useState<Record<string, { done: boolean; count: number }>>({});
  // §W27: printing queue — proof upload ke foran baad row "Printed" (live
  // refresh ke baad row queue se hat jati hai kyun ke case PRINTED ho gaya).
  const [localPrinted, setLocalPrinted] = useState<Record<string, boolean>>({});
  // §W46: courier — poore address ka view (case pehchan ke saath).
  const [addressFor, setAddressFor] = useState<DeptQueueRow | null>(null);

  async function copyAddress(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      showToast("Address copy ho gaya");
    } catch {
      showToast("Copy nahi ho saka — address select kar ke copy karein", "error");
    }
  }

  const detailHref = (id: string) => caseDetailHref(id, from);

  function openCase(item: DeptQueueRow) {
    router.push(detailHref(item.id));
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

  function openUpload(item: DeptQueueRow, kind: UploadKind) {
    setUploadFor({ item, kind });
  }

  // §W26: FileUploadBox (kai files, browser se seedha R2) upload + office:changed
  // announce khud karta hai; yahan sirf row ka instant done-state + modal band.
  function handleUploaded(target: UploadTarget, result: UploadResult) {
    if (result.saved > 0) {
      if (target.kind === "filing") {
        const { count } = filingState(target.item);
        setLocalFiling((prev) => ({ ...prev, [target.item.id]: { done: true, count: count + result.saved } }));
      } else if (target.kind === "printing") {
        setLocalPrinted((prev) => ({ ...prev, [target.item.id]: true }));
      }
    }
    // Kuch files fail hon to modal khula rahe (retry ke liye list mein hain).
    if (result.failed === 0) setUploadFor(null);
  }

  function isPrinted(item: DeptQueueRow) {
    // §W23: chip STATUS se decide hota hai, isPrinted flag se nahi —
    // AF-2026-000016 jaisa stale state (status WAITING_FOR_PRINTING magar
    // isPrinted=true) ghalat "Printed" dikhata tha.
    return Boolean(localPrinted[item.id]) || (item.status !== "WAITING_FOR_PRINTING" && Boolean(item.isPrinted));
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
    // §W46: ek hi block — mobile card ke flex header mein case #, naam,
    // Roll / Reg aur date upar neeche rehte hain (bikharte nahi).
    return (
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-primary-700">{item.caseNumber}</span>
          <CustomLabelChip label={item.customLabel} color={item.customLabelColor} />
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
        {item.clientName ? (
          <p className="mt-0.5 truncate text-sm font-bold text-slate-800">{item.clientName}</p>
        ) : (
          dept === "courier" && <p className="mt-0.5 text-sm text-slate-400">Naam —</p>
        )}
        {/* §W46: courier list mein case number ke saath Roll / Reg bhi */}
        {dept === "courier" && <p className="text-xs font-semibold text-slate-600">{rollRegText(item)}</p>}
        {item.createdAt && <p className="text-xs text-slate-400">{formatDate(item.createdAt)}</p>}
      </div>
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
        // §W47: "Not printed" chip hata diya — status chip ("Waiting for
        // printing") wahi baat keh raha tha; upload ke baad ka ✓ action
        // column mein hai.
        return (
          <div className="space-y-1 text-xs">
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
            <AddressLine item={item} onOpen={() => setAddressFor(item)} />
            {/* §W47: "Courier pending / Delivered" chip hata diya — status chip
                aur page (Waiting / Delivered) wahi batate hain. */}
            {item.courierNumber && (
              <p className="text-slate-600">
                Courier #: <span className="font-semibold text-slate-800">{item.courierNumber}</span>
              </p>
            )}
          </div>
        );
    }
  }

  function actionButton(item: DeptQueueRow, fullWidth = false) {
    return (
      <Link
        href={detailHref(item.id)}
        onClick={stopRowClick}
        onMouseEnter={() => router.prefetch(detailHref(item.id))}
        className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl bg-primary-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-primary-700 ${
          fullWidth ? "w-full" : ""
        }`}
      >
        {/* §W47: "Case dekhein" (history / delivered) par upload ka icon nahi. */}
        {history && config.historyActionLabel ? <Eye className="h-3.5 w-3.5" /> : <Upload className="h-3.5 w-3.5" />}{" "}
        {actionLabel}
      </Link>
    );
  }

  // §W27: printing queue — "Printed proof upload karein" ab detail page par
  // nahi le jata; isi jagah modal khulta hai (kai images / pdf / video ek sath).
  // Row par click (button ke bahar) pehle ki tarah case detail kholta hai.
  function printingActions(item: DeptQueueRow, fullWidth = false) {
    const printed = isPrinted(item);
    return (
      <div
        className={`flex flex-col gap-1.5 ${fullWidth ? "w-full" : "min-w-[11rem]"}`}
        onClick={stopRowClick}
        onMouseEnter={stopRowClick}
      >
        {printed && (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
            <BadgeCheck className="h-3.5 w-3.5" /> Proof upload ho gaya ✓
          </span>
        )}
        <button
          type="button"
          onClick={() => openUpload(item, "printing")}
          className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold ${
            printed
              ? "border border-primary-200 bg-white text-primary-700 hover:bg-primary-50"
              : "bg-primary-600 text-white hover:bg-primary-700"
          } ${fullWidth ? "w-full" : ""}`}
        >
          <Upload className="h-3.5 w-3.5" /> {printed ? "Aur proof add karein" : actionLabel}
        </button>
      </div>
    );
  }

  function rowActions(item: DeptQueueRow, fullWidth = false) {
    const actions = filingMode
      ? filingActions(item, fullWidth)
      : dept === "printing" && !history
        ? printingActions(item, fullWidth)
        : actionButton(item, fullWidth);
    if (!readControl) return actions;
    return (
      <div className={`flex flex-col gap-1.5 ${fullWidth ? "w-full" : "items-start"}`}>
        {actions}
        {readControl(item)}
      </div>
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
            onClick={() => openUpload(item, "filing")}
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
          onClick={() => openUpload(item, "sticker")}
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
            onMouseEnter={() => router.prefetch(detailHref(item.id))}
            className={`cursor-pointer space-y-2 rounded-2xl border border-slate-200 p-3 shadow-sm ${rowTint(item)}`}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              {identityBlock(item)}
              {officeChip(item)}
            </div>
            <p className="text-xs text-slate-500">{item.category?.name || "—"}</p>
            {workInfo(item)}
            {rowActions(item, true)}
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
                onMouseEnter={() => router.prefetch(detailHref(item.id))}
                className={`cursor-pointer ${rowTint(item)}`}
              >
                <td className="px-3 py-3 align-top">{identityBlock(item)}</td>
                <td className="px-3 py-3 align-top text-xs text-slate-600">{item.category?.name || "—"}</td>
                <td className="px-3 py-3 align-top">{officeChip(item)}</td>
                <td className="px-3 py-3 align-top">{workInfo(item)}</td>
                <td className="px-3 py-3 align-top">{rowActions(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* §W21: inline upload modal — pending row ki filing files, kisi bhi row
          ka verification sticker, aur (§W27) printing proof yahin se upload
          hota hai (detail page par jaye baghair). */}
      {uploadFor && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          onClick={() => !uploading && setUploadFor(null)}
        >
          <div
            className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-lg font-bold text-slate-900">{UPLOAD_MODAL[uploadFor.kind].heading}</h3>
                <p className="text-xs text-slate-500">
                  Case {uploadFor.item.caseNumber}
                  {uploadFor.item.clientName ? ` · ${uploadFor.item.clientName}` : ""}
                </p>
                {uploadFor.kind === "printing" && (
                  <p className="text-xs text-slate-500">
                    {uploadFor.item.rollNumber ? `Roll ${uploadFor.item.rollNumber}` : "Roll —"} ·{" "}
                    {uploadFor.item.registrationNumber ? `Reg ${uploadFor.item.registrationNumber}` : "Reg —"}
                  </p>
                )}
              </div>
              <button
                type="button"
                disabled={uploading}
                onClick={() => setUploadFor(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
                aria-label="Band karein"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {UPLOAD_MODAL[uploadFor.kind].note && (
              <p className="rounded-xl bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
                {UPLOAD_MODAL[uploadFor.kind].note}
              </p>
            )}
            {/* §W26: kai files ek sath (direct R2 upload + progress) */}
            <FileUploadBox
              key={`${uploadFor.item.id}-${uploadFor.kind}`}
              caseId={uploadFor.item.id}
              department={UPLOAD_MODAL[uploadFor.kind].department}
              accept={UPLOAD_MODAL[uploadFor.kind].accept}
              fixedStepKey={UPLOAD_MODAL[uploadFor.kind].fixedStepKey}
              fixedTitle={UPLOAD_MODAL[uploadFor.kind].fixedTitle}
              hint={UPLOAD_MODAL[uploadFor.kind].hint}
              onUploaded={(result) => handleUploaded(uploadFor, result)}
              onMessage={showToast}
              onBusyChange={setUploading}
              stacked
            />
            <div className="flex justify-end">
              <button
                type="button"
                disabled={uploading}
                onClick={() => setUploadFor(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
              >
                Band karein
              </button>
            </div>
          </div>
        </div>
      )}

      {/* §W46: poora delivery address — case number, naam, Roll / Reg ke saath */}
      {addressFor && (
        <div
          className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-900/40 p-4 sm:items-center"
          onClick={() => setAddressFor(null)}
        >
          <div
            role="dialog"
            aria-label="Delivery address"
            className="max-h-[90vh] w-full max-w-md space-y-4 overflow-y-auto rounded-2xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <h3 className="flex items-center gap-2 text-lg font-bold text-slate-900">
                <MapPin className="h-5 w-5 text-teal-600" /> Delivery address
              </h3>
              <button
                type="button"
                onClick={() => setAddressFor(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                aria-label="Band karein"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 rounded-xl bg-slate-50 p-3 text-sm">
              <dt className="text-slate-500">Case #</dt>
              <dd className="flex flex-wrap items-center gap-1.5 font-semibold text-primary-700">
                {addressFor.caseNumber}
                <CustomLabelChip label={addressFor.customLabel} color={addressFor.customLabelColor} />
              </dd>
              <dt className="text-slate-500">Student</dt>
              <dd className="font-bold text-slate-900">{addressFor.clientName || "—"}</dd>
              <dt className="text-slate-500">Roll #</dt>
              <dd className="font-semibold text-slate-800">{addressFor.rollNumber || "—"}</dd>
              <dt className="text-slate-500">Reg #</dt>
              <dd className="font-semibold text-slate-800">{addressFor.registrationNumber || "—"}</dd>
              {addressFor.category?.name && (
                <>
                  <dt className="text-slate-500">Category</dt>
                  <dd className="text-slate-700">{addressFor.category.name}</dd>
                </>
              )}
              {addressFor.bookingOffice?.name && (
                <>
                  <dt className="text-slate-500">Office</dt>
                  <dd className="text-slate-700">{addressFor.bookingOffice.name}</dd>
                </>
              )}
            </dl>
            <ul className="space-y-2">
              {(addressFor.addresses || []).map((row, index) => (
                <li key={row.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                      {row.label || ((addressFor.addresses || []).length > 1 ? `Address ${index + 1}` : "Address")}
                    </span>
                    <button
                      type="button"
                      onClick={() => void copyAddress(row.address)}
                      className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-primary-700 hover:bg-primary-50"
                    >
                      <Copy className="h-3.5 w-3.5" /> Copy
                    </button>
                  </div>
                  <p className="whitespace-pre-line break-words text-sm text-slate-900">{row.address}</p>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-end gap-2">
              <Link
                href={detailHref(addressFor.id)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-4 py-2 text-sm font-semibold text-primary-700 hover:bg-primary-100"
              >
                <ExternalLink className="h-4 w-4" /> Case detail
              </Link>
              <button
                type="button"
                onClick={() => setAddressFor(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
              >
                Band karein
              </button>
            </div>
          </div>
        </div>
      )}

      {ToastElement}
    </>
  );
}
