"use client";

import { useState } from "react";
import { CheckCircle2, Circle, ImageIcon, Loader2, PackagePlus, Plus } from "lucide-react";
import SectionCard from "@/components/ui/SectionCard";
import type { ToastKind } from "@/components/Toast";
import { formatDate, formatMoney, officeFetch } from "@/lib/office/client";
import type { CaseDetail, CaseServiceItem } from "@/lib/office/types";
import ExtraServiceModal from "@/components/office/case/ExtraServiceModal";

// §W56 — case par extra services: har booking ka naam, amount, hissay (✓ ho
// gaya / baqi), reissue ke remarks + tasveer. Admin: Musadiqa "Attested",
// custom "Complete", ya service cancel (amount agreed se wapas). Department
// worker ko raqam nahi (amount 0 aata hai, dikhate nahi).
export default function CaseServicesPanel({
  detail,
  canBook,
  isAdmin,
  showAmounts,
  onUpdated,
  onMessage,
}: {
  detail: CaseDetail;
  canBook: boolean;
  isAdmin: boolean;
  showAmounts: boolean;
  onUpdated: (next: CaseDetail) => void;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const [booking, setBooking] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const services = detail.services ?? [];

  async function act(service: CaseServiceItem, action: "musadiqa-attested" | "custom-done" | "cancel") {
    if (action === "cancel" && !confirm(`"${service.name}" cancel karein? Amount (${formatMoney(service.amount)}) agreed se wapas ho jayegi; kiya hua kaam waisa hi rahega.`)) return;
    setBusy(`${service.id}:${action}`);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/services`, {
      method: "PATCH",
      json: { serviceId: service.id, action },
    });
    setBusy(null);
    if (!res.ok) {
      onMessage(res.error, "error");
      return;
    }
    onUpdated(res.data);
    onMessage(
      action === "musadiqa-attested"
        ? "Musadiqa attested mark ho gaya"
        : action === "custom-done"
          ? `${service.customName} — Complete`
          : "Service cancel ho gayi"
    );
  }

  if (services.length === 0 && !canBook) return null;

  return (
    <SectionCard
      icon={PackagePlus}
      title="Extra services"
      count={services.length || null}
      actions={
        canBook ? (
          <button
            type="button"
            onClick={() => setBooking(true)}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-primary-600 px-3 text-xs font-semibold text-white hover:bg-primary-700"
          >
            <Plus className="h-4 w-4" /> Extra service book karein
          </button>
        ) : null
      }
    >
      {services.length === 0 ? (
        <p className="text-sm text-slate-400">
          Abhi koi extra service nahi — reissue, attestation, musadiqa ya koi aur kaam yahan se book karein.
        </p>
      ) : (
        <ul className="space-y-2">
          {services.map((service) => {
            const cancelled = service.status === "CANCELLED";
            return (
              <li key={service.id} className={`rounded-xl border p-3 ${cancelled ? "border-slate-100 bg-slate-50 opacity-70" : "border-slate-200"}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className={`font-semibold text-slate-900 ${cancelled ? "line-through" : ""}`}>{service.name}</p>
                    <p className="text-xs text-slate-500">
                      {formatDate(service.createdAt)}
                      {service.createdByName ? ` · ${service.createdByName}` : ""}
                      {cancelled ? " · cancel" : service.done ? " · mukammal ✓" : ""}
                    </p>
                  </div>
                  {showAmounts && <span className="font-bold text-slate-900">{formatMoney(service.amount)}</span>}
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {service.parts.map((part) => (
                    <span
                      key={part.key}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                        part.done ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {part.done ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}
                      {part.label}
                      {part.key === "musadiqa" && (part.done ? " — attested" : " — applied")}
                    </span>
                  ))}
                </div>
                {service.remarks && (
                  <p className="mt-2 rounded-lg bg-slate-50 px-2.5 py-1.5 text-xs text-slate-700">
                    <b>Remarks:</b> {service.remarks}
                  </p>
                )}
                {service.hasImage && (
                  <a
                    href={`/api/office/cases/${detail.id}/services/${service.id}/image`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary-700 hover:underline"
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> Reissue ki nayi tasveer dekhein
                  </a>
                )}
                {isAdmin && !cancelled && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {service.musadiqa && service.musadiqaStatus !== "ATTESTED" && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void act(service, "musadiqa-attested")}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {busy === `${service.id}:musadiqa-attested` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        Musadiqa attested
                      </button>
                    )}
                    {service.customName && !service.customDone && (
                      <button
                        type="button"
                        disabled={busy !== null}
                        onClick={() => void act(service, "custom-done")}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-emerald-600 px-3 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        {busy === `${service.id}:custom-done` && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                        {service.customName} — Complete
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void act(service, "cancel")}
                      className="inline-flex min-h-[34px] items-center rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-600 disabled:opacity-50"
                    >
                      Cancel service
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {booking && <ExtraServiceModal detail={detail} onClose={() => setBooking(false)} onBooked={onUpdated} onMessage={onMessage} />}
    </SectionCard>
  );
}
