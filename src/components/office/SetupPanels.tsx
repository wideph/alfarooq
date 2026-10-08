"use client";

import { useCallback, useEffect, useState } from "react";
import { Eye, EyeOff, Loader2, Plus, Save, Trash2, UserPlus, Users, X } from "lucide-react";
import { officeFetch } from "@/lib/office/client";

// N6 panels live in their own files to keep this file manageable.
export { default as HolidayPanel } from "./HolidayPanel";
export { default as DatePoolPanel } from "./DatePoolPanel";
import {
  BOOKING_OFFICE_TYPES,
  BOOKING_OFFICE_TYPE_LABELS,
  OFFICE_ROLES,
  ROLE_LABELS,
  type BookingOfficeType,
  type OfficeRole,
} from "@/lib/office/permissions";

type Category = { id: string; name: string; defaultAmount: number | null; order: number; isActive: boolean };
type AttestationType = { id: string; name: string; order: number; isActive: boolean };
type Member = {
  id: string;
  name: string;
  profitPercent: number;
  isActive: boolean;
  adminId: string | null;
};
type OfficeUser = { id: string; name: string; email: string; role: string; isActive: boolean };
type Office = {
  id: string;
  name: string;
  type: BookingOfficeType;
  phone: string | null;
  notes: string | null;
  isActive: boolean;
  members: Member[];
  users: OfficeUser[];
  commissions: Array<{ categoryId: string; amount: number; category: { id: string; name: string } }>;
  _count: { cases: number; users: number };
};

const input =
  "w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";
const primaryBtn =
  "inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50";
const ghostBtn = "rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700";

function Panel({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="flex items-center gap-2 p-4 border-b border-slate-100">
        {icon}
        <h2 className="font-bold text-slate-900">{title}</h2>
      </div>
      <div className="p-5 sm:p-6 space-y-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Categories

export function CategoriesPanel({ onMessage }: { onMessage: (message: string) => void }) {
  const [items, setItems] = useState<Category[]>([]);
  const [form, setForm] = useState({ id: "", name: "", defaultAmount: "", order: "1", isActive: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await officeFetch<Category[]>("/api/office/setup/categories");
    if (res.ok) setItems(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    const res = await officeFetch("/api/office/setup/categories", {
      method: form.id ? "PUT" : "POST",
      json: form,
    });
    onMessage(res.ok ? "Category save ho gayi" : res.error);
    if (res.ok) {
      setForm({ id: "", name: "", defaultAmount: "", order: String(items.length + 2), isActive: true });
      await load();
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Category delete karein?")) return;
    const res = await officeFetch(`/api/office/setup/categories?id=${id}`, { method: "DELETE" });
    onMessage(res.ok ? "Category delete ho gayi" : res.error);
    if (res.ok) await load();
  }

  return (
    <Panel title="Case Categories">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <input
          className={input}
          placeholder="Category name (e.g. Matric, FA, BA)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className={input}
          placeholder="Default fee (optional)"
          inputMode="decimal"
          value={form.defaultAmount}
          onChange={(e) => setForm({ ...form, defaultAmount: e.target.value })}
        />
        <input
          className={input}
          placeholder="Order"
          type="number"
          step="0.1"
          value={form.order}
          onChange={(e) => setForm({ ...form, order: e.target.value })}
        />
        <div className="flex gap-2">
          <button className={primaryBtn} disabled={saving || !form.name.trim()} onClick={save}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {form.id ? "Update" : "Add"}
          </button>
          {form.id && (
            <button
              className={ghostBtn}
              onClick={() => setForm({ id: "", name: "", defaultAmount: "", order: "1", isActive: true })}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
      {form.id && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          Active
        </label>
      )}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {items.length === 0 && <p className="p-4 text-sm text-slate-400">Koi category nahi hai</p>}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div>
              <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                #{item.order}
              </span>
              <span className={`font-medium ${item.isActive ? "text-slate-800" : "text-slate-400 line-through"}`}>
                {item.name}
              </span>
              {item.defaultAmount !== null && (
                <span className="ml-2 text-xs text-slate-500">Rs {item.defaultAmount}</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                className={ghostBtn}
                onClick={() =>
                  setForm({
                    id: item.id,
                    name: item.name,
                    defaultAmount: item.defaultAmount === null ? "" : String(item.defaultAmount),
                    order: String(item.order),
                    isActive: item.isActive,
                  })
                }
              >
                Edit
              </button>
              <button className="rounded-xl bg-red-50 p-2 text-red-600" onClick={() => remove(item.id)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------- Attestation types

export function AttestationTypesPanel({ onMessage }: { onMessage: (message: string) => void }) {
  const [items, setItems] = useState<AttestationType[]>([]);
  const [form, setForm] = useState({ id: "", name: "", order: "1", isActive: true });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const res = await officeFetch<AttestationType[]>("/api/office/setup/attestation-types");
    if (res.ok) setItems(res.data);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save() {
    setSaving(true);
    const res = await officeFetch("/api/office/setup/attestation-types", {
      method: form.id ? "PUT" : "POST",
      json: form,
    });
    onMessage(res.ok ? "Attestation type save ho gaya" : res.error);
    if (res.ok) {
      setForm({ id: "", name: "", order: String(items.length + 2), isActive: true });
      await load();
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Attestation type delete karein?")) return;
    const res = await officeFetch(`/api/office/setup/attestation-types?id=${id}`, { method: "DELETE" });
    onMessage(res.ok ? "Delete ho gaya" : res.error);
    if (res.ok) await load();
  }

  return (
    <Panel title="Attestation Types">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <input
          className={input}
          placeholder="Name (e.g. IBCC, HEC, MOFA, Embassy)"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          className={input}
          placeholder="Order"
          type="number"
          step="0.1"
          value={form.order}
          onChange={(e) => setForm({ ...form, order: e.target.value })}
        />
        <div className="flex gap-2">
          <button className={primaryBtn} disabled={saving || !form.name.trim()} onClick={save}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {form.id ? "Update" : "Add"}
          </button>
          {form.id && (
            <button className={ghostBtn} onClick={() => setForm({ id: "", name: "", order: "1", isActive: true })}>
              Cancel
            </button>
          )}
        </div>
      </div>
      {form.id && (
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
          />
          Active
        </label>
      )}
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-200">
        {items.length === 0 && <p className="p-4 text-sm text-slate-400">Koi attestation type nahi hai</p>}
        {items.map((item) => (
          <div key={item.id} className="flex items-center justify-between gap-3 p-3 text-sm">
            <div>
              <span className="mr-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
                #{item.order}
              </span>
              <span className={`font-medium ${item.isActive ? "text-slate-800" : "text-slate-400 line-through"}`}>
                {item.name}
              </span>
            </div>
            <div className="flex gap-2">
              <button
                className={ghostBtn}
                onClick={() =>
                  setForm({ id: item.id, name: item.name, order: String(item.order), isActive: item.isActive })
                }
              >
                Edit
              </button>
              <button className="rounded-xl bg-red-50 p-2 text-red-600" onClick={() => remove(item.id)}>
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ------------------------------------------------------------ Booking offices

const emptyOffice = {
  id: "",
  name: "",
  type: "FIXED_COMMISSION" as BookingOfficeType,
  phone: "",
  notes: "",
  isActive: true,
};

type UserDraft = { name: string; email: string; password: string; role: OfficeRole; show: boolean };
const emptyUserDraft = (): UserDraft => ({
  name: "",
  email: "",
  password: "",
  role: "booking_office",
  show: false,
});

// Ek user row: naam, email, password (show/hide), role dropdown — office create
// form aur existing-office "add user" dono jagah use hoti hai (N2).
function UserDraftFields({
  draft,
  onChange,
  onRemove,
}: {
  draft: UserDraft;
  onChange: (next: UserDraft) => void;
  onRemove?: () => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1fr_11rem_auto]">
      <input
        className={input}
        placeholder="Naam"
        value={draft.name}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
      />
      <input
        className={input}
        type="email"
        placeholder="User id (email)"
        value={draft.email}
        onChange={(e) => onChange({ ...draft, email: e.target.value })}
      />
      <div className="relative">
        <input
          className={`${input} pr-10`}
          type={draft.show ? "text" : "password"}
          placeholder="Password (min 6)"
          value={draft.password}
          onChange={(e) => onChange({ ...draft, password: e.target.value })}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
          onClick={() => onChange({ ...draft, show: !draft.show })}
          aria-label={draft.show ? "Password chhupayein" : "Password dekhein"}
        >
          {draft.show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      <select
        className={input}
        value={draft.role}
        onChange={(e) => onChange({ ...draft, role: e.target.value as OfficeRole })}
      >
        {OFFICE_ROLES.map((role) => (
          <option key={role} value={role}>
            {ROLE_LABELS[role]}
          </option>
        ))}
      </select>
      {onRemove ? (
        <button
          type="button"
          className="grid h-10 w-10 place-items-center justify-self-start rounded-xl bg-red-50 text-red-600 hover:bg-red-100"
          onClick={onRemove}
          aria-label="Row hata dein"
        >
          <X className="h-4 w-4" />
        </button>
      ) : (
        <span className="hidden lg:block" />
      )}
    </div>
  );
}

export function BookingOfficesPanel({ onMessage }: { onMessage: (message: string) => void }) {
  const [offices, setOffices] = useState<Office[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [form, setForm] = useState(emptyOffice);
  const [userDrafts, setUserDrafts] = useState<UserDraft[]>([]);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [officesRes, categoriesRes] = await Promise.all([
      officeFetch<Office[]>("/api/office/setup/booking-offices"),
      officeFetch<Category[]>("/api/office/setup/categories"),
    ]);
    if (officesRes.ok) setOffices(officesRes.data);
    if (categoriesRes.ok) setCategories(categoriesRes.data.filter((c) => c.isActive));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveOffice() {
    // Sirf woh user rows bhejein jin mein kuch likha gaya hai (N2).
    const users = userDrafts
      .map((draft) => ({
        name: draft.name.trim(),
        email: draft.email.trim(),
        password: draft.password,
        role: draft.role,
      }))
      .filter((draft) => draft.name || draft.email || draft.password);

    setSaving(true);
    const res = await officeFetch<Office>("/api/office/setup/booking-offices", {
      method: form.id ? "PUT" : "POST",
      json: form.id ? form : { ...form, users },
    });
    onMessage(
      res.ok
        ? form.id
          ? "Office update ho gaya"
          : users.length > 0
            ? `Office ban gaya — ${users.length} user bhi add ho gaye`
            : "Office ban gaya"
        : res.error
    );
    if (res.ok) {
      setForm(emptyOffice);
      setUserDrafts([]);
      setSelectedId(res.data.id);
      await load();
    }
    setSaving(false);
  }

  async function removeOffice(id: string) {
    if (!confirm("Booking office delete karein?")) return;
    const res = await officeFetch(`/api/office/setup/booking-offices?id=${id}`, { method: "DELETE" });
    onMessage(res.ok ? "Office delete ho gaya" : res.error);
    if (res.ok) {
      if (selectedId === id) setSelectedId(null);
      await load();
    }
  }

  const selected = offices.find((office) => office.id === selectedId) || null;

  return (
    <Panel title="Booking Offices" icon={<Users className="w-5 h-5 text-primary-600" />}>
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 sm:p-5 space-y-4">
        <div>
          <p className="font-semibold text-slate-800">
            {form.id ? "Edit office" : "New booking office"}
          </p>
          <p className="text-xs text-slate-500">
            Office ki maloomat aur us ke login users / roles — sab ek hi jagah, ek submit mein.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <input
            className={input}
            placeholder="Office name"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select
            className={input}
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as BookingOfficeType })}
          >
            {BOOKING_OFFICE_TYPES.map((type) => (
              <option key={type} value={type}>
                {BOOKING_OFFICE_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <input
            className={input}
            placeholder="Phone (optional)"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
        <textarea
          className={input}
          rows={2}
          placeholder="Notes (optional)"
          value={form.notes}
          onChange={(e) => setForm({ ...form, notes: e.target.value })}
        />
        {form.id && (
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
            />
            Active
          </label>
        )}

        {!form.id && (
          <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-800">Users / Roles (optional)</p>
                <p className="text-xs text-slate-500">
                  Office ke sath hi us ke login users bana dein — booking office, cashier, filing,
                  printing, atta, courier.
                </p>
              </div>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100"
                onClick={() => setUserDrafts([...userDrafts, emptyUserDraft()])}
              >
                <UserPlus className="h-4 w-4" /> User row add karein
              </button>
            </div>
            {userDrafts.length === 0 ? (
              <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
                Abhi koi user row nahi — office akele bhi ban sakta hai; users baad mein bhi add ho
                sakte hain.
              </p>
            ) : (
              <div className="space-y-2">
                {userDrafts.map((draft, index) => (
                  <UserDraftFields
                    key={index}
                    draft={draft}
                    onChange={(next) =>
                      setUserDrafts(userDrafts.map((item, i) => (i === index ? next : item)))
                    }
                    onRemove={() => setUserDrafts(userDrafts.filter((_, i) => i !== index))}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2">
          <button className={primaryBtn} disabled={saving || !form.name.trim()} onClick={saveOffice}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {form.id ? "Save" : "Office banayein"}
          </button>
          {form.id && (
            <button
              className={ghostBtn}
              onClick={() => {
                setForm(emptyOffice);
                setUserDrafts([]);
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 divide-y divide-slate-100 rounded-xl border border-slate-200">
          {offices.length === 0 && <p className="p-4 text-sm text-slate-400">Koi booking office nahi hai</p>}
          {offices.map((office) => (
            <div
              key={office.id}
              onClick={() => setSelectedId(office.id)}
              className={`cursor-pointer p-3 text-sm ${
                selectedId === office.id ? "bg-primary-50 border-l-4 border-primary-500" : "hover:bg-slate-50"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className={`font-semibold truncate ${office.isActive ? "text-slate-900" : "text-slate-400"}`}>
                    {office.name}
                  </p>
                  <p className="text-xs text-slate-500">{BOOKING_OFFICE_TYPE_LABELS[office.type]}</p>
                  <p className="text-xs text-slate-400">
                    {office._count.cases} cases · {office.members.length} members · {office._count.users} logins
                  </p>
                </div>
                <div className="flex gap-1">
                  <button
                    className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200"
                    onClick={(e) => {
                      e.stopPropagation();
                      setUserDrafts([]);
                      setForm({
                        id: office.id,
                        name: office.name,
                        type: office.type,
                        phone: office.phone || "",
                        notes: office.notes || "",
                        isActive: office.isActive,
                      });
                    }}
                  >
                    Edit
                  </button>
                  <button
                    className="rounded-lg p-1.5 text-red-500 hover:bg-red-100"
                    onClick={(e) => {
                      e.stopPropagation();
                      removeOffice(office.id);
                    }}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="lg:col-span-8 space-y-4">
          {!selected ? (
            <div className="rounded-xl border border-slate-200 p-8 text-center text-sm text-slate-400">
              Members aur commission set karne ke liye office select karein
            </div>
          ) : (
            <>
              <OfficeUsersEditor office={selected} onChanged={load} onMessage={onMessage} />
              <MembersEditor office={selected} onChanged={load} onMessage={onMessage} />
              {selected.type === "FIXED_COMMISSION" && (
                <CommissionGrid office={selected} categories={categories} onChanged={load} onMessage={onMessage} />
              )}
            </>
          )}
        </div>
      </div>
    </Panel>
  );
}

// Mojooda office mein baad mein naya login user / role add karna (N2).
function OfficeUsersEditor({
  office,
  onChanged,
  onMessage,
}: {
  office: Office;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [draft, setDraft] = useState<UserDraft>(emptyUserDraft());
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    setDraft(emptyUserDraft());
  }, [office.id]);

  async function add() {
    setAdding(true);
    const res = await officeFetch(`/api/office/setup/booking-offices/${office.id}/users`, {
      method: "POST",
      json: {
        name: draft.name.trim(),
        email: draft.email.trim(),
        password: draft.password,
        role: draft.role,
      },
    });
    onMessage(res.ok ? "User add ho gaya" : res.error);
    if (res.ok) {
      setDraft(emptyUserDraft());
      await onChanged();
    }
    setAdding(false);
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3">
      <div>
        <p className="font-semibold text-slate-800">Login users — {office.name}</p>
        <p className="text-xs text-slate-500">
          Is office ke tamam login users aur un ke roles. Naya user yahin inline add karein.
        </p>
      </div>

      {office.users.length > 0 && (
        <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {office.users.map((user) => (
            <div key={user.id} className="flex items-center justify-between gap-3 p-3 text-sm">
              <div className="min-w-0">
                <p className={`truncate font-medium ${user.isActive ? "text-slate-800" : "text-slate-400"}`}>
                  {user.name}
                </p>
                <p className="truncate text-xs text-slate-500">{user.email}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="rounded-lg bg-primary-50 px-2 py-1 text-xs font-semibold text-primary-700">
                  {ROLE_LABELS[user.role] || user.role}
                </span>
                {!user.isActive && (
                  <span className="rounded-lg bg-slate-100 px-2 py-1 text-xs text-slate-500">inactive</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <UserDraftFields draft={draft} onChange={setDraft} />
      <div>
        <button
          className={primaryBtn}
          disabled={adding || !draft.name.trim() || !draft.email.trim() || draft.password.length < 6}
          onClick={add}
        >
          {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          User add karein
        </button>
      </div>
    </div>
  );
}

function MembersEditor({
  office,
  onChanged,
  onMessage,
}: {
  office: Office;
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [name, setName] = useState("");
  const [percent, setPercent] = useState("");
  const [saving, setSaving] = useState(false);
  const [edits, setEdits] = useState<Record<string, { name: string; profitPercent: string }>>({});
  const isProfitShare = office.type === "PROFIT_SHARE";
  const totalPercent = office.members
    .filter((member) => member.isActive)
    .reduce((acc, member) => acc + Number(member.profitPercent || 0), 0);

  async function add() {
    setSaving(true);
    const res = await officeFetch(`/api/office/setup/booking-offices/${office.id}/members`, {
      method: "POST",
      json: { name, ...(isProfitShare ? { profitPercent: percent || "0" } : {}) },
    });
    onMessage(res.ok ? "Member add ho gaya" : res.error);
    if (res.ok) {
      setName("");
      setPercent("");
      await onChanged();
    }
    setSaving(false);
  }

  async function update(member: Member) {
    const edit = edits[member.id];
    if (!edit) return;
    const res = await officeFetch(`/api/office/setup/booking-offices/${office.id}/members`, {
      method: "PUT",
      json: { id: member.id, name: edit.name, ...(isProfitShare ? { profitPercent: edit.profitPercent } : {}) },
    });
    onMessage(res.ok ? "Member update ho gaya" : res.error);
    if (res.ok) {
      setEdits((prev) => {
        const next = { ...prev };
        delete next[member.id];
        return next;
      });
      await onChanged();
    }
  }

  async function toggleActive(member: Member) {
    const res = await officeFetch(`/api/office/setup/booking-offices/${office.id}/members`, {
      method: "PUT",
      json: { id: member.id, isActive: !member.isActive },
    });
    onMessage(res.ok ? "Member update ho gaya" : res.error);
    if (res.ok) await onChanged();
  }

  async function remove(member: Member) {
    if (!confirm("Member delete karein?")) return;
    const res = await officeFetch(`/api/office/setup/booking-offices/${office.id}/members?id=${member.id}`, {
      method: "DELETE",
    });
    onMessage(res.ok ? "Member delete ho gaya" : res.error);
    if (res.ok) await onChanged();
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-slate-800">
          {isProfitShare ? "Shareholders" : office.type === "SALARY" ? "Staff" : "Members"} — {office.name}
        </p>
        {isProfitShare && (
          <span className={`text-xs font-semibold ${totalPercent > 100 ? "text-red-600" : "text-slate-500"}`}>
            Total {totalPercent}% {totalPercent > 100 ? "(100% se zyada!)" : ""}
          </span>
        )}
      </div>
      <p className="text-xs text-slate-500">
        &quot;Booking office&quot; role wale login users (oopar Users section se bante hain) yahan automatically
        member ban jate hain. Bina login members (sirf hisaab ke liye) yahan add karein.
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input className={input} placeholder="Member name" value={name} onChange={(e) => setName(e.target.value)} />
        {isProfitShare && (
          <input
            className={`${input} sm:max-w-[10rem]`}
            placeholder="Profit %"
            inputMode="decimal"
            value={percent}
            onChange={(e) => setPercent(e.target.value)}
          />
        )}
        <button className={primaryBtn} disabled={saving || !name.trim()} onClick={add}>
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>
      <div className="divide-y divide-slate-100 rounded-xl border border-slate-100">
        {office.members.map((member) => {
          const edit = edits[member.id];
          return (
            <div key={member.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center">
              <input
                className={`${input} flex-1`}
                value={edit ? edit.name : member.name}
                onChange={(e) =>
                  setEdits({
                    ...edits,
                    [member.id]: {
                      name: e.target.value,
                      profitPercent: edit ? edit.profitPercent : String(member.profitPercent),
                    },
                  })
                }
              />
              {isProfitShare && (
                <input
                  className={`${input} sm:max-w-[7rem]`}
                  inputMode="decimal"
                  value={edit ? edit.profitPercent : String(member.profitPercent)}
                  onChange={(e) =>
                    setEdits({
                      ...edits,
                      [member.id]: { name: edit ? edit.name : member.name, profitPercent: e.target.value },
                    })
                  }
                />
              )}
              <span className="text-xs text-slate-400">
                {member.adminId ? "login" : "no login"}
                {!member.isActive ? " · inactive" : ""}
              </span>
              <div className="flex gap-1">
                {edit && (
                  <button className={primaryBtn} onClick={() => update(member)}>
                    <Save className="w-4 h-4" />
                  </button>
                )}
                <button className={ghostBtn} onClick={() => toggleActive(member)}>
                  {member.isActive ? "Inactive" : "Active"}
                </button>
                {!member.adminId && (
                  <button className="rounded-xl bg-red-50 p-2 text-red-600" onClick={() => remove(member)}>
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CommissionGrid({
  office,
  categories,
  onChanged,
  onMessage,
}: {
  office: Office;
  categories: Category[];
  onChanged: () => Promise<void>;
  onMessage: (message: string) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const commission of office.commissions) next[commission.categoryId] = String(commission.amount);
    setValues(next);
  }, [office]);

  async function save() {
    setSaving(true);
    const items = Object.entries(values)
      .filter(([, amount]) => amount.trim() !== "")
      .map(([categoryId, amount]) => ({ categoryId, amount }));
    const res = await officeFetch(`/api/office/setup/booking-offices/${office.id}/commissions`, {
      method: "PUT",
      json: { items },
    });
    onMessage(res.ok ? "Commission grid save ho gaya" : res.error);
    if (res.ok) await onChanged();
    setSaving(false);
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4 space-y-3">
      <p className="font-semibold text-slate-800">Fixed commission per category — {office.name}</p>
      <p className="text-xs text-slate-500">
        Har category ke case par is office ko kitni fixed commission milegi. Khali chhorne par 0.
      </p>
      {categories.length === 0 ? (
        <p className="text-sm text-amber-600">Pehle categories add karein.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {categories.map((category) => (
            <label key={category.id} className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
              <span className="flex-1 font-medium text-slate-700">{category.name}</span>
              <input
                className={`${input} max-w-[9rem]`}
                inputMode="decimal"
                placeholder="Rs"
                value={values[category.id] ?? ""}
                onChange={(e) => setValues({ ...values, [category.id]: e.target.value })}
              />
            </label>
          ))}
        </div>
      )}
      <button className={primaryBtn} disabled={saving || categories.length === 0} onClick={save}>
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        Save commissions
      </button>
    </div>
  );
}
