"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, Save, Stamp, Truck } from "lucide-react";
import { officeFetch } from "@/lib/office/client";
import type { ToastKind } from "@/components/Toast";

// §W31 — department commission ka SEEDHA form (owner: purana row / dropdown
// grid confusing aur mehnat talab tha). Teen alag hisse:
//   Printing    — har case category ke saamne ek raqam
//   Attestation — har Set of Attestations ke saamne ek raqam (category ke
//                 neeche group); jis category ka koi set nahi us ki ek raqam
//   Courier     — har delivered case ki ek raqam
// Sirf user ke kaam wale hisse dikhte hain. Khali = 0. Save sirf aage ke
// cases par lagta hai. API: GET/PUT /api/office/dept-commissions/rules.

export type DeptKind = "PRINTING" | "ATTESTATION" | "COURIER";

export const ALL_DEPT_KINDS: DeptKind[] = ["PRINTING", "ATTESTATION", "COURIER"];

// Dept role ya permission → user kin kaamon ka commission le sakta hai.
export function deptKindsOf(role: string | null | undefined, permissions?: string[] | null): DeptKind[] {
  const perms = permissions ?? [];
  const kinds: DeptKind[] = [];
  if (role === "printing" || perms.includes("office:printing:write")) kinds.push("PRINTING");
  if (role === "attestation_dept" || perms.includes("office:attestation-dept:write")) kinds.push("ATTESTATION");
  if (role === "courier" || perms.includes("office:courier:write")) kinds.push("COURIER");
  return kinds;
}

export function isDeptCommissionRole(role: string | null | undefined, permissions?: string[] | null) {
  return deptKindsOf(role, permissions).length > 0;
}

export const DEPT_COMMISSION_HINT =
  "Raqam khali chhorein to commission 0. Badli hui raqam sirf aage ke cases par lagti hai — pehle se ho chuke cases par nahi.";

type CommissionForm = {
  printing: Array<{ categoryId: string; categoryName: string; isActive: boolean; amount: number }>;
  attestation: Array<{
    categoryId: string;
    categoryName: string;
    isActive: boolean;
    categoryAmount: number;
    sets: Array<{ setId: string; setName: string; isActive: boolean; amount: number }>;
  }>;
  courierAmount: number;
};

const toText = (value: number) => (value > 0 ? String(value) : "");
// Sirf raqam (digits + ek decimal point).
const cleanMoney = (value: string) => value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1");

// Set ke naam lambe hote hain ("Set of Attestations (i): Board + UV ibcc …") —
// dohraya hua prefix hata kar poora naam (wrap) dikhate hain.
function shortSetName(name: string) {
  return name.replace(/^Set of Attestations\s*/i, "").trim() || name;
}

function MoneyRow({
  label,
  muted,
  wrap,
  value,
  onChange,
}: {
  label: string;
  muted?: boolean;
  wrap?: boolean;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
      <span
        className={`min-w-0 ${wrap ? "break-words text-xs leading-snug" : "truncate text-sm"} ${muted ? "text-slate-400" : "text-slate-700"}`}
        title={label}
      >
        {label}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span className="text-xs text-slate-400">Rs</span>
        <input
          inputMode="decimal"
          placeholder="0"
          value={value}
          onChange={(e) => onChange(cleanMoney(e.target.value))}
          className="w-24 rounded-lg border border-slate-200 px-2 py-1.5 text-right text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
          aria-label={`${label} commission`}
        />
      </span>
    </label>
  );
}

// "Sab par ek hi raqam" — poore hisse ko ek click mein bharne ke liye.
function FillAll({ onApply }: { onApply: (value: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex items-center gap-1.5 text-xs text-slate-500">
      <span>Sab par:</span>
      <input
        inputMode="decimal"
        placeholder="Rs"
        value={value}
        onChange={(e) => setValue(cleanMoney(e.target.value))}
        className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-xs outline-none focus:border-primary-400"
        aria-label="Sab par ek hi raqam"
      />
      <button
        type="button"
        onClick={() => onApply(value)}
        className="rounded-lg border border-primary-200 bg-primary-50 px-2 py-1 font-semibold text-primary-700 hover:bg-primary-100"
      >
        Lagayein
      </button>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  subtitle,
  actions,
  children,
}: {
  icon: typeof Printer;
  title: string;
  subtitle: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="flex items-center gap-1.5 text-sm font-bold text-slate-800">
            <Icon className="h-4 w-4 text-primary-600" /> {title}
          </p>
          <p className="text-xs text-slate-500">{subtitle}</p>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

export function DeptCommissionGridEditor({
  adminId,
  userName,
  kinds = ALL_DEPT_KINDS,
  onMessage,
  onSaved,
}: {
  adminId: string;
  userName: string;
  kinds?: DeptKind[];
  onMessage: (message: string, kind?: ToastKind) => void;
  onSaved?: () => void | Promise<void>;
}) {
  const [form, setForm] = useState<CommissionForm | null>(null);
  const [loadError, setLoadError] = useState("");
  const [printing, setPrinting] = useState<Record<string, string>>({});
  const [setAmounts, setSetAmounts] = useState<Record<string, string>>({});
  const [categoryAttestation, setCategoryAttestation] = useState<Record<string, string>>({});
  const [courier, setCourier] = useState("");
  const [saving, setSaving] = useState(false);
  const visible = kinds.length > 0 ? kinds : ALL_DEPT_KINDS;

  function apply(next: CommissionForm) {
    setForm(next);
    setPrinting(Object.fromEntries(next.printing.map((row) => [row.categoryId, toText(row.amount)])));
    setSetAmounts(
      Object.fromEntries(next.attestation.flatMap((category) => category.sets.map((set) => [set.setId, toText(set.amount)])))
    );
    setCategoryAttestation(
      Object.fromEntries(next.attestation.map((category) => [category.categoryId, toText(category.categoryAmount)]))
    );
    setCourier(toText(next.courierAmount));
  }

  useEffect(() => {
    let cancelled = false;
    setForm(null);
    setLoadError("");
    officeFetch<{ ok: boolean; form: CommissionForm }>(
      `/api/office/dept-commissions/rules?adminId=${encodeURIComponent(adminId)}`
    ).then((res) => {
      if (cancelled) return;
      if (res.ok && res.data.form) apply(res.data.form);
      else setLoadError(res.ok ? "Commission load nahi ho saka" : res.error);
    });
    return () => {
      cancelled = true;
    };
  }, [adminId]);

  const setCount = useMemo(
    () => (form ? form.attestation.reduce((total, category) => total + category.sets.length, 0) : 0),
    [form]
  );

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const res = await officeFetch<{ ok: boolean; form: CommissionForm }>("/api/office/dept-commissions/rules", {
        method: "PUT",
        json: {
          adminId,
          printing: form.printing.map((row) => ({ categoryId: row.categoryId, amount: Number(printing[row.categoryId]) || 0 })),
          attestation: form.attestation.flatMap((category): Array<{ setId?: string; categoryId?: string; amount: number }> =>
            category.sets.length > 0
              ? category.sets.map((set) => ({ setId: set.setId, amount: Number(setAmounts[set.setId]) || 0 }))
              : [{ categoryId: category.categoryId, amount: Number(categoryAttestation[category.categoryId]) || 0 }]
          ),
          courierAmount: Number(courier) || 0,
        },
      });
      if (res.ok) {
        apply(res.data.form);
        onMessage(`${userName} ka commission save ho gaya — aage ke cases par lagega`);
        if (onSaved) await onSaved();
      } else {
        onMessage(res.error, "error");
      }
    } finally {
      setSaving(false);
    }
  }

  if (loadError) {
    return <p className="rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">Commission load nahi ho saka: {loadError}</p>;
  }
  if (!form) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Commission load ho raha hai
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary-100 bg-white p-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">Commission — {userName}</p>
        <p className="text-xs text-slate-500">{DEPT_COMMISSION_HINT}</p>
      </div>

      {visible.includes("PRINTING") && (
        <Section
          icon={Printer}
          title="Printing commission"
          subtitle="Har case category ki raqam — printed proof upload hote hi credit"
          actions={
            <FillAll
              onApply={(value) => setPrinting(Object.fromEntries(form.printing.map((row) => [row.categoryId, value])))}
            />
          }
        >
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {form.printing.map((row) => (
              <MoneyRow
                key={row.categoryId}
                label={row.categoryName}
                muted={!row.isActive}
                value={printing[row.categoryId] ?? ""}
                onChange={(value) => setPrinting((prev) => ({ ...prev, [row.categoryId]: value }))}
              />
            ))}
          </div>
        </Section>
      )}

      {visible.includes("ATTESTATION") && (
        <Section
          icon={Stamp}
          title="Attestation commission"
          subtitle={`Har Set of Attestations ki raqam (${setCount} sets) — attestation complete hote hi credit`}
          actions={
            <FillAll
              onApply={(value) => {
                setSetAmounts(
                  Object.fromEntries(form.attestation.flatMap((category) => category.sets.map((set) => [set.setId, value])))
                );
                setCategoryAttestation(
                  Object.fromEntries(
                    form.attestation.filter((category) => category.sets.length === 0).map((category) => [category.categoryId, value])
                  )
                );
              }}
            />
          }
        >
          <div className="space-y-3">
            {form.attestation.map((category) => (
              <div key={category.categoryId} className="space-y-1.5">
                <p className={`text-xs font-bold uppercase tracking-wide ${category.isActive ? "text-slate-500" : "text-slate-300"}`}>
                  {category.categoryName}
                </p>
                {category.sets.length > 0 ? (
                  <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                    {category.sets.map((set) => (
                      <MoneyRow
                        key={set.setId}
                        wrap
                        label={shortSetName(set.setName)}
                        muted={!set.isActive}
                        value={setAmounts[set.setId] ?? ""}
                        onChange={(value) => setSetAmounts((prev) => ({ ...prev, [set.setId]: value }))}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    <MoneyRow
                      wrap
                      label="Har case (is category ka koi set nahi)"
                      value={categoryAttestation[category.categoryId] ?? ""}
                      onChange={(value) => setCategoryAttestation((prev) => ({ ...prev, [category.categoryId]: value }))}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </Section>
      )}

      {visible.includes("COURIER") && (
        <Section icon={Truck} title="Courier commission" subtitle="Har delivered case (courier slip upload) par ek hi raqam">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <MoneyRow label="Har delivered case" value={courier} onChange={setCourier} />
          </div>
        </Section>
      )}

      <button
        type="button"
        disabled={saving}
        onClick={() => void save()}
        className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        Commission save karein
      </button>
    </div>
  );
}
