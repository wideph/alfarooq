"use client";

import { useEffect, useState } from "react";
import { Loader2, RefreshCw, Search, Signal, Timer } from "lucide-react";
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
  const [query, setQuery] = useState("");
  const [savingId, setSavingId] = useState("");
  const [message, setMessage] = useState("");

  async function loadVisitors(search = query) {
    setLoading(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/admin/visitors?${params}`);
    if (res.ok) {
      const data = await res.json();
      setVisitors(data.visitors || []);
      setStatuses(data.statuses || []);
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
      setMessage("Visitor status update ho gaya aur signal send kar diya gaya.");
      await loadVisitors();
    } else {
      setMessage("Visitor status update nahi ho saka.");
    }
    setSavingId("");
  }

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
            className="flex flex-col sm:flex-row gap-2"
          >
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Visitor ID, source, page search..."
                className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              />
            </div>
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-semibold text-white"
            >
              <Search className="w-4 h-4" />
              Search
            </button>
            <button
              type="button"
              onClick={() => loadVisitors()}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-700"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </form>

          {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin text-primary-500" />
            </div>
          ) : (
            <div className="space-y-3">
              {visitors.map((visitor) => (
                <div key={visitor.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 space-y-1">
                      <p className="break-all text-sm font-bold text-slate-900">{visitor.visitorKey}</p>
                      <p className="text-xs text-slate-500">
                        Source: {visitor.source || "unknown"}
                        {visitor.medium ? ` / ${visitor.medium}` : ""}
                        {visitor.campaign ? ` / ${visitor.campaign}` : ""}
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
