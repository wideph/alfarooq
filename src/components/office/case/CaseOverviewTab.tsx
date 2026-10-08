"use client";

import { useEffect, useState } from "react";
import {
  BadgePercent,
  Coins,
  Edit,
  HandCoins,
  ImagePlus,
  Loader2,
  MapPin,
  Phone,
  PiggyBank,
  Save,
  Trash2,
  User,
  Wallet,
} from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import SectionCard from "@/components/ui/SectionCard";
import StatTile from "@/components/ui/StatTile";
import EmptyState from "@/components/ui/EmptyState";
import CaseFileViewer from "@/components/office/case/CaseFileViewer";
import { formatMoney, officeFetch } from "@/lib/office/client";
import { type CaseDetail, ghostBtnClass, inputClass, primaryBtnClass } from "@/lib/office/types";
import type { ToastKind } from "@/components/Toast";

type TabProps = {
  detail: CaseDetail;
  admin: AdminNavUser;
  onUpdated: (next: CaseDetail) => void;
  onReload: () => Promise<void>;
  onMessage: (message: string, kind?: ToastKind) => void;
};

// Overview tab: client info (edit), money summary tiles + agreed remarks,
// contacts/addresses compact. Logic pehle CaseInfoCard / CaseContacts /
// CaseMoneyCard (read parts) mein tha.
export default function CaseOverviewTab({ detail, admin, onUpdated, onReload, onMessage }: TabProps) {
  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <ClientInfoPanel detail={detail} admin={admin} onUpdated={onUpdated} onMessage={onMessage} />
        <MoneySummary detail={detail} admin={admin} onUpdated={onUpdated} onMessage={onMessage} />
      </div>
      <ContactsPanel detail={detail} admin={admin} onReload={onReload} onMessage={onMessage} />
    </div>
  );
}

/* ---------------- Client info (view + edit, picture viewer) ---------------- */

type Category = { id: string; name: string; isActive: boolean };

function ClientInfoPanel({ detail, admin, onUpdated, onMessage }: Omit<TabProps, "onReload">) {
  const canEdit = adminCanAny(admin, ["office:cases:write"]);
  const [editing, setEditing] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [saving, setSaving] = useState(false);
  const [picture, setPicture] = useState<File | null>(null);
  const [viewPicture, setViewPicture] = useState(false);
  const [form, setForm] = useState({
    clientName: detail.clientName,
    rollNumber: detail.rollNumber || "",
    registrationNumber: detail.registrationNumber || "",
    categoryId: detail.category?.id || "",
    agreedAmount: String(detail.agreedAmount),
    courierNumber: detail.courierNumber || "",
    notes: detail.notes || "",
  });

  useEffect(() => {
    if (editing && categories.length === 0) {
      officeFetch<Category[]>("/api/office/setup/categories").then((res) => {
        if (res.ok) setCategories(res.data.filter((c) => c.isActive));
      });
    }
  }, [editing, categories.length]);

  const hasRorReg = Boolean(form.rollNumber.trim() || form.registrationNumber.trim());

  async function save() {
    if (!hasRorReg) {
      onMessage("r-number ya reg-number lazmi hai (in men se aik lazmi hai)", "error");
      return;
    }
    setSaving(true);
    if (picture) {
      // Picture ke sath multipart PATCH (parseCaseInput samhal leta hai).
      const fd = new FormData();
      Object.entries(form).forEach(([key, value]) => fd.append(key, value));
      fd.append("clientPicture", picture);
      const res = await fetch(`/api/office/cases/${detail.id}`, { method: "PATCH", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        onUpdated(data as CaseDetail);
        onMessage("Case update ho gaya");
        setEditing(false);
        setPicture(null);
      } else onMessage(data.error || "Update nahi ho saka", "error");
    } else {
      const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}`, { method: "PATCH", json: form });
      if (res.ok) {
        onUpdated(res.data);
        onMessage("Case update ho gaya");
        setEditing(false);
      } else onMessage(res.error, "error");
    }
    setSaving(false);
  }

  return (
    <SectionCard
      icon={User}
      title="Client info"
      actions={
        canEdit &&
        !editing && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 px-3 text-xs font-semibold text-primary-700 hover:border-primary-300"
          >
            <Edit className="h-4 w-4" /> Edit
          </button>
        )
      }
    >
      {!editing ? (
        <div className="flex flex-col gap-4 sm:flex-row">
          {detail.clientPictureUrl && (
            <button onClick={() => setViewPicture(true)} className="shrink-0 self-start" title="Bari tasveer dekhein">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={detail.clientPictureUrl}
                alt="Client"
                className="h-24 w-24 rounded-xl border border-slate-200 object-cover transition hover:opacity-80"
              />
            </button>
          )}
          <dl className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3 text-sm md:grid-cols-3">
            <Row label="Roll number (r-number)" value={detail.rollNumber} />
            <Row label="Registration number" value={detail.registrationNumber} />
            <Row label="Category" value={detail.category?.name} />
            <Row label="Courier number" value={detail.courierNumber} />
            <Row label="Set" value={detail.setName} />
            <Row label="Booking office" value={detail.bookingOffice.name} />
            <div className="col-span-2 md:col-span-3">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Notes / remarks</dt>
              <dd className="whitespace-pre-wrap text-slate-700">{detail.notes || "—"}</dd>
            </div>
          </dl>
        </div>
      ) : (
        <div className="space-y-3">
          <input
            className={inputClass}
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
            placeholder="Client name (optional)"
          />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input
              className={inputClass}
              value={form.rollNumber}
              onChange={(e) => setForm({ ...form, rollNumber: e.target.value })}
              placeholder="R-number (roll)"
            />
            <input
              className={inputClass}
              value={form.registrationNumber}
              onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
              placeholder="Reg-number (registration)"
            />
            <select
              className={inputClass}
              value={form.categoryId}
              onChange={(e) => setForm({ ...form, categoryId: e.target.value })}
            >
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              inputMode="decimal"
              value={form.agreedAmount}
              onChange={(e) => setForm({ ...form, agreedAmount: e.target.value })}
              placeholder="Agreed amount"
            />
            <input
              className={inputClass}
              value={form.courierNumber}
              onChange={(e) => setForm({ ...form, courierNumber: e.target.value })}
              placeholder="Courier number (tracking)"
            />
          </div>
          <p className={`text-xs ${hasRorReg ? "text-slate-400" : "font-semibold text-amber-600"}`}>
            R-number ya reg-number — in men se aik lazmi hai
          </p>
          <textarea
            className={inputClass}
            rows={3}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            placeholder="Notes / remarks"
          />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <ImagePlus className="h-4 w-4 text-primary-600" />
            Client picture {detail.clientPictureUrl ? "replace karein" : "add karein"} (optional)
            <input type="file" accept="image/*" className="text-sm" onChange={(e) => setPicture(e.target.files?.[0] || null)} />
          </label>
          <div className="flex gap-2">
            <button disabled={saving || !hasRorReg} onClick={save} className={`${primaryBtnClass} min-h-[40px]`}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setPicture(null);
              }}
              className={`${ghostBtnClass} min-h-[40px]`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      {viewPicture && detail.clientPictureUrl && (
        <CaseFileViewer
          file={{ url: detail.clientPictureUrl, fileType: "image", title: `Client picture — ${detail.caseNumber}` }}
          onClose={() => setViewPicture(false)}
        />
      )}
    </SectionCard>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="truncate text-slate-800">{value || "—"}</dd>
    </div>
  );
}

/* ---------------- Money summary tiles + agreed remarks ---------------- */

function MoneySummary({ detail, admin, onUpdated, onMessage }: Omit<TabProps, "onReload">) {
  const canEditCase = adminCanAny(admin, ["office:cases:write"]);
  const [agreedRemarks, setAgreedRemarks] = useState(detail.agreedAmountRemarks || "");
  const [busy, setBusy] = useState(false);

  // §N7: agreed amount ke sath remarks (maslan installments ki tafseel).
  async function saveAgreedRemarks() {
    setBusy(true);
    const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}`, {
      method: "PATCH",
      json: { agreedAmountRemarks: agreedRemarks },
    });
    if (res.ok) {
      onUpdated(res.data);
      onMessage("Agreed amount remarks save ho gaye");
    } else onMessage(res.error, "error");
    setBusy(false);
  }

  return (
    <SectionCard icon={Wallet} title="Money summary">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatTile icon={HandCoins} label="Agreed" value={formatMoney(detail.totals.agreedAmount)} />
        <StatTile icon={Coins} label="Received" value={formatMoney(detail.totals.received)} tone="emerald" />
        <StatTile
          icon={PiggyBank}
          label="Remaining"
          value={formatMoney(detail.totals.remaining)}
          tone={detail.totals.remaining > 0 ? "amber" : "slate"}
        />
        {detail.totals.extra > 0 && (
          <StatTile icon={BadgePercent} label="Extra received" value={formatMoney(detail.totals.extra)} tone="violet" />
        )}
        <StatTile icon={Coins} label="Commission" value={formatMoney(detail.commissionAmount)} tone="primary" />
      </div>
      <div className="mt-3">
        {canEditCase ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={inputClass}
              placeholder="Agreed amount remarks (maslan: 2 installments)"
              value={agreedRemarks}
              onChange={(e) => setAgreedRemarks(e.target.value)}
            />
            <button
              disabled={busy || agreedRemarks === (detail.agreedAmountRemarks || "")}
              onClick={saveAgreedRemarks}
              className={`${primaryBtnClass} min-h-[40px] shrink-0`}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Remarks save
            </button>
          </div>
        ) : (
          <p className="text-xs text-slate-500">Remarks: {detail.agreedAmountRemarks || "—"}</p>
        )}
      </div>
    </SectionCard>
  );
}

/* ---------------- Contacts + addresses (compact, inline add) ---------------- */

function ContactsPanel({ detail, admin, onReload, onMessage }: Omit<TabProps, "onUpdated">) {
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
    const res = await officeFetch(`/api/office/cases/${detail.id}/${kind}?${kind === "contacts" ? "contactId" : "addressId"}=${id}`, {
      method: "DELETE",
    });
    onMessage(res.ok ? "Remove ho gaya" : res.error, res.ok ? "success" : "error");
    if (res.ok) await onReload();
  }

  return (
    <div className="space-y-4">
      <SectionCard icon={Phone} title="Contacts" count={detail.contacts.length}>
        {detail.contacts.length === 0 ? (
          <EmptyState icon={Phone} hint="Koi contact number nahi — neeche add karein" />
        ) : (
          <ul className="space-y-1.5 text-sm">
            {detail.contacts.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="min-w-0">
                  <a href={`tel:${c.phone}`} className="font-medium text-slate-800" dir="ltr">
                    {c.phone}
                  </a>
                  {c.label && <span className="ml-2 text-xs text-slate-500">{c.label}</span>}
                </span>
                {canEdit && (
                  <button
                    onClick={() => remove("contacts", c.id)}
                    aria-label="Number remove karein"
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="mt-2 flex gap-2">
            <input className={inputClass} placeholder="03xx-xxxxxxx" value={phone} onChange={(e) => setPhone(e.target.value)} />
            <input
              className={`${inputClass} max-w-[6.5rem]`}
              placeholder="Label"
              value={phoneLabel}
              onChange={(e) => setPhoneLabel(e.target.value)}
            />
            <button
              disabled={busy || !phone.trim()}
              onClick={() => add("contacts")}
              aria-label="Number add karein"
              className={`${primaryBtnClass} min-h-[40px] shrink-0 px-3`}
            >
              +
            </button>
          </div>
        )}
      </SectionCard>

      <SectionCard icon={MapPin} title="Delivery addresses" count={detail.addresses.length}>
        {detail.addresses.length === 0 ? (
          <EmptyState icon={MapPin} hint="Koi delivery address nahi — neeche add karein" />
        ) : (
          <ul className="space-y-1.5 text-sm">
            {detail.addresses.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2">
                <span className="min-w-0 whitespace-pre-wrap">
                  {a.address}
                  {a.label && <span className="ml-2 text-xs text-slate-500">{a.label}</span>}
                </span>
                {canEdit && (
                  <button
                    onClick={() => remove("addresses", a.id)}
                    aria-label="Address remove karein"
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && (
          <div className="mt-2 space-y-2">
            <textarea
              className={inputClass}
              rows={2}
              placeholder="Address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            <div className="flex gap-2">
              <input
                className={inputClass}
                placeholder="Label (home / office)"
                value={addressLabel}
                onChange={(e) => setAddressLabel(e.target.value)}
              />
              <button
                disabled={busy || !address.trim()}
                onClick={() => add("addresses")}
                className={`${primaryBtnClass} min-h-[40px] shrink-0`}
              >
                Add
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
