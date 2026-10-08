"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Link2, Loader2, Save, Trash2 } from "lucide-react";
import { officeFetch } from "@/lib/office/client";
import type { ToastKind } from "@/components/Toast";

// Admin panel for the DepartmentLink table (§N9 — 06_NEW_REQUIREMENTS.md).
// Siraf link record yahan hota hai; DNS owner khud Vercel men add karta hai.
const DEPARTMENTS = [
  "BOOKING_OFFICE",
  "CASHIER",
  "FILING",
  "PRINTING",
  "ATTA",
  "COURIER",
  "OTHER",
] as const;

const DEPARTMENT_STYLES: Record<string, string> = {
  BOOKING_OFFICE: "bg-sky-100 text-sky-700",
  CASHIER: "bg-emerald-100 text-emerald-700",
  FILING: "bg-amber-100 text-amber-700",
  PRINTING: "bg-violet-100 text-violet-700",
  ATTA: "bg-pink-100 text-pink-700",
  COURIER: "bg-teal-100 text-teal-700",
  OTHER: "bg-slate-100 text-slate-600",
};

type LinkRow = {
  id: string;
  department: string;
  label: string;
  url: string;
  order: number;
  isActive: boolean;
};

const input =
  "rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const ghostBtn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";

const emptyForm = {
  id: "",
  department: "BOOKING_OFFICE" as string,
  label: "",
  url: "",
  order: 0,
  isActive: true,
};

export default function DepartmentLinksPanel({
  onMessage,
}: {
  onMessage: (message: string, kind?: ToastKind) => void;
}) {
  const [rows, setRows] = useState<LinkRow[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await officeFetch<LinkRow[]>("/api/office/setup/department-links?all=1");
    if (res.ok) setRows(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    const payload = {
      department: form.department,
      label: form.label,
      url: form.url,
      order: Number.isFinite(form.order) ? form.order : 0,
      isActive: form.isActive,
    };
    const res = await officeFetch("/api/office/setup/department-links", {
      method: form.id ? "PATCH" : "POST",
      json: form.id ? { id: form.id, ...payload } : payload,
    });
    onMessage(res.ok ? (form.id ? "Link update ho gaya" : "Link add ho gaya") : res.error, res.ok ? "success" : "error");
    if (res.ok) {
      setForm(emptyForm);
      await load();
    }
    setSaving(false);
  }

  async function remove(row: LinkRow) {
    if (!confirm(`Link delete karein? (${row.label})`)) return;
    const res = await officeFetch(`/api/office/setup/department-links?id=${row.id}`, {
      method: "DELETE",
    });
    onMessage(res.ok ? "Delete ho gaya" : res.error, res.ok ? "success" : "error");
    if (res.ok) {
      if (form.id === row.id) setForm(emptyForm);
      await load();
    }
  }

  async function toggleActive(row: LinkRow) {
    const res = await officeFetch("/api/office/setup/department-links", {
      method: "PATCH",
      json: { id: row.id, isActive: !row.isActive },
    });
    onMessage(
      res.ok
        ? row.isActive
          ? "Link band kar diya gaya"
          : "Link active ho gaya"
        : res.error,
      res.ok ? "success" : "error"
    );
    if (res.ok) await load();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 p-4 border-b border-slate-100">
        <Link2 className="w-5 h-5 text-primary-600" />
        <h2 className="font-bold text-slate-900">Department Access Links</h2>
      </div>
      <div className="p-5 sm:p-6 space-y-4">
        <p className="text-xs text-slate-500">
          Har department ka access link / domain yahan record hota hai — yeh links login page aur
          office nav par nazar aate hain.
        </p>
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-700">
          Note: In links ka DNS Vercel men manually add karna ho ga — yahan siraf link record hota
          hai.
        </p>

        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
          <p className="text-sm font-semibold text-slate-800">
            {form.id ? "Link edit karein" : "Naya link add karein"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <select
              className={input}
              value={form.department}
              onChange={(e) => setForm({ ...form, department: e.target.value })}
            >
              {DEPARTMENTS.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
            <input
              className={input}
              placeholder="Label (e.g. Filing Portal)"
              value={form.label}
              onChange={(e) => setForm({ ...form, label: e.target.value })}
            />
            <input
              className={input}
              placeholder="https://filing.example.com"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
            />
            <div className="flex items-center gap-2">
              <input
                type="number"
                className={`${input} w-24`}
                placeholder="Order"
                value={Number.isNaN(form.order) ? "" : form.order}
                onChange={(e) =>
                  setForm({ ...form, order: e.target.value === "" ? 0 : Number(e.target.value) })
                }
              />
              <label className="flex items-center gap-1.5 text-sm text-slate-600 whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
                />
                Active
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              className={primaryBtn}
              disabled={saving || !form.label.trim() || !form.url.trim()}
              onClick={save}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {form.id ? "Update" : "Add"}
            </button>
            {form.id && (
              <button className={ghostBtn} onClick={() => setForm(emptyForm)}>
                Cancel
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400">URL http/https se shuru hona chahiye.</p>
        </div>

        {rows.length === 0 && (
          <p className="rounded-xl border border-slate-200 p-4 text-center text-sm text-slate-400">
            Koi link add nahi hua
          </p>
        )}

        {rows.length > 0 && (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-3 py-2">Department</th>
                  <th className="px-3 py-2">Label</th>
                  <th className="px-3 py-2">URL</th>
                  <th className="px-3 py-2">Order</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row) => (
                  <tr key={row.id} className={form.id === row.id ? "bg-primary-50" : undefined}>
                    <td className="px-3 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                          DEPARTMENT_STYLES[row.department] || "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {row.department}
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium whitespace-nowrap">{row.label}</td>
                    <td className="px-3 py-2 text-slate-500">
                      <a
                        href={row.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-primary-600 hover:underline break-all"
                      >
                        {row.url}
                        <ExternalLink className="w-3 h-3 shrink-0" />
                      </a>
                    </td>
                    <td className="px-3 py-2 text-slate-500">{row.order}</td>
                    <td className="px-3 py-2">
                      <button
                        onClick={() => toggleActive(row)}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${
                          row.isActive
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {row.isActive ? "Active" : "Band"}
                      </button>
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button
                        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"
                        onClick={() =>
                          setForm({
                            id: row.id,
                            department: row.department,
                            label: row.label,
                            url: row.url,
                            order: row.order,
                            isActive: row.isActive,
                          })
                        }
                      >
                        Edit
                      </button>
                      <button
                        className="rounded-lg p-1.5 text-red-500 hover:bg-red-50"
                        onClick={() => remove(row)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
