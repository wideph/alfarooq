"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, Check, CheckCheck, Flame, Loader2, Plus, Search, Wallet, X } from "lucide-react";
import OfficePageFrame from "@/components/office/OfficePageFrame";
import CaseStatusSelect from "@/components/office/case/CaseStatusSelect";
import DeleteCaseButton from "@/components/office/case/DeleteCaseButton";
import DeptQueue, { type DeptQueueKey, type DeptQueueRow } from "@/components/office/case/DeptQueue";
import CustomLabelChip from "@/components/office/case/CustomLabelChip";
import { adminCanAny, type AdminNavUser } from "@/components/admin/AdminNav";
import { formatDate, formatMoney, officeFetch, toInputDate } from "@/lib/office/client";
import { ATTESTATION_STATUS_STYLES, caseStatusLabel, caseStatusStyle, STATUS_LABELS } from "@/lib/office/labels";
import { CASE_STATUSES, CLOSED_CASE_STATUSES, isDeptWorkerAccess } from "@/lib/office/permissions";
import { useToast } from "@/hooks/useToast";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";
import { CASES_HREF, caseDetailHref, locationOf } from "@/lib/office/case-nav";
import type { CaseQueueCounts } from "@/lib/office/case-queues";
import type { AdminPermission } from "@/components/admin/AdminNav";

// §W18: atta → attestation rename (permission office:attestation-dept:write);
// auth.ts mid-flight hai — cast dono states mein compile hota hai.
const ATTESTATION_DEPT_PERMISSION = "office:attestation-dept:write" as AdminPermission;

// §N7 department queues (?dept=). Tab sirf tab dikhta hai jab user ke paas us
// department ki write permission ho; admin / cashier ko saare tabs milte hain.
const DEPT_TABS: Array<{ key: DeptQueueKey; label: string; permission: AdminPermission }> = [
  { key: "filing", label: "Filing queue", permission: "office:filing:write" },
  { key: "printing", label: "Printing queue", permission: "office:printing:write" },
  { key: "attestation", label: "Attestation queue", permission: ATTESTATION_DEPT_PERMISSION },
  { key: "courier", label: "Courier queue", permission: "office:courier:write" },
];

function canSeeDeptTab(admin: AdminNavUser, permission: AdminPermission) {
  return adminCanAny(admin, [permission]) || admin.role === "cashier";
}

// §W35: status queues (workflow order) — har queue ke upar us ke TAMAM cases
// ki tadad. Labels chhote (poora label tooltip mein).
const STATUS_QUEUE_LABELS: Record<string, string> = {
  FIRST_PAYMENT_PENDING: "1st payment pending",
  WAITING_FOR_FILE: "Waiting for file",
  WAITING_FOR_PRINTING: "Waiting for printing",
  PRINTED: "Printed",
  ATTESTATION: "Attestation",
  ATTESTATION_COMPLETE: "Final payment pending",
  WAITING_FOR_COURIER_ADDRESS: "Waiting for address",
  WAITING_FOR_COURIER: "Waiting for delivery",
  DELIVERED: "Delivered",
  MUSADIQA_APPLIED: "Musadiqa applied",
  MUSADIQA_FEES_PAID: "Musadiqa fees paid",
  MUSADIQA_SENT_BY_BOARD: "Musadiqa sent by board",
  MUSADIQA_VERIFIED: "Musadiqa verified",
  CANCELLED: "Cancelled",
};

function CountPill({ count, active }: { count: number | undefined; active: boolean }) {
  if (count === undefined) return null;
  return (
    <span
      className={`ml-1.5 inline-flex min-w-[1.25rem] justify-center rounded-full px-1.5 text-[11px] font-bold ${
        active ? "bg-white/25 text-white" : count > 0 ? "bg-primary-50 text-primary-700" : "bg-slate-100 text-slate-400"
      }`}
    >
      {count}
    </span>
  );
}

const chipClass = (active: boolean) =>
  `inline-flex shrink-0 items-center rounded-full px-3.5 py-1.5 text-sm font-semibold ${
    active ? "bg-primary-600 text-white" : "border border-slate-200 bg-white text-slate-600 hover:border-primary-300"
  }`;

// Filing department ko stripped payload milta hai (no money/office fields),
// is liye baqi fields optional hain. §W18: base row shape DeptQueue se aati hai
// (slim cross-office rows limited: true — dept mode mein money kabhi render nahi).
type CaseRow = DeptQueueRow & {
  clientName?: string;
  totals?: { received: number; remaining: number; extra: number; pendingCount: number; agreedAmount: number };
  setMissingWarning?: boolean;
  hasUnseenWarning?: boolean;
  // §W14.2: expenses ka compact summary har row ke saath.
  expenseSummary?: { count: number; total: number; reasons: string[] };
};

type Office = { id: string; name: string };

const input =
  "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100";

// Row ke andar interactive control (status select / expense button) — click
// row tak na pohnchay (warna detail page khul jata hai).
function stopRowClick(e: React.MouseEvent) {
  e.stopPropagation();
}

function CasesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<CaseRow[]>([]);
  const [total, setTotal] = useState(0);
  // §W35: queue counts + super admin ka unread (null = read tracking nahi).
  const [counts, setCounts] = useState<CaseQueueCounts | null>(null);
  const [unread, setUnread] = useState<number | null>(null);
  const [readBusy, setReadBusy] = useState<string | null>(null);
  const [offices, setOffices] = useState<Office[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState(searchParams.get("q") || "");
  const status = searchParams.get("status") || "";
  const officeId = searchParams.get("officeId") || "";
  const dept = searchParams.get("dept") || "";
  // §W18: sirf jaiz dept keys par dept mode — unknown ?dept= normal list hi dikhata hai.
  const deptTab = DEPT_TABS.find((tab) => tab.key === dept) || null;
  const history = searchParams.get("history") === "1";
  const page = Number(searchParams.get("page")) || 1;
  // §W34: detail link ke saath ye list (tab + filters + page) — detail page se
  // wapsi isi par, aur navbar mein yehi tab active rehta hai.
  const fromHere = locationOf(CASES_HREF, searchParams);
  const detailHref = (id: string) => caseDetailHref(id, fromHere);

  // F5: cases list se hi expense entry (admin / office:expenses:write) —
  // detail page kholne ki zaroorat nahi. Toast popup se success/error.
  const { showToast, ToastElement } = useToast();
  const [expenseCase, setExpenseCase] = useState<CaseRow | null>(null);
  const [expenseSaving, setExpenseSaving] = useState(false);
  const [expenseForm, setExpenseForm] = useState({ amount: "", description: "", expenseDate: toInputDate(new Date()) });

  function openExpenseModal(item: CaseRow) {
    setExpenseForm({ amount: "", description: "", expenseDate: toInputDate(new Date()) });
    setExpenseCase(item);
  }

  async function submitExpense() {
    if (!expenseCase) return;
    const amount = expenseForm.amount.trim();
    if (!amount || Number(amount) <= 0) {
      showToast("Amount sahi nahi hai", "error");
      return;
    }
    // §W14.1: tafseel optional hai (khali bhi chalti hai).
    if (!expenseForm.expenseDate) {
      showToast("Expense date zaroori hai", "error");
      return;
    }
    setExpenseSaving(true);
    const res = await officeFetch(`/api/office/cases/${expenseCase.id}/expenses`, {
      method: "POST",
      json: {
        amount,
        description: expenseForm.description.trim(),
        expenseDate: expenseForm.expenseDate,
      },
    });
    setExpenseSaving(false);
    if (res.ok) {
      showToast("Expense add ho gaya", "success");
      setExpenseCase(null);
    } else {
      showToast(res.error, "error");
    }
  }

  // silent=true par loading spinner nahi (live-refresh background mein chale).
  const load = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      const params = new URLSearchParams();
      if (status) params.set("status", status);
      if (officeId) params.set("officeId", officeId);
      if (dept) params.set("dept", dept);
      if (history) params.set("history", "1");
      if (searchParams.get("q")) params.set("q", searchParams.get("q") || "");
      params.set("page", String(page));
      const res = await officeFetch<{
        items: CaseRow[];
        total: number;
        counts?: CaseQueueCounts | null;
        unread?: number | null;
      }>(`/api/office/cases?${params}`);
      if (res.ok) {
        setItems(res.data.items);
        setTotal(res.data.total);
        setCounts(res.data.counts ?? null);
        setUnread(res.data.unread ?? null);
      }
      if (!silent) setLoading(false);
    },
    [status, officeId, dept, history, page, searchParams]
  );

  useEffect(() => {
    void load();
  }, [load]);

  // §W11.5: list live rehti hai — 15s polling + window focus + office:changed
  // (background refresh silent hota hai, koi spinner flash nahi).
  // §W20 (P2): promise return hota hai taake hook in-flight dedup kar sake.
  useLiveRefresh(useCallback(() => load(true), [load]));

  useEffect(() => {
    officeFetch<Office[]>("/api/office/setup/booking-offices").then((res) => {
      if (res.ok) setOffices(res.data);
    });
  }, []);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.push(`/office/cases?${params}`);
  }

  // §W35: dept queue aur status queue ek waqt mein ek hi — dono chips ek
  // doosre ka filter saaf karte hain (chhupa hua filter list khali na kare).
  function selectDept(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (key && dept !== key) params.set("dept", key);
    else params.delete("dept");
    params.delete("status");
    params.delete("history");
    params.delete("page");
    router.push(`/office/cases?${params}`);
  }

  function selectStatus(key: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (key && status !== key) params.set("status", key);
    else params.delete("status");
    params.delete("dept");
    params.delete("history");
    params.delete("page");
    router.push(`/office/cases?${params}`);
  }

  // §W35: Read — row ka wahi status jo user ne dekha (beech mein queue badli
  // ho to case unread hi rehta hai). Jawab ka unread count foran header mein;
  // navbar badge office:changed se khud refresh.
  async function markRead(item: DeptQueueRow) {
    setReadBusy(item.id);
    const res = await officeFetch<{ unread: number }>("/api/office/case-reads", {
      method: "POST",
      json: { items: [{ id: item.id, status: item.status }] },
    });
    setReadBusy(null);
    if (res.ok) {
      setItems((prev) => prev.map((row) => (row.id === item.id ? { ...row, unread: false } : row)));
      setUnread(res.data.unread);
    } else showToast(res.error, "error");
  }

  async function markAllRead() {
    setReadBusy("all");
    const res = await officeFetch<{ unread: number }>("/api/office/case-reads", { method: "POST", json: { all: true } });
    setReadBusy(null);
    if (res.ok) {
      setItems((prev) => prev.map((row) => (row.unread ? { ...row, unread: false } : row)));
      setUnread(res.data.unread);
      showToast("Sab cases read ho gaye", "success");
    } else showToast(res.error, "error");
  }

  function readControl(item: DeptQueueRow) {
    if (item.unread === undefined) return null;
    return (
      <span onClick={stopRowClick} onMouseEnter={(e) => e.stopPropagation()}>
        {item.unread ? (
          <button
            type="button"
            onClick={() => void markRead(item)}
            disabled={readBusy === item.id || readBusy === "all"}
            title="Read mark karein (doosri queue mein jaye to phir unread)"
            className="inline-flex items-center gap-1 rounded-lg bg-primary-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-primary-700 disabled:opacity-50"
          >
            {readBusy === item.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />} Read
          </button>
        ) : (
          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-400">
            <CheckCheck className="h-3.5 w-3.5" /> Read
          </span>
        )}
      </span>
    );
  }

  // §W11.2: poori row clickable → detail page (hover par prefetch).
  function rowProps(item: CaseRow) {
    return {
      onClick: () => router.push(detailHref(item.id)),
      onMouseEnter: () => router.prefetch(detailHref(item.id)),
      className: `cursor-pointer hover:bg-slate-50 ${item.unread ? "bg-primary-50/40" : ""}`,
    };
  }

  function openCase(item: CaseRow) {
    router.push(detailHref(item.id));
  }

  // Status cell content — admin ko inline CaseStatusSelect, baqi ko plain chip.
  // ATTESTATION par current attestation ka naam label mein shamil hota hai.
  function statusCell(item: CaseRow, admin: AdminNavUser) {
    const currentName =
      item.status === "ATTESTATION"
        ? item.attestations?.find((a) => a.id === item.currentAttestationId)?.attestationType.name || null
        : null;
    return (
      <>
        {admin.role === "admin" ? (
          <span onClick={stopRowClick} onMouseEnter={(e) => e.stopPropagation()}>
            <CaseStatusSelect
              caseId={item.id}
              status={item.status}
              currentAttestationId={item.currentAttestationId}
              attestations={item.attestations}
              // §W20 (P2): alag explicit reload duplicate fetch tha, hata diya.
              onChanged={() => {
                // Status PATCH ke baad officeFetch ka office:changed event
                // khud 300ms mein list reload kar deta hai (useLiveRefresh).
              }}
              size="sm"
            />
          </span>
        ) : (
          <span className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${caseStatusStyle(item.status)}`}>
            {caseStatusLabel(item.status, currentName)}
          </span>
        )}
        {(item.totals?.pendingCount ?? 0) > 0 && (
          <p className="mt-1 text-[11px] text-amber-600">{item.totals!.pendingCount} payment verify pending</p>
        )}
      </>
    );
  }

  function identityBlock(item: CaseRow, admin: AdminNavUser) {
    return (
      <>
        <div className="flex flex-wrap items-center gap-1.5">
          {item.unread && <span title="Unread" className="inline-block h-2.5 w-2.5 rounded-full bg-primary-600" />}
          <span className="font-semibold text-primary-700">{item.caseNumber}</span>
          <CustomLabelChip label={item.customLabel} color={item.customLabelColor} />
          {item.isUrgent && (
            <span className="inline-flex items-center gap-0.5 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
              <Flame className="w-3 h-3" /> URGENT
            </span>
          )}
          {item.setMissingWarning && (
            <span
              title="Is case ka Set of Attestations select nahi kiya gaya"
              className="inline-flex items-center gap-0.5 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700"
            >
              <AlertTriangle className="w-3 h-3" /> Set of Attestations missing
            </span>
          )}
          {item.hasUnseenWarning && (
            <span
              title="Aap ke department ke liye new remarks"
              className="inline-block h-2.5 w-2.5 rounded-full bg-amber-400"
            />
          )}
          {admin.role === "admin" && (
            <span className="ml-auto" onClick={stopRowClick} onMouseEnter={(e) => e.stopPropagation()}>
              <DeleteCaseButton
                caseId={item.id}
                caseNumber={item.caseNumber}
                size="sm"
                onMessage={showToast}
                onDeleted={() => setItems((prev) => prev.filter((c) => c.id !== item.id))}
              />
            </span>
          )}
        </div>
        <p className="text-slate-800">{item.clientName || "—"}</p>
        <p className="text-xs text-slate-400">
          {item.rollNumber ? `Roll ${item.rollNumber}` : ""}
          {item.rollNumber && item.registrationNumber ? " · " : ""}
          {item.registrationNumber ? `Reg ${item.registrationNumber}` : ""}
        </p>
        <p className="text-xs text-slate-400">
          {item.createdAt ? formatDate(item.createdAt) : ""}
          {item.setName ? ` · Set: ${item.setName}` : ""}
        </p>
        {/* §W14.2: expenses hain to compact red line (+ pehla reason, tooltip
            men tamam reasons). */}
        {(item.expenseSummary?.count ?? 0) > 0 && (
          <p
            className="text-xs text-red-600"
            title={
              item.expenseSummary!.reasons.length > 0
                ? item.expenseSummary!.reasons.join(" · ")
                : undefined
            }
          >
            Expenses: {item.expenseSummary!.count} · {formatMoney(item.expenseSummary!.total)}
            {item.expenseSummary!.reasons[0] ? (
              <span className="text-red-400"> — {item.expenseSummary!.reasons[0]}</span>
            ) : null}
          </p>
        )}
        {(admin.role === "admin" || adminCanAny(admin, ["office:expenses:write"])) && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              openExpenseModal(item);
            }}
            className="mt-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[11px] font-semibold text-slate-600 hover:border-primary-300 hover:text-primary-700"
          >
            <Wallet className="w-3 h-3" /> Expense
          </button>
        )}
      </>
    );
  }

  function attestationChips(item: CaseRow) {
    return (
      <div className="flex flex-wrap gap-1">
        {(!item.attestations || item.attestations.length === 0) && <span className="text-xs text-slate-400">—</span>}
        {(item.attestations || []).map((a) => {
          const isCurrent = a.id === item.currentAttestationId && item.status === "ATTESTATION";
          return (
            <span
              key={a.id}
              title={a.completedDate ? `Done ${formatDate(a.completedDate)}` : a.status}
              className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${ATTESTATION_STATUS_STYLES[a.status]} ${
                isCurrent ? "ring-2 ring-violet-400" : ""
              }`}
            >
              {a.attestationType.name}
            </span>
          );
        })}
      </div>
    );
  }

  function moneyLine(item: CaseRow) {
    if (!item.totals) return <span className="text-xs text-slate-400">—</span>;
    return (
      <>
        <p>Agreed: {formatMoney(item.totals.agreedAmount)}</p>
        <p className="text-emerald-700">Received: {formatMoney(item.totals.received)}</p>
        {item.totals.remaining > 0 && <p className="text-amber-700">Remaining: {formatMoney(item.totals.remaining)}</p>}
        {item.totals.extra > 0 && <p className="text-violet-700">Extra: {formatMoney(item.totals.extra)}</p>}
      </>
    );
  }

  return (
    <OfficePageFrame>
      {(admin) => {
        // §W36: printing / attestation / courier worker — Money column nahi
        // (API bhi rows mein koi raqam nahi bhejta).
        const deptWorker = isDeptWorkerAccess(admin.role, admin.permissions);
        const columnCount = 5 + (deptWorker ? 0 : 1) + (unread !== null ? 1 : 0);
        return (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold text-slate-900">
              Cases <span className="text-sm font-normal text-slate-400">({total})</span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {/* §W35: super admin — saare unread cases read (navbar count 0). */}
              {unread !== null && (
                <button
                  type="button"
                  onClick={() => void markAllRead()}
                  disabled={unread === 0 || readBusy !== null}
                  className="inline-flex items-center gap-2 rounded-xl border border-primary-200 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50"
                >
                  {readBusy === "all" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
                  Read all
                  {unread > 0 && (
                    <span className="rounded-full bg-primary-600 px-1.5 text-[11px] font-bold text-white">{unread}</span>
                  )}
                </button>
              )}
              {adminCanAny(admin, ["office:cases:write"]) && (
                <Link
                  href="/office/cases/new"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white"
                >
                  <Plus className="w-4 h-4" /> New case
                </Link>
              )}
            </div>
          </div>

          {DEPT_TABS.some((tab) => canSeeDeptTab(admin, tab.permission)) && (
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => selectDept("")} className={chipClass(!dept && !status)}>
                All cases
                <CountPill count={counts?.total} active={!dept && !status} />
              </button>
              {DEPT_TABS.filter((tab) => canSeeDeptTab(admin, tab.permission)).map((tab) => (
                <button key={tab.key} onClick={() => selectDept(tab.key)} className={chipClass(dept === tab.key)}>
                  {tab.label}
                  <CountPill count={counts?.depts[tab.key]} active={dept === tab.key} />
                </button>
              ))}
              {dept === "filing" && (
                <label className="ml-1 inline-flex items-center gap-1.5 text-xs text-slate-500">
                  <input
                    type="checkbox"
                    checked={history}
                    onChange={(e) => setParam("history", e.target.checked ? "1" : "")}
                    className="rounded border-slate-300"
                  />
                  History (filing se aage ke cases)
                </label>
              )}
            </div>
          )}

          {/* §W47: courier ke do alag pages — tab khulte hi "Waiting for courier
              slip"; delivered cases alag page par. */}
          {dept === "courier" && (
            <div role="tablist" aria-label="Courier pages" className="flex w-full gap-1 rounded-2xl bg-slate-100 p-1 sm:w-fit">
              {[
                { key: "", label: "Waiting for courier slip", count: counts?.depts.courier },
                { key: "1", label: "Delivered", count: counts?.deptDone?.courier },
              ].map((tab) => {
                const active = (tab.key === "1") === history;
                return (
                  <button
                    key={tab.label}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setParam("history", tab.key)}
                    className={`inline-flex flex-1 items-center justify-center rounded-xl px-4 py-2 text-sm font-semibold sm:flex-none ${
                      active ? "bg-white text-primary-700 shadow-sm" : "text-slate-600 hover:text-primary-700"
                    }`}
                  >
                    {tab.label}
                    <CountPill count={tab.count} active={false} />
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <form
              className="flex flex-1 min-w-[14rem] gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setParam("q", q.trim());
              }}
            >
              <input
                className={`${input} flex-1`}
                placeholder="Case #, name, roll / reg no, phone"
                value={q}
                onChange={(e) => setQ(e.target.value)}
              />
              <button className="rounded-xl border border-slate-200 bg-white px-3 text-slate-600">
                <Search className="w-4 h-4" />
              </button>
            </form>
            {admin.role !== "booking_office" && (
              <select className={input} value={officeId} onChange={(e) => setParam("officeId", e.target.value)}>
                <option value="">All offices</option>
                {offices.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* §W35: status queues — har queue ek chip, upar us ke TAMAM cases ki
              tadad (unread nahi). Mobile par side scroll, desktop par wrap. */}
          {!deptTab && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible">
              <button
                onClick={() => selectStatus("open")}
                title="Delivery / musadiqa / cancelled ke ilawa"
                className={chipClass(status === "open")}
              >
                Open
                <CountPill
                  count={
                    counts
                      ? counts.total - CLOSED_CASE_STATUSES.reduce((sum, key) => sum + (counts.statuses[key] || 0), 0)
                      : undefined
                  }
                  active={status === "open"}
                />
              </button>
              {CASE_STATUSES.map((key) => (
                <button
                  key={key}
                  onClick={() => selectStatus(key)}
                  title={STATUS_LABELS[key]}
                  className={chipClass(status === key)}
                >
                  {STATUS_QUEUE_LABELS[key] || STATUS_LABELS[key]}
                  <CountPill count={counts ? counts.statuses[key] || 0 : undefined} active={status === key} />
                </button>
              ))}
            </div>
          )}

          {/* §W18: dept mode apna work-appropriate column set use karta hai
              (office chip hamesha, koi money/expense/status controls nahi);
              normal list bilkul pehle jaisi rehti hai. */}
          {deptTab ? (
            <DeptQueue
              dept={deptTab.key}
              items={items}
              loading={loading}
              history={history}
              from={fromHere}
              readControl={unread !== null ? readControl : undefined}
            />
          ) : (
          <>
          {/* §W11.2 MOBILE: md se neeche compact cards (table ki jagah). */}
          <div className="space-y-2 md:hidden">
            {loading ? (
              <div className="flex justify-center rounded-2xl border border-slate-200 bg-white py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
              </div>
            ) : items.length === 0 ? (
              <p className="rounded-2xl border border-slate-200 bg-white px-3 py-8 text-center text-sm text-slate-400">
                Koi case nahi mila
              </p>
            ) : (
              items.map((item) => (
                <div
                  key={item.id}
                  role="link"
                  tabIndex={0}
                  onClick={() => openCase(item)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") openCase(item);
                  }}
                  onMouseEnter={() => router.prefetch(detailHref(item.id))}
                  className={`cursor-pointer space-y-2 rounded-2xl border p-3 shadow-sm active:bg-slate-50 ${
                    item.unread ? "border-primary-200 bg-primary-50/40" : "border-slate-200 bg-white"
                  }`}
                >
                  {identityBlock(item, admin)}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>{statusCell(item, admin)}</div>
                    {readControl(item)}
                  </div>
                  {!deptWorker && <div className="text-xs">{moneyLine(item)}</div>}
                  {attestationChips(item)}
                </div>
              ))
            )}
          </div>

          {/* DESKTOP: table — poori row clickable (expense/status ke ilawa). */}
          <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm md:block">
            {loading ? (
              <div className="flex justify-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
              </div>
            ) : (
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-3 py-2">Case</th>
                    <th className="px-3 py-2">Office / Category</th>
                    <th className="px-3 py-2">Status</th>
                    {!deptWorker && <th className="px-3 py-2">Money</th>}
                    <th className="px-3 py-2">Print</th>
                    <th className="px-3 py-2">Attestations</th>
                    {unread !== null && <th className="px-3 py-2">Read</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length === 0 && (
                    <tr>
                      <td colSpan={columnCount} className="px-3 py-8 text-center text-slate-400">
                        Koi case nahi mila
                      </td>
                    </tr>
                  )}
                  {items.map((item) => (
                    <tr key={item.id} {...rowProps(item)}>
                      <td className="px-3 py-3 align-top">{identityBlock(item, admin)}</td>
                      <td className="px-3 py-3 align-top">
                        <p className="text-slate-800">{item.bookingOffice?.name || "—"}</p>
                        <p className="text-xs text-slate-500">{item.category?.name || "—"}</p>
                      </td>
                      <td className="px-3 py-3 align-top">{statusCell(item, admin)}</td>
                      {!deptWorker && <td className="px-3 py-3 align-top text-xs">{moneyLine(item)}</td>}
                      <td className="px-3 py-3 align-top text-xs">
                        {item.isPrinted !== undefined ? (
                          <>
                            <p className={item.isPrinted ? "font-semibold text-emerald-700" : "text-slate-500"}>
                              {item.isPrinted ? "Printed" : "Not printed"}
                            </p>
                            <p className="text-slate-500">Expected: {formatDate(item.expectedPrintingDate)}</p>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">{attestationChips(item)}</td>
                      {unread !== null && <td className="px-3 py-3 align-top">{readControl(item)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          </>
          )}

          {total > 50 && (
            <div className="flex justify-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setParam("page", String(page - 1))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="px-2 py-2 text-sm text-slate-500">Page {page}</span>
              <button
                disabled={page * 50 >= total}
                onClick={() => setParam("page", String(page + 1))}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}

          {expenseCase && (
            <div
              className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/40 p-4"
              onClick={() => !expenseSaving && setExpenseCase(null)}
            >
              <div
                className="w-full max-w-md space-y-4 rounded-2xl bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Expense add karein</h3>
                    <p className="text-xs text-slate-500">
                      Case {expenseCase.caseNumber}
                      {expenseCase.clientName ? ` · ${expenseCase.clientName}` : ""}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setExpenseCase(null)}
                    className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                    aria-label="Band karein"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Amount (Rs) *</label>
                  <input
                    className={`${input} w-full`}
                    inputMode="decimal"
                    placeholder="Maslan: 500"
                    value={expenseForm.amount}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Tafseel (optional)</label>
                  <input
                    className={`${input} w-full`}
                    placeholder="Expense ki tafseel likhna optional hai"
                    value={expenseForm.description}
                    onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs text-slate-500">Expense date *</label>
                  <input
                    type="date"
                    className={`${input} w-full`}
                    value={expenseForm.expenseDate}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expenseDate: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    disabled={expenseSaving}
                    onClick={() => setExpenseCase(null)}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={expenseSaving}
                    onClick={submitExpense}
                    className="inline-flex items-center gap-2 rounded-xl bg-primary-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {expenseSaving && <Loader2 className="w-4 h-4 animate-spin" />}
                    Save expense
                  </button>
                </div>
              </div>
            </div>
          )}

          {ToastElement}
        </div>
        );
      }}
    </OfficePageFrame>
  );
}

export default function OfficeCasesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        </div>
      }
    >
      <CasesList />
    </Suspense>
  );
}
