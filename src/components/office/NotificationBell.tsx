"use client";

import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, CheckCheck, Loader2 } from "lucide-react";
import { officeFetch } from "@/lib/office/client";
import { useLiveRefresh } from "@/hooks/useLiveRefresh";

// §W11.8 — notification bell (OfficeNav + AdminNav dono mein): unread badge,
// dropdown (title / body / relative time), item click → read + link par
// navigate, "Mark all read". 20s polling + office:changed event par refresh.

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

type NotificationsResponse = { items: NotificationItem[]; unread: number };

// §W11.7 — navbar count bubbles ke liye aggregated counts (30s polling +
// office:changed). Sirf count queries — lightweight. Fail par null rehta hai
// (bubbles chhup jate hain, page kharab nahi hota).
export type OfficeNavCounts = {
  cases: number;
  payments: number;
  requests: number;
  unreadNotifications: number;
};

export function useOfficeNavCounts(enabled = true): OfficeNavCounts | null {
  const [counts, setCounts] = useState<OfficeNavCounts | null>(null);

  const load = useCallback(async () => {
    if (!enabled) return;
    const res = await officeFetch<OfficeNavCounts>("/api/office/nav-counts");
    if (res.ok) setCounts(res.data);
  }, [enabled]);

  useLiveRefresh(load, { intervalMs: 30000 });
  return counts;
}

// Amber count bubble — 0 ya null par kuch nahi dikhta. Absolute: apne parent
// link/button (relative) ke andar -top-1 -right-1 par float karta hai, taake
// layout kabhi push na ho (nav overlap fix, §W12.2).
export function NavCountBubble({ count }: { count: number | null | undefined }) {
  if (!count) return null;
  return (
    <span className="pointer-events-none absolute -top-1 -right-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-amber-400 px-1 text-[10px] font-bold text-amber-900 shadow-sm">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function relativeTime(value: string): string {
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  if (Number.isNaN(diffMs)) return "";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "abhi";
  if (minutes < 60) return `${minutes} min pehle`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} ghante pehle`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} din pehle`;
  return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

export default function NotificationBell() {
  const router = useRouter();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  // §W12.7: dropdown position:fixed (navbar ka overflow-x-auto ancestor use
  // clip kar deta tha — "ajeeb behave"). Open par bell ke rect se anchor.
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const [data, setData] = useState<NotificationsResponse | null>(null);
  const [marking, setMarking] = useState(false);

  const load = useCallback(async () => {
    const res = await officeFetch<NotificationsResponse>("/api/office/notifications");
    if (res.ok) setData(res.data);
  }, []);

  // 20s polling + focus + office:changed (mutations ke foran baad).
  useLiveRefresh(load, { intervalMs: 20000 });

  const unread = data?.unread ?? 0;

  function toggleOpen(event: React.MouseEvent<HTMLButtonElement>) {
    event.stopPropagation();
    setOpen((o) => {
      const next = !o;
      if (next) {
        const rect = buttonRef.current?.getBoundingClientRect();
        if (rect) {
          const viewportWidth = window.innerWidth;
          // Right-aligned with the bell, clamped inside the viewport (8px margin).
          const right = Math.min(Math.max(viewportWidth - rect.right, 8), viewportWidth - 8);
          const top = Math.min(rect.bottom + 8, window.innerHeight - 8);
          setPos({ top, right });
        } else {
          setPos({ top: 64, right: 8 });
        }
      }
      return next;
    });
  }

  async function openItem(item: NotificationItem) {
    setOpen(false);
    if (!item.readAt) {
      const res = await officeFetch<{ unread: number }>("/api/office/notifications/read", {
        method: "POST",
        json: { ids: [item.id] },
      });
      if (res.ok) {
        setData((prev) =>
          prev
            ? {
                unread: res.data.unread,
                items: prev.items.map((n) => (n.id === item.id ? { ...n, readAt: new Date().toISOString() } : n)),
              }
            : prev
        );
      }
    }
    if (item.link) router.push(item.link);
  }

  async function markAllRead() {
    setMarking(true);
    const res = await officeFetch<{ unread: number }>("/api/office/notifications/read", {
      method: "POST",
      json: {},
    });
    if (res.ok) {
      setData((prev) =>
        prev ? { unread: res.data.unread, items: prev.items.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })) } : prev
      );
    }
    setMarking(false);
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={buttonRef}
        type="button"
        title="Notifications"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ""}`}
        onClick={toggleOpen}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 transition-colors hover:bg-slate-100"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label="Notifications band karein"
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div
            className="fixed z-50 flex max-h-[70vh] w-80 max-w-[calc(100vw-1rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg"
            style={pos ? { top: pos.top, right: pos.right } : undefined}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notifications</p>
              {unread > 0 && (
                <button
                  type="button"
                  disabled={marking}
                  onClick={markAllRead}
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-primary-700 hover:bg-primary-50 disabled:opacity-50"
                >
                  {marking ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCheck className="h-3 w-3" />}
                  Mark all read
                </button>
              )}
            </div>
            <div className="overflow-y-auto">
              {data === null ? (
                <p className="px-3 py-4 text-sm text-slate-400">Load ho raha hai...</p>
              ) : data.items.length === 0 ? (
                <p className="px-3 py-4 text-sm text-slate-400">Koi notification nahi</p>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.items.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => openItem(item)}
                        className="block w-full px-3 py-2.5 text-left hover:bg-slate-50"
                      >
                        <span className="flex items-start gap-2">
                          {!item.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary-500" />}
                          <span className="min-w-0 flex-1">
                            <span
                              className={`block truncate text-sm ${item.readAt ? "text-slate-600" : "font-bold text-slate-900"}`}
                            >
                              {item.title}
                            </span>
                            {item.body && (
                              <span className="mt-0.5 line-clamp-2 block text-xs text-slate-500">{item.body}</span>
                            )}
                            <span className="mt-0.5 block text-[11px] text-slate-400">{relativeTime(item.createdAt)}</span>
                          </span>
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
