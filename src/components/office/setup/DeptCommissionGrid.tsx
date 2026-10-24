"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Plus, Save, X } from "lucide-react";
import { officeFetch } from "@/lib/office/client";
import type { ToastKind } from "@/components/Toast";

// §W21 Task 3 — Dept commission rule grid (Printing / Attestation dept users).
// Rows: [Category ▾] [Set of Attestations ▾ (+ "Poore category (default)")]
// [Printing commission Rs] [Attestation commission Rs] [Courier Rs] [✕].
// Save: PUT /api/office/dept-commissions/rules { adminId, rules }.
// §W30: courier column; `kinds` di jaye to sirf user ke kaam wale columns
// dikhte hain (baqi values save mein waise hi rehti hain). Rate badalna sirf
// AAGE ke cases par lagta hai; khali / 0 = commission 0.

export type DeptKind = "PRINTING" | "ATTESTATION" | "COURIER";

export const ALL_DEPT_KINDS: DeptKind[] = ["PRINTING", "ATTESTATION", "COURIER"];

export type CommissionRuleDraft = {
  key: string;
  categoryId: string;
  /** null = "Poore category (default)" — saare sets par apply hota hai. */
  setId: string | null;
  printAmount: string;
  attestationAmount: string;
  courierAmount: string;
};

let rowSeq = 0;
export function emptyRuleRow(): CommissionRuleDraft {
  rowSeq += 1;
  return {
    key: `row-${Date.now()}-${rowSeq}`,
    categoryId: "",
    setId: null,
    printAmount: "",
    attestationAmount: "",
    courierAmount: "",
  };
}

// Dept role (ya us permission wala user) ke liye hi grid dikhti hai.
// §W30: courier role / permission bhi.
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
  "Printing complete hone par printing, attestation complete hone par attestation (har Set of Attestations ka alag rate), aur courier slip se delivered hone par courier commission case-by-case credit hoti hai. Rate set na ho to 0. Rate badalne se sirf aage ke cases par asar hota hai.";

const KIND_FIELDS: Record<DeptKind, { field: "printAmount" | "attestationAmount" | "courierAmount"; label: string }> = {
  PRINTING: { field: "printAmount", label: "Printing Rs" },
  ATTESTATION: { field: "attestationAmount", label: "Attestation Rs" },
  COURIER: { field: "courierAmount", label: "Courier Rs" },
};

type CategoryOption = { id: string; name: string };
type SetOption = { id: string; name: string };

// Draft rows → PUT body. Sirf woh rows jin mein category chuni gayi hai.
export function serializeRuleRows(rows: CommissionRuleDraft[]) {
  return rows
    .filter((row) => row.categoryId)
    .map((row) => ({
      categoryId: row.categoryId,
      setId: row.setId,
      printAmount: Number(row.printAmount) || 0,
      attestationAmount: Number(row.attestationAmount) || 0,
      courierAmount: Number(row.courierAmount) || 0,
    }));
}

export async function saveCommissionRules(
  adminId: string,
  rows: CommissionRuleDraft[]
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await officeFetch("/api/office/dept-commissions/rules", {
    method: "PUT",
    json: { adminId, rules: serializeRuleRows(rows) },
  });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}

const input =
  "w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

// lg grid template: Category, Set, har kind ka amount, delete.
function gridTemplate(kindCount: number) {
  return `minmax(0,1fr) minmax(0,1fr) ${"7rem ".repeat(kindCount)}2.5rem`;
}

/* ------------------------------------------------------------------ */
/* Rows editor (controlled) — create form aur existing-user edit dono  */
/* ------------------------------------------------------------------ */

export function DeptCommissionRowsEditor({
  rows,
  onChange,
  kinds = ALL_DEPT_KINDS,
}: {
  rows: CommissionRuleDraft[];
  onChange: (rows: CommissionRuleDraft[]) => void;
  kinds?: DeptKind[];
}) {
  const [categories, setCategories] = useState<CategoryOption[]>([]);
  const [setsByCategory, setSetsByCategory] = useState<Record<string, SetOption[]>>({});
  const loadingSetsRef = useRef<Set<string>>(new Set());
  const visibleKinds = kinds.length > 0 ? kinds : ALL_DEPT_KINDS;
  const template = gridTemplate(visibleKinds.length);

  useEffect(() => {
    officeFetch<Array<{ id: string; name: string; isActive?: boolean }>>("/api/office/setup/categories").then(
      (res) => {
        if (res.ok) {
          setCategories(
            res.data.filter((c) => c.isActive !== false).map((c) => ({ id: String(c.id), name: String(c.name) }))
          );
        }
      }
    );
  }, []);

  // Category select hote hi us ke sets lazily fetch ho jate hain (cached).
  const ensureSets = useCallback((categoryId: string) => {
    if (!categoryId || loadingSetsRef.current.has(categoryId)) return;
    loadingSetsRef.current.add(categoryId);
    officeFetch<Array<{ id: string; name: string }>>(
      `/api/office/setup/sets?categoryId=${encodeURIComponent(categoryId)}`
    ).then((res) => {
      loadingSetsRef.current.delete(categoryId);
      if (res.ok) {
        setSetsByCategory((prev) => ({
          ...prev,
          [categoryId]: res.data.map((s) => ({ id: String(s.id), name: String(s.name) })),
        }));
      }
    });
  }, []);

  useEffect(() => {
    for (const row of rows) if (row.categoryId) ensureSets(row.categoryId);
  }, [rows, ensureSets]);

  const updateRow = (key: string, patch: Partial<CommissionRuleDraft>) =>
    onChange(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  return (
    <div className="space-y-2">
      {rows.length === 0 ? (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-400">
          Koi rule row nahi — &quot;Add row&quot; se category / Set of Attestations ke hisaab se commission set
          karein. Rule na ho to commission 0.
        </p>
      ) : (
        <div className="space-y-2">
          <div
            className="hidden gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400 lg:grid"
            style={{ gridTemplateColumns: template }}
          >
            <span>Category</span>
            <span>Set of Attestations</span>
            {visibleKinds.map((kind) => (
              <span key={kind}>{KIND_FIELDS[kind].label}</span>
            ))}
            <span />
          </div>
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid grid-cols-1 gap-2 rounded-xl border border-slate-100 bg-white p-2 lg:grid-cols-[var(--dept-grid)] lg:border-0 lg:bg-transparent lg:p-0"
              style={{ ["--dept-grid" as string]: template }}
            >
              <select
                className={input}
                value={row.categoryId}
                onChange={(e) => {
                  const categoryId = e.target.value;
                  ensureSets(categoryId);
                  updateRow(row.key, { categoryId, setId: null });
                }}
              >
                <option value="">Category chunein…</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
              <select
                className={input}
                value={row.setId ?? ""}
                disabled={!row.categoryId}
                onChange={(e) => updateRow(row.key, { setId: e.target.value || null })}
              >
                <option value="">Poore category (default)</option>
                {(setsByCategory[row.categoryId] ?? []).map((set) => (
                  <option key={set.id} value={set.id}>
                    {set.name}
                  </option>
                ))}
              </select>
              {visibleKinds.map((kind) => {
                const { field, label } = KIND_FIELDS[kind];
                return (
                  <input
                    key={kind}
                    className={input}
                    inputMode="decimal"
                    placeholder={label}
                    aria-label={label}
                    value={row[field]}
                    onChange={(e) => updateRow(row.key, { [field]: e.target.value })}
                  />
                );
              })}
              <button
                type="button"
                className="grid h-9 w-9 place-items-center justify-self-start rounded-xl bg-red-50 text-red-600 hover:bg-red-100"
                onClick={() => onChange(rows.filter((item) => item.key !== row.key))}
                aria-label="Row hata dein"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2 text-xs font-semibold text-primary-700 hover:bg-primary-100"
        onClick={() => onChange([...rows, emptyRuleRow()])}
      >
        <Plus className="h-4 w-4" /> Add row
      </button>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Existing user ka grid editor — GET rules on mount, PUT on save      */
/* ------------------------------------------------------------------ */

type RuleRow = {
  categoryId: string;
  categoryName?: string;
  setId: string | null;
  setName?: string | null;
  printAmount: number;
  attestationAmount: number;
  courierAmount?: number;
};

export function DeptCommissionGridEditor({
  adminId,
  userName,
  kinds,
  onMessage,
  onSaved,
}: {
  adminId: string;
  userName: string;
  kinds?: DeptKind[];
  onMessage: (message: string, kind?: ToastKind) => void;
  onSaved?: () => void | Promise<void>;
}) {
  const [rows, setRows] = useState<CommissionRuleDraft[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    officeFetch<{ ok: boolean; rules: RuleRow[] }>(
      `/api/office/dept-commissions/rules?adminId=${encodeURIComponent(adminId)}`
    ).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setRows(
          (res.data.rules ?? []).map((rule) => ({
            key: `rule-${rule.categoryId}-${rule.setId ?? "all"}`,
            categoryId: String(rule.categoryId ?? ""),
            setId: rule.setId ? String(rule.setId) : null,
            printAmount: rule.printAmount ? String(rule.printAmount) : "",
            attestationAmount: rule.attestationAmount ? String(rule.attestationAmount) : "",
            courierAmount: rule.courierAmount ? String(rule.courierAmount) : "",
          }))
        );
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [adminId]);

  async function save() {
    setSaving(true);
    const result = await saveCommissionRules(adminId, rows);
    onMessage(
      result.ok ? "Commission rules save ho gaye — naye cases par lagenge" : result.error,
      result.ok ? "success" : "error"
    );
    if (result.ok && onSaved) await onSaved();
    setSaving(false);
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary-100 bg-primary-50/40 p-3">
      <div>
        <p className="text-sm font-semibold text-slate-800">Commission grid — {userName}</p>
        <p className="text-xs text-slate-500">{DEPT_COMMISSION_HINT}</p>
      </div>
      {loading ? (
        <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Rules load ho rahe hain
        </div>
      ) : (
        <DeptCommissionRowsEditor rows={rows} onChange={setRows} kinds={kinds} />
      )}
      <div>
        <button
          type="button"
          disabled={saving || loading}
          onClick={() => void save()}
          className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Commission save karein
        </button>
      </div>
    </div>
  );
}
