"use client";

import { useEffect, useState } from "react";
import {
  BarChart3,
  CalendarDays,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  Signal,
  Timer,
  X,
} from "lucide-react";
import { canonicalizeVisitorUrl } from "@/lib/visitor-client";

type VisitorStatus = { value: string; label: string; eventName: string };
type Visitor = {
  id: string;
  visitorKey: string;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  landingPage: string | null;
  currentPath: string | null;
  ipAddress: string | null;
  status: string;
  timeSpentSeconds: number;
  firstSeenAt: string;
  lastSeenAt: string;
  events: Array<{
    id: string;
    eventName: string;
    status: string | null;
    sentToMeta: boolean;
    sentToGoogle: boolean;
    sentToTikTok: boolean;
    error: string | null;
    createdAt: string;
  }>;
  _count: { botChats: number; userQuestions: number; events: number };
};
type VisitorSummary = {
  total: number;
  today: number;
  dailyVisitors: Array<{ date: string; count: number }>;
  statusCounts: Array<{ status: string; count: number }>;
};
type FilterOverrides = Partial<{
  statusFilter: string;
  dayFilter: string;
  monthFilter: string;
  fromDateTime: string;
  toDateTime: string;
}>;

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (mins < 60) return `${mins}m ${secs}s`;
  const hours = Math.floor(mins / 60);
  return `${hours}h ${mins % 60}m`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(value));
}

function toIsoFromLocal(value: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

function dayStartIso(value: string) {
  return toIsoFromLocal(`${value}T00:00:00`);
}

function dayEndIso(value: string) {
  return toIsoFromLocal(`${value}T23:59:59.999`);
}

function monthStartIso(value: string) {
  return toIsoFromLocal(`${value}-01T00:00:00`);
}

function monthEndIso(value: string) {
  if (!value) return "";
  const [year, month] = value.split("-").map(Number);
  if (!year || !month) return "";
  return new Date(year, month, 0, 23, 59, 59, 999).toISOString();
}

export default function VisitorTrackingPanel({
  defaultOpen = false,
  canWrite = true,
}: {
  defaultOpen?: boolean;
  canWrite?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [loading, setLoading] = useState(false);
  const [visitors, setVisitors] = useState<Visitor[]>([]);
  const [statuses, setStatuses] = useState<VisitorStatus[]>([]);
  const [summary, setSummary] = useState<VisitorSummary>({
    total: 0,
    today: 0,
    dailyVisitors: [],
    statusCounts: [],
  });
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dayFilter, setDayFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [fromDateTime, setFromDateTime] = useState("");
  const [toDateTime, setToDateTime] = useState("");
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  async function loadVisitors(search = query, overrides: FilterOverrides = {}) {
    setLoading(true);
    const nextStatusFilter = overrides.statusFilter ?? statusFilter;
    const nextDayFilter = overrides.dayFilter ?? dayFilter;
    const nextMonthFilter = overrides.monthFilter ?? monthFilter;
    const nextFromDateTime = overrides.fromDateTime ?? fromDateTime;
    const nextToDateTime = overrides.toDateTime ?? toDateTime;
    const params = new URLSearchParams();
    params.set("tzOffset", String(new Date().getTimezoneOffset()));
    if (search.trim()) params.set("q", search.trim());
    if (nextStatusFilter) params.set("status", nextStatusFilter);

    let from = "";
    let to = "";
    if (nextFromDateTime || nextToDateTime) {
      from = toIsoFromLocal(nextFromDateTime);
      to = toIsoFromLocal(nextToDateTime);
    } else if (nextDayFilter) {
      from = dayStartIso(nextDayFilter);
      to = dayEndIso(nextDayFilter);
    } else if (nextMonthFilter) {
      from = monthStartIso(nextMonthFilter);
      to = monthEndIso(nextMonthFilter);
    }

    if (from) params.set("from", from);
    if (to) params.set("to", to);

    const res = await fetch(`/api/admin/visitors?${params}`);
    if (res.ok) {
      const data = await res.json();
      setVisitors(data.visitors || []);
      setStatuses(data.statuses || []);
      setSummary(
        data.summary || {
          total: 0,
          today: 0,
          dailyVisitors: [],
          statusCounts: [],
        }
      );
    }
    setLoading(false);
  }

  useEffect(() => {
    if (open) void loadVisitors();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function updateStatus(visitorId: string, status: string) {
    if (!canWrite) return;
    setSavingId(visitorId);
    setMessage("");
    const res = await fetch("/api/admin/visitors", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ visitorId, status }),
    });

    if (res.ok) {
      const data = await res.json();
      setMessage("Visitor status update ho gaya. Ad signal background mein send ho raha hai.");
      setVisitors((prev) =>
        prev
          .map((visitor) =>
            visitor.id === visitorId
              ? {
                  ...visitor,
                  status,
                  events: data.event ? [data.event, ...visitor.events].slice(0, 5) : visitor.events,
                }
              : visitor
          )
          .filter((visitor) => !statusFilter || visitor.status === statusFilter)
      );
      void loadVisitors();
    } else {
      setMessage("Visitor status update nahi ho saka.");
    }
    setSavingId("");
  }

  function clearFilters() {
    setQuery("");
    setStatusFilter("");
    setDayFilter("");
    setMonthFilter("");
    setFromDateTime("");
    setToDateTime("");
  }

  const statusCountMap = new Map(summary.statusCounts.map((item) => [item.status, item.count]));

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 border-b border-slate-100 hover:bg-slate-50"
      >
        <span className="font-bold text-slate-900 flex items-center gap-2">
          <Signal className="w-5 h-5 text-emerald-600" />
          Visitors & Ad Signals
        </span>
        <span className="text-sm text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="p-5 sm:p-6 space-y-4">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void loadVisitors(query);
            }}
            className="space-y-3"
          >
            <div className="grid grid-cols-1 gap-2 xl:grid-cols-[1.2fr_0.7fr_0.7fr_0.7fr_auto_auto]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Visitor ID, IP, source, referrer, page..."
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(event) => setStatusFilter(event.target.value)}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              >
                <option value="">All statuses</option>
                {statuses.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={dayFilter}
                onChange={(event) => {
                  setDayFilter(event.target.value);
                  setMonthFilter("");
                  setFromDateTime("");
                  setToDateTime("");
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
              <input
                type="month"
                value={monthFilter}
                onChange={(event) => {
                  setMonthFilter(event.target.value);
                  setDayFilter("");
                  setFromDateTime("");
                  setToDateTime("");
                }}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
              <button
                type="submit"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
              >
                <Filter className="w-4 h-4" />
                Apply
              </button>
              <button
                type="button"
                onClick={() => {
                  clearFilters();
                  void loadVisitors("", {
                    statusFilter: "",
                    dayFilter: "",
                    monthFilter: "",
                    fromDateTime: "",
                    toDateTime: "",
                  });
                }}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                <X className="w-4 h-4" />
                Clear
              </button>
            </div>
            <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_1fr_auto]">
              <label className="text-xs font-medium text-slate-500">
                From date & time
                <input
                  type="datetime-local"
                  value={fromDateTime}
                  onChange={(event) => {
                    setFromDateTime(event.target.value);
                    setDayFilter("");
                    setMonthFilter("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <label className="text-xs font-medium text-slate-500">
                To date & time
                <input
                  type="datetime-local"
                  value={toDateTime}
                  onChange={(event) => {
                    setToDateTime(event.target.value);
                    setDayFilter("");
                    setMonthFilter("");
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                />
              </label>
              <button
                type="button"
                onClick={() => loadVisitors()}
                className="inline-flex items-center justify-center gap-2 self-end rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
              >
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </form>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                <BarChart3 className="h-4 w-4" />
                Filtered visitors
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{summary.total}</p>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase text-emerald-700">
                <CalendarDays className="h-4 w-4" />
                Today visitors
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-900">{summary.today}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="text-xs font-semibold uppercase text-slate-500">Status counts</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {statuses.map((status) => (
                  <button
                    key={status.value}
                    type="button"
                    onClick={() => {
                      setStatusFilter(status.value);
                      void loadVisitors(query, { statusFilter: status.value });
                    }}
                    className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
                  >
                    {status.label}: {statusCountMap.get(status.value) || 0}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {summary.dailyVisitors.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                Daily visitors
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {summary.dailyVisitors.slice(0, 31).map((item) => (
                  <button
                    key={item.date}
                    type="button"
                    onClick={() => {
                      setDayFilter(item.date);
                      setMonthFilter("");
                      setFromDateTime("");
                      setToDateTime("");
                      void loadVisitors(query, {
                        dayFilter: item.date,
                        monthFilter: "",
                        fromDateTime: "",
                        toDateTime: "",
                      });
                    }}
                    className="shrink-0 rounded-xl bg-slate-50 px-3 py-2 text-left text-xs text-slate-600 hover:bg-slate-100"
                  >
                    <span className="block font-semibold text-slate-800">{item.date}</span>
                    {item.count} visitors
                  </button>
                ))}
              </div>
            </div>
          )}

          {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            </div>
          ) : (
            <div className="space-y-3">
              {visitors.map((visitor) => (
                <div
                  key={visitor.id}
                  className={`rounded-xl border p-4 ${
                    visitor.status === "blocked"
                      ? "border-red-200 bg-red-50"
                      : "border-slate-200 bg-slate-50"
                  }`}
                >
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="break-all text-sm font-bold text-slate-900">{visitor.visitorKey}</p>
                      {visitor.status === "blocked" && (
                        <span className="inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-700">
                          IP blocked
                        </span>
                      )}
                      <p className="text-xs text-slate-500">
                        Source: {visitor.source || "unknown"}
                        {visitor.medium ? ` / ${visitor.medium}` : ""}
                        {visitor.campaign ? ` / ${visitor.campaign}` : ""}
                      </p>
                      <p className="break-all text-xs text-slate-500">
                        IP: {visitor.ipAddress || "-"}
                      </p>
                      <p className="break-all text-xs text-slate-500">
                        Page:{" "}
                        {canonicalizeVisitorUrl(visitor.currentPath || visitor.landingPage) || "-"}
                      </p>
                      <p className="break-all text-xs text-slate-400">
                        Referrer: {canonicalizeVisitorUrl(visitor.referrer) || "direct"}
                      </p>
                      <div className="flex flex-wrap gap-2 pt-1 text-xs">
                        <span className="rounded-full bg-white px-2 py-1 text-slate-600">
                          Started: {formatDateTime(visitor.firstSeenAt)}
                        </span>
                        <span className="rounded-full bg-white px-2 py-1 text-slate-600">
                          Last: {formatDateTime(visitor.lastSeenAt)}
                        </span>
                        <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-1 text-slate-600">
                          <Timer className="w-3.5 h-3.5" />
                          {formatDuration(visitor.timeSpentSeconds)}
                        </span>
                        <span className="rounded-full bg-white px-2 py-1 text-slate-600">
                          Chats: {visitor._count.botChats}
                        </span>
                        <span className="rounded-full bg-white px-2 py-1 text-slate-600">
                          Questions: {visitor._count.userQuestions}
                        </span>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:min-w-56">
                      {canWrite ? (
                        <select
                          value={visitor.status}
                          onChange={(event) => updateStatus(visitor.id, event.target.value)}
                          disabled={savingId === visitor.id}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                        >
                          {statuses.map((status) => (
                            <option key={status.value} value={status.value}>
                              {status.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <span className="rounded-xl bg-white px-3 py-2 text-sm font-semibold text-slate-700">
                          Status: {visitor.status}
                        </span>
                      )}
                      {visitor.events[0] && (
                        <p className="text-xs text-slate-500">
                          Last signal: {visitor.events[0].eventName} · Meta{" "}
                          {visitor.events[0].sentToMeta ? "sent" : "not sent"}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              {visitors.length === 0 && (
                <p className="py-8 text-center text-sm text-slate-400">Koi visitor record nahi mila</p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
