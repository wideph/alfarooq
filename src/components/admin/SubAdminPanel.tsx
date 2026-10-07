"use client";

import { useEffect, useState } from "react";
import { Loader2, Save, ShieldCheck, Trash2, UserPlus, Wand2 } from "lucide-react";
import type { AdminPermission } from "@/lib/auth";
import {
  ALL_OFFICE_PERMISSIONS,
  BOOKING_OFFICE_TYPE_LABELS,
  OFFICE_PERMISSION_GROUPS,
  ROLE_LABELS,
  ROLE_PRESETS,
  isOfficeRole,
  type BookingOfficeType,
} from "@/lib/office/permissions";

const WEBSITE_PERMISSIONS = [
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

const ROLE_OPTIONS = ["sub_admin", "cashier", "attestation", "booking_office"] as const;
type RoleOption = (typeof ROLE_OPTIONS)[number];

type AdminUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  permissions: AdminPermission[];
  isActive: boolean;
  lastLoginAt: string | null;
  bookingOfficeId: string | null;
  bookingOffice: { id: string; name: string; type: string } | null;
};

type BookingOfficeOption = { id: string; name: string; type: BookingOfficeType; isActive: boolean };

const emptyForm = {
  id: "",
  name: "",
  email: "",
  password: "",
  role: "sub_admin" as RoleOption,
  bookingOfficeId: "",
  permissions: [] as AdminPermission[],
  isActive: true,
};

export default function SubAdminPanel({
  defaultOpen = false,
  canWrite = true,
  isSuperAdmin = false,
}: {
  defaultOpen?: boolean;
  canWrite?: boolean;
  isSuperAdmin?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [offices, setOffices] = useState<BookingOfficeOption[]>([]);
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

  async function loadOffices() {
    const res = await fetch("/api/office/setup/booking-offices").catch(() => null);
    if (res?.ok) setOffices(await res.json());
  }

  useEffect(() => {
    if (open) {
      void loadAdmins();
      if (isSuperAdmin) void loadOffices();
    }
  }, [open, isSuperAdmin]);

  function togglePermission(permission: AdminPermission) {
    setForm((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(permission)
        ? prev.permissions.filter((item) => item !== permission)
        : [...prev.permissions, permission],
    }));
  }

  function applyPreset() {
    if (!isOfficeRole(form.role)) return;
    const preset = ROLE_PRESETS[form.role];
    setForm((prev) => ({
      ...prev,
      permissions: [
        ...prev.permissions.filter((item) => !ALL_OFFICE_PERMISSIONS.includes(item)),
        ...preset,
      ],
    }));
  }

  function changeRole(role: RoleOption) {
    setForm((prev) => ({
      ...prev,
      role,
      bookingOfficeId: role === "booking_office" ? prev.bookingOfficeId : "",
      // Office roles start from their preset; website sub-admin keeps ticks.
      permissions: isOfficeRole(role)
        ? [...prev.permissions.filter((item) => !ALL_OFFICE_PERMISSIONS.includes(item)), ...ROLE_PRESETS[role]]
        : prev.permissions,
    }));
  }

  const formValid =
    form.name.trim() &&
    form.email.trim() &&
    (form.id || form.password.length >= 6) &&
    (form.role !== "booking_office" || form.bookingOfficeId);

  async function saveAdmin() {
    if (!canWrite || !formValid) return;
    setSaving(true);

    const res = await fetch("/api/admin/users", {
      method: form.id ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });

    if (res.ok) {
      setForm(emptyForm);
      setMessage("User save ho gaya.");
      await loadAdmins();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "User save nahi ho saka.");
    }
    setSaving(false);
  }

  async function deleteAdmin(id: string) {
    if (!canWrite) return;
    if (!confirm("Ye user delete karein?")) return;
    const res = await fetch(`/api/admin/users?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setMessage("User delete ho gaya.");
      await loadAdmins();
    } else {
      const data = await res.json().catch(() => ({}));
      setMessage(data.error || "Delete nahi ho saka.");
    }
  }

  const roleOptions = ROLE_OPTIONS.filter((role) => isSuperAdmin || !isOfficeRole(role));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 border-b border-slate-100 hover:bg-slate-50"
      >
        <span className="font-bold text-slate-900 flex items-center gap-2">
          <ShieldCheck className="w-5 h-5 text-primary-600" />
          Users, Roles & Permissions
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
              {form.id ? "Edit User" : "New User"}
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

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Role</label>
                <select
                  value={form.role}
                  onChange={(event) => changeRole(event.target.value as RoleOption)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                >
                  {roleOptions.map((role) => (
                    <option key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </option>
                  ))}
                </select>
              </div>
              {form.role === "booking_office" && (
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Booking office</label>
                  <select
                    value={form.bookingOfficeId}
                    onChange={(event) => setForm({ ...form, bookingOfficeId: event.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm"
                  >
                    <option value="">Select karein…</option>
                    {offices.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name} — {BOOKING_OFFICE_TYPE_LABELS[office.type] || office.type}
                      </option>
                    ))}
                  </select>
                  {offices.length === 0 && (
                    <p className="mt-1 text-xs text-amber-600">
                      Pehle /office/setup se booking office banayein.
                    </p>
                  )}
                </div>
              )}
              {isOfficeRole(form.role) && (
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={applyPreset}
                    className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-sm font-semibold text-primary-700"
                  >
                    <Wand2 className="w-4 h-4" />
                    Role ke default permissions
                  </button>
                </div>
              )}
            </div>

            {isSuperAdmin && (
              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Office permissions
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {OFFICE_PERMISSION_GROUPS.map((group) => (
                    <div key={group.key} className="rounded-lg bg-white px-3 py-2 text-sm text-slate-700">
                      <p className="mb-2 font-semibold text-slate-800">{group.label}</p>
                      <div className="flex flex-col gap-1.5">
                        {group.permissions.map((permission) => (
                          <label key={permission.value} className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={form.permissions.includes(permission.value)}
                              onChange={() => togglePermission(permission.value)}
                              className="w-4 h-4 rounded border-slate-300 text-primary-600"
                            />
                            {permission.label}
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                Website permissions
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {WEBSITE_PERMISSIONS.map((permission) => (
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
                disabled={saving || !formValid}
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
                        {ROLE_LABELS[admin.role] || admin.role}
                        {admin.bookingOffice ? ` · ${admin.bookingOffice.name}` : ""}
                        {!admin.isActive ? " · inactive" : ""}
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
                    {canWrite && (isSuperAdmin || !isOfficeRole(admin.role)) && (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setForm({
                              id: admin.id,
                              name: admin.name,
                              email: admin.email,
                              password: "",
                              role: (ROLE_OPTIONS.includes(admin.role as RoleOption)
                                ? admin.role
                                : "sub_admin") as RoleOption,
                              bookingOfficeId: admin.bookingOfficeId || "",
                              permissions: admin.permissions,
                              isActive: admin.isActive,
                            })
                          }
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                        >
                          Edit
                        </button>
                        {admin.role !== "admin" && (
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
