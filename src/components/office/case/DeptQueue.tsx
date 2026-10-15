"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Building2, CheckCircle2, Flame, Loader2, Upload } from "lucide-react";
import { formatDate } from "@/lib/office/client";
import { caseStatusLabel, caseStatusStyle } from "@/lib/office/labels";

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

  function openCase(item: DeptQueueRow) {
    router.push(`/office/cases/${item.id}`);
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
          </div>
        );
      case "printing":
        return (
          <div className="space-y-1 text-xs">
            <span
              className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
                item.isPrinted ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
              }`}
            >
              {item.isPrinted ? "Printed" : "Not printed"}
            </span>
            <p className="text-slate-500">Expected: {formatDate(item.expectedPrintingDate)}</p>
          </div>
        );
      case "attestation": {
        const step = currentStepName(item);
        const progress = attestationProgress(item);
        return (
          <div className="space-y-1 text-xs">
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
            className="cursor-pointer space-y-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm active:bg-slate-50"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              {identityBlock(item)}
              {officeChip(item)}
            </div>
            <p className="text-xs text-slate-500">{item.category?.name || "—"}</p>
            {workInfo(item)}
            {actionButton(item, true)}
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
                className="cursor-pointer hover:bg-slate-50"
              >
                <td className="px-3 py-3 align-top">{identityBlock(item)}</td>
                <td className="px-3 py-3 align-top text-xs text-slate-600">{item.category?.name || "—"}</td>
                <td className="px-3 py-3 align-top">{officeChip(item)}</td>
                <td className="px-3 py-3 align-top">{workInfo(item)}</td>
                <td className="px-3 py-3 align-top">{actionButton(item)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
