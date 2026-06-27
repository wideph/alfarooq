"use client";

import { FormEvent, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { Bot, Loader2, MessageCircle, Send, X } from "lucide-react";
import { getOrCreateVisitorKey, peekPreviousVisitorKey } from "@/lib/visitor-client";

type CourseOption = { id: string; title: string };
type ChatMessage = { role: "user" | "assistant"; content: string; whatsappUrl?: string | null };

const BOT_CONVERSATION_KEY = "bbte_bot_conversation_id";
const BOT_NAME_KEY = "bbte_bot_name";
const BOT_NAMES = ["Asad", "Hammad", "Ramiz", "Ahmed", "Haroon"];

function getStoredBotName() {
  const stored = localStorage.getItem(BOT_NAME_KEY);
  if (stored && BOT_NAMES.includes(stored)) return stored;
  const next = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  localStorage.setItem(BOT_NAME_KEY, next);
  return next;
}

function renderLinkedText(text: string) {
  const nodes: ReactNode[] = [];
  const markdownLink = /\[([^\]]+)\]\(([^)]+)\)|(https?:\/\/[^\s]+|\/courses\/[^\s]+)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = markdownLink.exec(text))) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const label = match[1] || match[3];
    const href = match[2] || match[3];
    nodes.push(
      <a
        key={`${href}-${match.index}`}
        href={href}
        className="font-semibold text-primary-700 underline underline-offset-2"
        target={href.startsWith("http") ? "_blank" : undefined}
        rel={href.startsWith("http") ? "noopener noreferrer" : undefined}
      >
        {label}
      </a>
    );
    lastIndex = markdownLink.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export default function BotChatWidget() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [open, setOpen] = useState(false);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [botName, setBotName] = useState("Asad");
  const bottomClass = pathname !== "/" && !pathname.startsWith("/admin") ? "bottom-28 sm:bottom-32" : "bottom-5";
  const visitorKeyRef = useRef<string | null>(null);
  const panelEndRef = useRef<HTMLDivElement | null>(null);

  const pathCourseId = useMemo(() => {
    const match = pathname.match(/^\/courses\/([^/?#]+)/);
    return match?.[1] || "";
  }, [pathname]);

  useEffect(() => {
    if (pathname.startsWith("/admin")) return;

    fetch("/api/bot/config")
      .then((res) => res.json())
      .then((data) => {
        setEnabled(Boolean(data.enabled));
        setCourses(Array.isArray(data.courses) ? data.courses : []);
      })
      .catch(() => {});
  }, [pathname]);

  useEffect(() => {
    if (pathCourseId) setSelectedCourseId(pathCourseId);
  }, [pathCourseId]);

  useEffect(() => {
    if (!open) return;
    visitorKeyRef.current = getOrCreateVisitorKey();
    setBotName(getStoredBotName());
  }, [open]);

  useEffect(() => {
    panelEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages, loading]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    const message = input.trim();
    if (!message || loading) return;

    setMessages((prev) => [...prev, { role: "user", content: message }]);
    setInput("");
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/bot/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          courseId: selectedCourseId || pathCourseId || null,
          conversationId: localStorage.getItem(BOT_CONVERSATION_KEY) || "",
          visitorKey: visitorKeyRef.current || getOrCreateVisitorKey(),
          previousVisitorKey: peekPreviousVisitorKey(),
          botName,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bot jawab nahi de saka");

      localStorage.setItem(BOT_CONVERSATION_KEY, data.conversationId);
      if (data.botName && BOT_NAMES.includes(data.botName)) {
        localStorage.setItem(BOT_NAME_KEY, data.botName);
        setBotName(data.botName);
      }
      if (data.blocked) {
        localStorage.setItem("bbte_visitor_blocked", "true");
        window.setTimeout(() => {
          window.dispatchEvent(new Event("bbte-visitor-blocked"));
        }, 2500);
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: data.answer || "",
          whatsappUrl: data.whatsappUrl || null,
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bot jawab nahi de saka");
    } finally {
      setLoading(false);
    }
  }

  if (!enabled || pathname.startsWith("/admin")) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`fixed ${bottomClass} right-5 sm:right-6 z-[95] flex items-center gap-2 rounded-full bg-gradient-to-r from-emerald-600 to-primary-600 px-5 py-3 text-white font-bold shadow-[0_12px_32px_-8px_rgba(37,99,235,0.55)] ring-2 ring-white/70 hover:scale-105 active:scale-95 transition-all`}
        aria-label="سوال پوچھیں"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="urdu-text text-sm sm:text-base">سوال پوچھیں</span>
      </button>

      {open && (
        <div className="fixed inset-x-3 bottom-4 z-[110] sm:left-auto sm:right-6 sm:w-[24rem]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between bg-slate-900 px-4 py-3 text-white">
              <div className="flex items-center gap-2">
                <Bot className="w-5 h-5 text-emerald-300" />
                <span className="urdu-text font-bold">سوال پوچھیں</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-white/80 hover:bg-white/10 hover:text-white"
                aria-label="Close chat"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-[55vh] overflow-y-auto bg-slate-50 px-3 py-4 space-y-3">
              {!pathCourseId && (
                <select
                  value={selectedCourseId}
                  onChange={(event) => setSelectedCourseId(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                >
                  <option value="">Course select karein</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>
                      {course.title}
                    </option>
                  ))}
                </select>
              )}

              {messages.length === 0 && (
                <div className="rounded-xl bg-white p-3 text-sm text-slate-600 shadow-sm urdu-text">
                  Apna sawal yahan likhein.
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-loose whitespace-pre-line urdu-text ${
                      message.role === "user"
                        ? "bg-primary-600 text-white"
                        : "bg-white text-slate-700 border border-slate-200"
                    }`}
                  >
                    {renderLinkedText(message.content)}
                    {message.whatsappUrl && (
                      <a
                        href={message.whatsappUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"
                      >
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp par proceed karein
                      </a>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-3.5 py-2.5 text-sm text-slate-500 border border-slate-200">
                    <span className="flex items-center gap-1" aria-hidden="true">
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:120ms]" />
                      <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:240ms]" />
                    </span>
                    {botName} typing
                  </div>
                </div>
              )}

              {error && <p className="text-xs text-red-600">{error}</p>}
              <div ref={panelEndRef} />
            </div>

            <form onSubmit={sendMessage} className="flex gap-2 border-t border-slate-200 bg-white p-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                rows={1}
                placeholder="Sawal likhein..."
                className="min-h-11 flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 urdu-text"
              />
              <button
                type="submit"
                disabled={!input.trim() || loading}
                className="grid h-11 w-11 place-items-center rounded-xl bg-primary-600 text-white disabled:opacity-50 hover:bg-primary-700"
                aria-label="Send"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
