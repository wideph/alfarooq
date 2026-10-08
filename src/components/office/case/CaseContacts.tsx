"use client";

import { useState } from "react";
import { MapPin, Phone, Plus, Trash2 } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import { officeFetch } from "@/lib/office/client";
import { type CaseDetail, inputClass, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

// R1.3 — multiple contact numbers and delivery addresses, any stage.
export default function CaseContacts({
  detail,
  admin,
  onReload,
  onMessage,
}: {
  detail: CaseDetail;
  admin: AdminNavUser;
  onReload: () => Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const canEdit = adminCanAny(admin, ["office:cases:write"]);
  const [phone, setPhone] = useState("");
  const [phoneLabel, setPhoneLabel] = useState("");
  const [address, setAddress] = useState("");
  const [addressLabel, setAddressLabel] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(kind: "contacts" | "addresses") {
    setBusy(true);
    const res = await officeFetch(`/api/office/cases/${detail.id}/${kind}`, {
      method: "POST",
      json: kind === "contacts" ? { phone, label: phoneLabel } : { address, label: addressLabel },
    });
    if (res.ok) {
      onMessage(kind === "contacts" ? "Number add ho gaya" : "Address add ho gaya");
      if (kind === "contacts") {
        setPhone("");
        setPhoneLabel("");
      } else {
        setAddress("");
        setAddressLabel("");
      }
      await onReload();
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  async function remove(kind: "contacts" | "addresses", id: string) {
    const res = await officeFetch(`/api/office/cases/${detail.id}/${kind}?${kind === "contacts" ? "contactId" : "addressId"}=${id}`, { method: "DELETE" });
    onMessage(res.ok ? "Remove ho gaya" : res.error, res.ok ? "success" : "error");
    if (res.ok) await onReload();
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
        <h3 className="flex items-center gap-2 font-bold text-slate-900">
          <Phone className="w-4 h-4 text-primary-600" /> Contact numbers
        </h3>
        <ul className="space-y-1 text-sm">
          {detail.contacts.length === 0 && <li className="text-slate-400">—</li>}
          {detail.contacts.map((c) => (
            <li key={c.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
              <span>
                <a href={`tel:${c.phone}`} className="font-medium text-slate-800" dir="ltr">
                  {c.phone}
                </a>
                {c.label && <span className="ml-2 text-xs text-slate-500">{c.label}</span>}
              </span>
              {canEdit && (
                <button onClick={() => remove("contacts", c.id)} className="rounded-lg p-1 text-red-500 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="flex gap-2">
            <input className={inputClass} placeholder="03xx-xxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input className={`${inputClass} max-w-[7rem]`} placeholder="Label" value={phoneLabel} onChange={(e) => setPhoneLabel(e.target.value)} />
            <button disabled={busy || !phone.trim()} onClick={() => add("contacts")} className={primaryBtnClass}>
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
        <h3 className="flex items-center gap-2 font-bold text-slate-900">
          <MapPin className="w-4 h-4 text-primary-600" /> Delivery addresses
        </h3>
        <ul className="space-y-1 text-sm">
          {detail.addresses.length === 0 && <li className="text-slate-400">—</li>}
          {detail.addresses.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span className="whitespace-pre-wrap">
                {a.address}
                {a.label && <span className="ml-2 text-xs text-slate-500">{a.label}</span>}
              </span>
              {canEdit && (
                <button onClick={() => remove("addresses", a.id)} className="rounded-lg p-1 text-red-500 hover:bg-red-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
        {canEdit && (
          <div className="space-y-2">
            <textarea className={inputClass} rows={2} placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} />
            <div className="flex gap-2">
              <input className={`${inputClass} max-w-[10rem]`} placeholder="Label (home / office)" value={addressLabel} onChange={(e) => setAddressLabel(e.target.value)} />
              <button disabled={busy || !address.trim()} onClick={() => add("addresses")} className={primaryBtnClass}>
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
