"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, Plus, Save, Trash2 } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import { officeFetch } from "@/lib/office/client";

type Office = { id: string; name: string; type: string; isActive: boolean };
type Category = { id: string; name: string; defaultAmount: number | null; isActive: boolean };
type AttestationType = { id: string; name: string; isActive: boolean };

const input =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

export default function NewCasePage() {
  const router = useRouter();
  const [offices, setOffices] = useState<Office[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [types, setTypes] = useState<AttestationType[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [picture, setPicture] = useState<File | null>(null);
  const [form, setForm] = useState({
    bookingOfficeId: "",
    clientName: "",
    categoryId: "",
    rollNumber: "",
    registrationNumber: "",
    agreedAmount: "",
    agreedAmountRemarks: "",
    notes: "",
    attestationTypeIds: [] as string[],
    contacts: [{ phone: "", label: "" }],
    addresses: [{ address: "", label: "" }],
  });

  useEffect(() => {
    Promise.all([
      officeFetch<Office[]>("/api/office/setup/booking-offices"),
      officeFetch<Category[]>("/api/office/setup/categories"),
      officeFetch<AttestationType[]>("/api/office/setup/attestation-types"),
    ]).then(([o, c, t]) => {
      if (o.ok) {
        const active = o.data.filter((x) => x.isActive);
        setOffices(active);
        if (active.length === 1) setForm((prev) => ({ ...prev, bookingOfficeId: active[0].id }));
      }
      if (c.ok) setCategories(c.data.filter((x) => x.isActive));
      if (t.ok) setTypes(t.data.filter((x) => x.isActive));
    });
  }, []);

  function pickCategory(categoryId: string) {
    const category = categories.find((c) => c.id === categoryId);
    setForm((prev) => ({
      ...prev,
      categoryId,
      agreedAmount:
        prev.agreedAmount || category?.defaultAmount === null || category?.defaultAmount === undefined
          ? prev.agreedAmount
          : String(category.defaultAmount),
    }));
  }

  function toggleType(id: string) {
    setForm((prev) => ({
      ...prev,
      attestationTypeIds: prev.attestationTypeIds.includes(id)
        ? prev.attestationTypeIds.filter((x) => x !== id)
        : [...prev.attestationTypeIds, id],
    }));
  }

  const hasRorReg = Boolean(form.rollNumber.trim() || form.registrationNumber.trim());

  async function submit() {
    setError("");
    // §N7: r-number ya reg-number — in men se aik lazmi hai (client-side check).
    if (!hasRorReg) {
      setError("r-number ya reg-number lazmi hai (in men se aik lazmi hai)");
      return;
    }
    setSaving(true);
    // Multipart (client picture ki waja se) — parseCaseInput array fields ko
    // JSON strings ki soorat mein accept karta hai.
    const fd = new FormData();
    fd.append("bookingOfficeId", form.bookingOfficeId);
    fd.append("clientName", form.clientName);
    fd.append("categoryId", form.categoryId);
    fd.append("rollNumber", form.rollNumber);
    fd.append("registrationNumber", form.registrationNumber);
    fd.append("agreedAmount", form.agreedAmount);
    fd.append("agreedAmountRemarks", form.agreedAmountRemarks);
    fd.append("notes", form.notes);
    fd.append("contacts", JSON.stringify(form.contacts));
    fd.append("addresses", JSON.stringify(form.addresses));
    fd.append("attestationTypeIds", JSON.stringify(form.attestationTypeIds));
    if (picture) fd.append("clientPicture", picture);
    const res = await fetch("/api/office/cases", { method: "POST", body: fd });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.id) {
      router.push(`/office/cases/${data.id}`);
      return;
    }
    setError(data.error || "Case save nahi ho saka");
    setSaving(false);
  }

  return (
    <OfficePageFrame requiredAny={["office:cases:write"]}>
      {(admin) => (
        <div className="max-w-3xl space-y-6">
          <h2 className="text-xl font-bold text-slate-900">New case</h2>
          {error && <p className="rounded-xl bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
            {admin.role !== "booking_office" && (
              <div>
                <label className="block text-xs text-slate-500 mb-1">Booking office *</label>
                <select
                  className={input}
                  value={form.bookingOfficeId}
                  onChange={(e) => setForm({ ...form, bookingOfficeId: e.target.value })}
                >
                  <option value="">Select karein…</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-500 mb-1">Client / student name (optional)</label>
              <input className={input} value={form.clientName} onChange={(e) => setForm({ ...form, clientName: e.target.value })} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Category</label>
                <select className={input} value={form.categoryId} onChange={(e) => pickCategory(e.target.value)}>
                  <option value="">—</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">R-number (roll number)</label>
                <input className={input} value={form.rollNumber} onChange={(e) => setForm({ ...form, rollNumber: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Reg-number (registration)</label>
                <input
                  className={input}
                  value={form.registrationNumber}
                  onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                />
              </div>
            </div>
            <p className={`text-xs ${hasRorReg ? "text-slate-400" : "text-amber-600 font-semibold"}`}>
              R-number ya reg-number — in men se aik lazmi hai
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Agreed total amount (Rs)</label>
                <input
                  className={input}
                  inputMode="decimal"
                  value={form.agreedAmount}
                  onChange={(e) => setForm({ ...form, agreedAmount: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Agreed amount remarks (optional)</label>
                <input
                  className={input}
                  value={form.agreedAmountRemarks}
                  onChange={(e) => setForm({ ...form, agreedAmountRemarks: e.target.value })}
                  placeholder="Maslan: 2 installments mein"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Remarks (optional)</label>
              <textarea className={input} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
            </div>
            <div>
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <ImagePlus className="w-4 h-4 text-primary-600" />
                Client picture (optional — image)
                <input
                  type="file"
                  accept="image/*"
                  className="text-sm"
                  onChange={(e) => setPicture(e.target.files?.[0] || null)}
                />
              </label>
              {picture && <p className="mt-1 text-xs text-slate-400">{picture.name}</p>}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
            <p className="font-semibold text-slate-800">Required attestations</p>
            {types.length === 0 ? (
              <p className="text-sm text-slate-400">Koi attestation type set nahi hai (Setup se add karein)</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {types.map((t) => (
                  <label
                    key={t.id}
                    className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${
                      form.attestationTypeIds.includes(t.id)
                        ? "border-primary-500 bg-primary-50 text-primary-700"
                        : "border-slate-200 text-slate-600"
                    }`}
                  >
                    <input type="checkbox" className="hidden" checked={form.attestationTypeIds.includes(t.id)} onChange={() => toggleType(t.id)} />
                    {t.name}
                  </label>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-2">
              <p className="font-semibold text-slate-800">Contact numbers</p>
              {form.contacts.map((c, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    className={input}
                    placeholder="03xx-xxxxxxx"
                    value={c.phone}
                    onChange={(e) => {
                      const contacts = [...form.contacts];
                      contacts[i] = { ...c, phone: e.target.value };
                      setForm({ ...form, contacts });
                    }}
                  />
                  <input
                    className={`${input} max-w-[7rem]`}
                    placeholder="Label"
                    value={c.label}
                    onChange={(e) => {
                      const contacts = [...form.contacts];
                      contacts[i] = { ...c, label: e.target.value };
                      setForm({ ...form, contacts });
                    }}
                  />
                  <button
                    className="rounded-xl bg-red-50 px-2 text-red-600"
                    onClick={() => setForm({ ...form, contacts: form.contacts.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                className="inline-flex items-center gap-1 text-sm text-primary-700"
                onClick={() => setForm({ ...form, contacts: [...form.contacts, { phone: "", label: "" }] })}
              >
                <Plus className="w-4 h-4" /> Add number
              </button>
            </div>
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-2">
              <p className="font-semibold text-slate-800">Delivery addresses</p>
              {form.addresses.map((a, i) => (
                <div key={i} className="flex gap-2">
                  <textarea
                    className={input}
                    rows={2}
                    placeholder="Address"
                    value={a.address}
                    onChange={(e) => {
                      const addresses = [...form.addresses];
                      addresses[i] = { ...a, address: e.target.value };
                      setForm({ ...form, addresses });
                    }}
                  />
                  <button
                    className="rounded-xl bg-red-50 px-2 text-red-600"
                    onClick={() => setForm({ ...form, addresses: form.addresses.filter((_, j) => j !== i) })}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
              <button
                className="inline-flex items-center gap-1 text-sm text-primary-700"
                onClick={() => setForm({ ...form, addresses: [...form.addresses, { address: "", label: "" }] })}
              >
                <Plus className="w-4 h-4" /> Add address
              </button>
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={submit}
              disabled={saving || !hasRorReg || (admin.role !== "booking_office" && !form.bookingOfficeId)}
              className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Create case
            </button>
            <button onClick={() => router.back()} className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm text-slate-600">
              Cancel
            </button>
          </div>
        </div>
      )}
    </OfficePageFrame>
  );
}
