"use client";

import { useEffect, useState } from "react";
import { Bot, Loader2, RefreshCw, Save, Search, Sparkles, Trash2 } from "lucide-react";

type CourseOption = { id: string; title: string };
type TrainingEntry = {
  id: string;
  courseId: string;
  question: string;
  answer: string;
  source?: string;
  course?: { id: string; title: string };
};
type BotConversation = {
  id: string;
  isPinned: boolean;
  expiresAt: string;
  remainingSeconds: number | null;
  visitor: { visitorKey: string } | null;
  course: { id: string; title: string } | null;
  messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
};

function formatRemaining(seconds: number | null) {
  if (seconds === null) return "Permanent";
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}

export default function BotAdminPanel({
  courses,
  defaultOpen = false,
  canTrainingRead = true,
  canTrainingWrite = true,
  canChatsRead = true,
  canChatsWrite = true,
}: {
  courses: CourseOption[];
  defaultOpen?: boolean;
  canTrainingRead?: boolean;
  canTrainingWrite?: boolean;
  canChatsRead?: boolean;
  canChatsWrite?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [training, setTraining] = useState<TrainingEntry[]>([]);
  const [conversations, setConversations] = useState<BotConversation[]>([]);
  const [chatQuery, setChatQuery] = useState("");
  const [form, setForm] = useState({ question: "", answer: "" });
  const [editingId, setEditingId] = useState("");
  const [loadingTraining, setLoadingTraining] = useState(false);
  const [loadingChats, setLoadingChats] = useState(false);
  const [learning, setLearning] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!selectedCourseId && courses[0]) setSelectedCourseId(courses[0].id);
  }, [courses, selectedCourseId]);

  async function loadTraining(courseId = selectedCourseId) {
    if (!courseId || !canTrainingRead) return;
    setLoadingTraining(true);
    const res = await fetch(`/api/admin/bot-training?courseId=${courseId}`);
    if (res.ok) setTraining(await res.json());
    setLoadingTraining(false);
  }

  async function loadConversations(search = chatQuery) {
    if (!canChatsRead) return;
    setLoadingChats(true);
    const params = new URLSearchParams();
    if (search.trim()) params.set("q", search.trim());
    const res = await fetch(`/api/admin/bot-conversations?${params}`);
    if (res.ok) setConversations(await res.json());
    setLoadingChats(false);
  }

  useEffect(() => {
    if (!open) return;
    void loadTraining();
    void loadConversations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, selectedCourseId]);

  async function saveTraining() {
    if (!canTrainingWrite) return;
    if (!selectedCourseId || !form.question.trim() || !form.answer.trim()) return;

    const res = await fetch("/api/admin/bot-training", {
      method: editingId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingId,
        courseId: selectedCourseId,
        question: form.question,
        answer: form.answer,
      }),
    });

    if (res.ok) {
      setForm({ question: "", answer: "" });
      setEditingId("");
      setMessage("Bot training save ho gayi.");
      await loadTraining();
    } else {
      setMessage("Bot training save nahi ho saki.");
    }
  }

  async function deleteTraining(id: string) {
    if (!canTrainingWrite) return;
    if (!confirm("Training entry delete karein?")) return;
    const res = await fetch(`/api/admin/bot-training?id=${id}`, { method: "DELETE" });
    if (res.ok) {
      setMessage("Training entry delete ho gayi.");
      await loadTraining();
    }
  }

  async function runLearning(rebuild = false) {
    if (!canTrainingWrite || !selectedCourseId || learning) return;
    if (
      rebuild &&
      !confirm("Saari self-learning dobara banayein? Purani self-learning hat jayegi.")
    ) {
      return;
    }

    setLearning(true);
    setMessage(rebuild ? "Bot dobara seekh raha hai..." : "Bot seekh raha hai...");
    try {
      const res = await fetch("/api/admin/bot-training/learn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: selectedCourseId, rebuild }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Bot learning fail");

      const remainingNote =
        data.remainingUnits > 0
          ? ` ${data.remainingUnits} item baqi hain — dobara "Bot ko Train karein" dabayein.`
          : "";
      setMessage(
        `Bot ne ${data.created} self-learning add ki (${data.processedUnits} items).${remainingNote}`
      );
      await loadTraining();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Bot learning fail");
    } finally {
      setLearning(false);
    }
  }

  async function togglePin(conversation: BotConversation) {
    if (!canChatsWrite) return;
    const res = await fetch("/api/admin/bot-conversations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: conversation.id, isPinned: !conversation.isPinned }),
    });
    if (res.ok) await loadConversations();
  }

  async function deleteConversation(id: string) {
    if (!canChatsWrite) return;
    if (!confirm("Chat delete karein?")) return;
    const res = await fetch(`/api/admin/bot-conversations?id=${id}`, { method: "DELETE" });
    if (res.ok) await loadConversations();
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-6">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between p-4 border-b border-slate-100 hover:bg-slate-50"
      >
        <span className="font-bold text-slate-900 flex items-center gap-2">
          <Bot className="w-5 h-5 text-accent-600" />
          AI Bot Training & Chats
        </span>
        <span className="text-sm text-slate-400">{open ? "Hide" : "Show"}</span>
      </button>

      {open && (
        <div className="p-5 sm:p-6 space-y-6">
          {message && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

          {canTrainingRead && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <h3 className="font-bold text-slate-900">Private Bot Training</h3>
              <select
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
              >
                {courses.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.title}
                  </option>
                ))}
              </select>
            </div>

            {canTrainingWrite && (
              <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
                <p className="text-xs text-slate-600 leading-relaxed">
                  Bot khud course ke Q&amp;A se anticipated sawal-jawab bana kar
                  yahan add karta hai (badge: Self-learning). Naya question add
                  karne ke baad &quot;Bot ko Train karein&quot; dabayein — sirf
                  naye content par learn hoga.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => runLearning(false)}
                    disabled={!selectedCourseId || learning}
                    className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                  >
                    {learning ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    Bot ko Train karein
                  </button>
                  <button
                    type="button"
                    onClick={() => runLearning(true)}
                    disabled={!selectedCourseId || learning}
                    className="inline-flex items-center gap-2 rounded-xl border border-violet-300 px-4 py-2 text-sm font-semibold text-violet-700 disabled:opacity-50"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Dobara seekhayein
                  </button>
                </div>
              </div>
            )}

            {canTrainingWrite && (
            <div className="grid grid-cols-1 gap-3">
              <textarea
                value={form.question}
                onChange={(event) => setForm({ ...form, question: event.target.value })}
                rows={2}
                placeholder="Training question..."
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 resize-y scroll-field urdu-text"
              />
              <textarea
                value={form.answer}
                onChange={(event) => setForm({ ...form, answer: event.target.value })}
                rows={3}
                placeholder="Training answer..."
                className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100 resize-y scroll-field urdu-text"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={saveTraining}
                  disabled={!selectedCourseId || !form.question.trim() || !form.answer.trim()}
                  className="inline-flex items-center gap-2 rounded-xl bg-accent-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {editingId ? "Update Training" : "Add Training"}
                </button>
                {editingId && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId("");
                      setForm({ question: "", answer: "" });
                    }}
                    className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-600"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
            )}

            {loadingTraining ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
            ) : (
              <div className="space-y-2">
                {training.map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {entry.source === "self" && (
                      <span className="mb-1.5 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-bold text-violet-700">
                        <Sparkles className="w-3 h-3" />
                        BOT self-learning
                      </span>
                    )}
                    <p className="text-sm font-semibold text-slate-800 urdu-text leading-loose">
                      Q: {entry.question}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 urdu-text leading-loose">
                      A: {entry.answer}
                    </p>
                    {canTrainingWrite && (
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingId(entry.id);
                            setForm({ question: entry.question, answer: entry.answer });
                          }}
                          className="text-xs font-semibold text-primary-700"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteTraining(entry.id)}
                          className="text-xs font-semibold text-red-600"
                        >
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
          )}

          {canChatsRead && (
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
              <h3 className="font-bold text-slate-900">Bot Conversations</h3>
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void loadConversations(chatQuery);
                }}
                className="flex gap-2"
              >
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input
                    value={chatQuery}
                    onChange={(event) => setChatQuery(event.target.value)}
                    placeholder="Visitor ID search..."
                    className="w-full rounded-xl border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-100"
                  />
                </div>
                <button
                  type="submit"
                  className="grid h-10 w-10 place-items-center rounded-xl bg-slate-900 text-white"
                  aria-label="Search"
                >
                  <Search className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => loadConversations()}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 text-slate-600"
                  aria-label="Refresh"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </form>
            </div>

            {loadingChats ? (
              <Loader2 className="w-5 h-5 animate-spin text-primary-500" />
            ) : (
              <div className="space-y-3">
                {conversations.map((conversation) => (
                  <div key={conversation.id} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="break-all text-xs font-bold text-slate-700">
                          Visitor: {conversation.visitor?.visitorKey || "unknown"}
                        </p>
                        <p className="text-xs text-slate-500">
                          Course: {conversation.course?.title || "-"} | Retention:{" "}
                          {formatRemaining(conversation.remainingSeconds)}
                        </p>
                      </div>
                      {canChatsWrite && (
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => togglePin(conversation)}
                            className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-primary-700"
                          >
                            {conversation.isPinned ? "Unsave" : "Save"}
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteConversation(conversation.id)}
                            className="grid h-8 w-8 place-items-center rounded-lg bg-white text-red-600"
                            aria-label="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="mt-3 max-h-56 overflow-y-auto space-y-2">
                      {conversation.messages.map((item) => (
                        <div
                          key={item.id}
                          className={`rounded-xl px-3 py-2 text-xs leading-loose urdu-text ${
                            item.role === "user"
                              ? "ml-auto max-w-[85%] bg-primary-600 text-white"
                              : "mr-auto max-w-[85%] bg-white text-slate-700 border border-slate-200"
                          }`}
                        >
                          {item.content}
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {conversations.length === 0 && (
                  <p className="py-6 text-center text-sm text-slate-400">Koi bot chat nahi mili</p>
                )}
              </div>
            )}
          </section>
          )}
        </div>
      )}
    </div>
  );
}
