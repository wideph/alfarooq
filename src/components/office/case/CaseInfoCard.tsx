"use client";

import { useEffect, useState } from "react";
import { Edit, ImagePlus, Loader2, Save } from "lucide-react";
import type { AdminNavUser } from "@/components/admin/AdminNav";
import { adminCanAny } from "@/components/admin/AdminNav";
import CaseFileViewer from "@/components/office/case/CaseFileViewer";
import { officeFetch } from "@/lib/office/client";
import { type CaseDetail, ghostBtnClass, inputClass, primaryBtnClass } from "@/lib/office/types";

type Category = { id: string; name: string; isActive: boolean };

export default function CaseInfoCard({
  detail,
  admin,
  onUpdated,
  onMessage,
}: {
  detail: CaseDetail;
  admin: AdminNavUser;
  onUpdated: (next: CaseDetail) => void;
  onMessage: (message: string) => void;
}) {
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
      onMessage("r-number ya reg-number lazmi hai (in men se aik lazmi hai)");
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
      } else onMessage(data.error || "Update nahi ho saka");
    } else {
      const res = await officeFetch<CaseDetail>(`/api/office/cases/${detail.id}`, { method: "PATCH", json: form });
      if (res.ok) {
        onUpdated(res.data);
        onMessage("Case update ho gaya");
        setEditing(false);
      } else onMessage(res.error);
    }
    setSaving(false);
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-bold text-slate-900">Case details</h3>
        {canEdit && !editing && (
          <button onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-sm text-primary-700">
            <Edit className="w-4 h-4" /> Edit
          </button>
        )}
      </div>

      {!editing ? (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Row label="Roll number (r-number)" value={detail.rollNumber} />
          <Row label="Registration number" value={detail.registrationNumber} />
          <Row label="Category" value={detail.category?.name} />
          <Row label="Agreed amount" value={`Rs ${detail.agreedAmount}`} />
          <Row label="Courier number" value={detail.courierNumber} />
          <Row label="Set" value={detail.setName} />
          <div className="col-span-2">
            <dt className="text-[11px] font-semibold uppercase text-slate-400">Notes / remarks</dt>
            <dd className="whitespace-pre-wrap text-slate-700">{detail.notes || "—"}</dd>
          </div>
          {detail.clientPictureUrl && (
            <div className="col-span-2">
              <dt className="text-[11px] font-semibold uppercase text-slate-400">Client picture</dt>
              <button onClick={() => setViewPicture(true)} className="mt-1 block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={detail.clientPictureUrl}
                  alt="Client"
                  className="h-24 w-24 rounded-xl border border-slate-200 object-cover hover:opacity-80"
                />
              </button>
            </div>
          )}
        </dl>
      ) : (
        <div className="space-y-3">
          <input className={inputClass} value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} placeholder="Client name (optional)" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input className={inputClass} value={form.rollNumber} onChange={(e) => setForm({ ...form, rollNumber: e.target.value })} placeholder="R-number (roll)" />
            <input
              className={inputClass}
              value={form.registrationNumber}
              onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
              placeholder="Reg-number (registration)"
            />
            <select className={inputClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
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
          <p className={`text-xs ${hasRorReg ? "text-slate-400" : "text-amber-600 font-semibold"}`}>
            R-number ya reg-number — in men se aik lazmi hai
          </p>
          <textarea className={inputClass} rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Notes / remarks" />
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <ImagePlus className="w-4 h-4 text-primary-600" />
            Client picture {detail.clientPictureUrl ? "replace karein" : "add karein"} (optional)
            <input type="file" accept="image/*" className="text-sm" onChange={(e) => setPicture(e.target.files?.[0] || null)} />
          </label>
          <div className="flex gap-2">
            <button disabled={saving || !hasRorReg} onClick={save} className={primaryBtnClass}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setPicture(null);
              }}
              className={ghostBtnClass}
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
    </div>
  );
}

function Row({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase text-slate-400">{label}</dt>
      <dd className="text-slate-800">{value || "—"}</dd>
    </div>
  );
}
