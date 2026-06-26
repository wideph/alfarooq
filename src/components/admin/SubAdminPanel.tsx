"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, ShieldCheck, Trash2, UserPlus } from "lucide-react";

const PERMISSIONS = [
  { key: "settings", label: "Website settings", read: "settings:read", write: "settings:write" },
  { key: "courses", label: "Courses", read: "courses:read", write: "courses:write" },
  { key: "samples", label: "Samples", read: "samples:read", write: "samples:write" },
  { key: "qa", label: "Q&A", read: "qa:read", write: "qa:write" },
  {
    key: "userQuestions",
    label: "User question answers",
    read: "userQuestions:read",
    write: "userQuestions:write",
  },
  { key: "visitors", label: "Visitors & ad signals", read: "visitors:read", write: "visitors:write" },
  { key: "botTraining", label: "AI bot training", read: "botTraining:read", write: "botTraining:write" },
  { key: "botChats", label: "AI bot chats", read: "botChats:read", write: "botChats:write" },
  { key: "admins", label: "Sub-admins", read: "admins:read", write: "admins:write" },
] as const;

type PermissionValue = (typeof PERMISSIONS)[number]["read"] | (typeof PERMISSIONS)[number]["write"];
type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: PermissionValue[];
  isActive: boolean;
  lastLoginAt: string | null;
};

const emptyForm = {
  id: "",
  name: "",
  email: "",
  password: "",
  permissions: [] as PermissionValue[],
  isActive: true,
};

export default function SubAdminPanel({
  defaultOpen = false,
  canWrite = true,
}: {
  defaultOpen?: boolean;
  canWrite?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  async function loadAdmins() {
    setLoading(true);
    const res = await fetch("/api/admin/users");
    if (res.ok) setAdmins(await res.json());
    setLoading(false);
  }

  useEffect(() => {
    if (open) void loadAdmins();
  }, [open]);

  function togglePermission(permission: PermissionValue) {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((item) => item !== permission)
        : [...prev.permissions, permission],
    }));
  }

  async function saveAdmin() {
    if (!canWrite) return;
    if (!form.name.trim() || !form.email.trim() || (!form.id && form.password.length < 6)) return;
    setSaving(true);

    const res = await fetch("/api/admin/users", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setForm(emptyForm);
      setMessage("Sub-admin save ho gaya.");
      await loadAdmins();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Sub-admin save nahi ho saka.");
    }
    setSaving(false);
  }

  async function deleteAdmin(id: string) {
    if (!canWrite) return;
    if (!confirm("Sub-admin delete karein?")) return;
    const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setMessage("Sub-admin delete ho gaya.");
      await loadAdmins();
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 border-b border-slate-100 hover:bg-slate-50"
      >
        <span className="font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary-600" />
          Sub Admins & Permissions
        </span>
        <span className="text-sm text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="p-5 sm:p-6 space-y-5">
          {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

          {canWrite && (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4">
            <h3 className="font-bold text-slate-900 flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-primary-600" />
              {form.id ? "Edit Sub-admin" : "New Sub-admin"}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Name"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
              <input
                type="email"
                value={form.email}
                onChange={(event) => setForm({ ...form, email: event.target.value })}
                placeholder="Email"
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
              <input
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder={form.id ? "New password optional" : "Password"}
                className="rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {PERMISSIONS.map((permission) => (
                <div key={permission.key} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                  <p className="mb-2 font-semibold text-slate-800">{permission.label}</p>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(permission.read)}
                        onChange={() => togglePermission(permission.read)}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600"
                      />
                      Read
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={form.permissions.includes(permission.write)}
                        onChange={() => togglePermission(permission.write)}
                        className="w-4 h-4 rounded border-slate-300 text-primary-600"
                      />
                      Write
                    </label>
                  </div>
                </div>
              ))}
            </div>

            {form.id && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm({ ...form, isActive: event.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-primary-600"
                />
                Active
              </label>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={saveAdmin}
                disabled={saving || !form.name.trim() || !form.email.trim() || (!form.id && form.password.length < 6)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
              {form.id && (
                <button
                  type="button"
                  onClick={() => setForm(emptyForm)}
                  className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          )}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            </div>
          ) : (
            <div className="space-y-2">
              {admins.map((admin) => (
                <div key={admin.id} className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {admin.name}{" "}
                      <span className="text-xs font-normal text-slate-400">
                        {admin.role === "admin" ? "Main admin" : "Sub-admin"}
                      </span>
                    </p>
                    <p className="text-sm text-slate-500">{admin.email}</p>
                    <p className="text-xs text-slate-400">
                      {admin.role === "admin"
                        ? "Full access"
                        : admin.permissions.join(", ") || "No permissions"}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {canWrite && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              id: admin.id,
                              name: admin.name,
                              email: admin.email,
                              password: "",
                              permissions: admin.permissions,
                              isActive: admin.isActive,
                            })
                          }
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          Edit
                        </button>
                        {admin.role === "sub_admin" && (
                          <button
                            type="button"
                            onClick={() => deleteAdmin(admin.id)}
                            className="grid h-10 w-10 place-items-center rounded-xl bg-red-50 text-red-600"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
