"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
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
  const [form, setForm] = useState({
    bookingOfficeId: "",
    clientName: "",
    categoryId: "",
    rollNumber: "",
    registrationNumber: "",
    agreedAmount: "",
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

  async function submit() {
    setSaving(true);
    setError("");
    const res = await officeFetch<{ id: string }>("/api/office/cases", { method: "POST", json: form });
    if (res.ok) {
      router.push(`/office/cases/${res.data.id}`);
      return;
    }
    setError(res.error);
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
              <label className="block text-xs text-slate-500 mb-1">Client / student name *</label>
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
                <label className="block text-xs text-slate-500 mb-1">Roll number</label>
                <input className={input} value={form.rollNumber} onChange={(e) => setForm({ ...form, rollNumber: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Registration number</label>
                <input
                  className={input}
                  value={form.registrationNumber}
                  onChange={(e) => setForm({ ...form, registrationNumber: e.target.value })}
                />
              </div>
            </div>
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
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Notes</label>
              <textarea className={input} rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
              disabled={saving || !form.clientName.trim() || (admin.role !== "booking_office" && !form.bookingOfficeId)}
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
