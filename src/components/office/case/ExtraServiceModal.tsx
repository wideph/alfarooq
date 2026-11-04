"use client";

import { useEffect, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { formatMoney, officeFetch } from "@/lib/office/client";
import { announceOfficeChange } from "@/lib/office/live";
import { formatFileSize, prepareFileForServer } from "@/lib/office/upload-files";
import type { CaseDetail } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

// §W56 — booking office (ya admin) case banne ke baad EXTRA SERVICE book karta
// hai: ek booking mein kai hissay + ek amount (case ke agreed mein judti hai).
//   Document reissue → case dobara filing par (filing ke liye remarks LAZMI,
//     nayi tasveer optional)
//   Attestations → chuni hui attestations (pehle se hon to dobara), date AI se
//   Musadiqa → admin ko remark, Musadiqa queue
//   Custom → admin ko remark, admin "<naam> Complete"
type AttestationTypeOption = { id: string; name: string; isActive: boolean };

export default function ExtraServiceModal({
  detail,
  onClose,
  onBooked,
  onMessage,
}: {
  detail: CaseDetail;
  onClose: () => void;
  onBooked: (next: CaseDetail) => void;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const [types, setTypes] = useState<AttestationTypeOption[]>([]);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [reissue, setReissue] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [attestationIds, setAttestationIds] = useState<string[]>([]);
  const [musadiqa, setMusadiqa] = useState(false);
  const [custom, setCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    officeFetch<AttestationTypeOption[]>("/api/office/setup/attestation-types").then((res) => {
      if (res.ok) setTypes(res.data.filter((type) => type.isActive));
    });
  }, []);

  const existing = new Set(detail.attestations.map((row) => row.attestationType.id));
  const amountNumber = Number(amount.replace(/,/g, ""));
  const hasPart = reissue || attestationIds.length > 0 || musadiqa || (custom && customName.trim() !== "");

  function toggleAttestation(id: string) {
    setAttestationIds((prev) => (prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]));
  }

  async function submit() {
    if (amount.trim() === "" || !Number.isFinite(amountNumber) || amountNumber < 0) {
      onMessage("Extra service ki amount likhein", "error");
      return;
    }
    if (!hasPart) {
      onMessage("Kam az kam ek hissa chunein", "error");
      return;
    }
    if (reissue && !remarks.trim()) {
      onMessage("Reissue par filing department ke liye remarks lazmi hain", "error");
      return;
    }
    setSaving(true);
    const fields: Record<string, string> = {
      name: name.trim(),
      amount: amount.trim().replace(/,/g, ""),
      reissue: reissue ? "true" : "",
      remarks: remarks.trim(),
      attestationTypeIds: JSON.stringify(attestationIds),
      musadiqa: musadiqa ? "true" : "",
      customName: custom ? customName.trim() : "",
    };
    let ok = false;
    let error = "";
    let data: CaseDetail | null = null;
    if (image && reissue) {
      // Badi phone photo → browser mein chhoti (server ki 4.5 MB limit).
      const prepared = await prepareFileForServer(image);
      if (!prepared.file) {
        setSaving(false);
        onMessage(prepared.error, "error");
        return;
      }
      const form = new FormData();
      Object.entries(fields).forEach(([key, value]) => form.append(key, value));
      form.append("image", prepared.file);
      try {
        const res = await fetch(`/api/office/cases/${detail.id}/services`, { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));
        ok = res.ok;
        if (ok) {
          data = body as CaseDetail;
          announceOfficeChange();
        } else error = body.error || (res.status === 413 ? "Tasveer server ki limit se badi hai" : "Extra service book nahi hui");
      } catch {
        error = "Internet / server se rabta nahi ho saka — dobara koshish karein";
      }
    } else {
      const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}/services`, { method: "POST", json: fields });
      ok = res.ok;
      if (res.ok) data = res.data;
      else error = res.error;
    }
    setSaving(false);
    if (!ok || !data) {
      onMessage(error, "error");
      return;
    }
    onMessage(
      reissue
        ? "Extra service book ho gayi — case dobara filing par chala gaya"
        : "Extra service book ho gayi — amount case ke agreed mein jud gayi"
    );
    onBooked(data);
    onClose();
  }

  const box = "rounded-xl border border-slate-200 p-3";
  const input =
    "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-slate-900/50 p-0 sm:items-center sm:p-4" onClick={() => !saving && onClose()}>
      <div
        role="dialog"
        aria-label="Extra service book karein"
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white p-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Extra service — {detail.caseNumber}</h3>
            <p className="text-xs text-slate-500">
              Jo kaam chahiye wo chunein, upar ek amount — case ki kul agreed amount mein jud jayegi.
            </p>
          </div>
          <button type="button" onClick={onClose} disabled={saving} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100" aria-label="Band karein">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_9rem]">
            <input className={input} placeholder="Naam (optional) — maslan Reissue + Board" value={name} onChange={(e) => setName(e.target.value)} />
            <input className={input} inputMode="decimal" placeholder="Amount (Rs) *" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>

          {/* §W57 — remarks / tasveer checkbox ke <label> se BAHAR: label ke andar
              file input ka click (preventDefault) file picker khulne nahi deta tha. */}
          <div className={`${box} space-y-2 ${reissue ? "border-primary-300 bg-primary-50/40" : ""}`}>
            <label className="flex cursor-pointer gap-3">
              <input type="checkbox" checked={reissue} onChange={(e) => setReissue(e.target.checked)} className="mt-1" />
              <span className="flex-1">
                <span className="block text-sm font-bold text-slate-900">Document reissue</span>
                <span className="block text-xs text-slate-500">
                  Case dobara filing department ke paas jayega → print → (attestation agar chuni) → courier.
                </span>
              </span>
            </label>
            {reissue && (
              <div className="space-y-2 pl-7">
                <textarea
                  className={input}
                  rows={3}
                  placeholder="Filing department ke liye remarks (lazmi) — kya theek / dobara karna hai?"
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                  <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 font-semibold text-slate-700 hover:bg-slate-50">
                    <ImagePlus className="h-4 w-4" />
                    {image ? "Tasveer badlein" : "Nayi tasveer (optional)"}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="sr-only"
                      onChange={(e) => {
                        setImage(e.target.files?.[0] ?? null);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {image && (
                    <span className="inline-flex min-w-0 items-center gap-1 rounded-lg bg-slate-100 px-2 py-1">
                      <span className="max-w-[12rem] truncate">{image.name}</span>
                      <span className="text-slate-400">({formatFileSize(image.size)})</span>
                      <button type="button" onClick={() => setImage(null)} className="text-slate-400 hover:text-rose-600" aria-label="Tasveer hatayein">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className={box}>
            <p className="text-sm font-bold text-slate-900">Attestations</p>
            <p className="mb-2 text-xs text-slate-500">
              Jo attestation chahiye tick karein — date AI working-day engine khud rakhega. &quot;Dobara&quot; = pehle ho
              chuki, phir se hogi.
            </p>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {types.length === 0 && <span className="text-xs text-slate-400">Load ho rahi hain…</span>}
              {types.map((type) => (
                <label key={type.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-slate-50">
                  <input type="checkbox" checked={attestationIds.includes(type.id)} onChange={() => toggleAttestation(type.id)} />
                  <span className="min-w-0 flex-1 truncate">{type.name}</span>
                  {existing.has(type.id) && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">dobara</span>
                  )}
                </label>
              ))}
            </div>
          </div>

          <label className={`${box} flex cursor-pointer gap-3`}>
            <input type="checkbox" checked={musadiqa} onChange={(e) => setMusadiqa(e.target.checked)} className="mt-1" />
            <span>
              <span className="block text-sm font-bold text-slate-900">Musadiqa</span>
              <span className="block text-xs text-slate-500">Admin ko paigham jayega ke is case ne musadiqa apply kar diya.</span>
            </span>
          </label>

          <div className={`${box} space-y-2`}>
            <label className="flex cursor-pointer gap-3">
              <input type="checkbox" checked={custom} onChange={(e) => setCustom(e.target.checked)} className="mt-1" />
              <span>
                <span className="block text-sm font-bold text-slate-900">Custom service</span>
                <span className="block text-xs text-slate-500">Koi aur kaam — admin ko paigham; kaam ho jane par admin &quot;Complete&quot; karega.</span>
              </span>
            </label>
            {custom && (
              <input className={input} placeholder="Service ka naam (maslan Embassy appointment)" value={customName} onChange={(e) => setCustomName(e.target.value)} />
            )}
          </div>

          {Number.isFinite(amountNumber) && amount.trim() !== "" && (
            <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
              Kul agreed: {formatMoney(detail.agreedAmount)} → <b>{formatMoney(detail.agreedAmount + amountNumber)}</b>
            </p>
          )}
        </div>

        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-100 bg-white p-4">
          <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !hasPart}
            className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Book karein
          </button>
        </div>
      </div>
    </div>
  );
}
