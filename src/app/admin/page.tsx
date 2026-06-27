"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  BookOpen,
  FileText,
  HelpCircle,
  Eye,
  EyeOff,
  Trash2,
  Edit,
  Loader2,
  Upload,
  X,
  Save,
  MessageCircle,
} from "lucide-react";
import AdminNav, { type AdminPermission } from "@/components/admin/AdminNav";
import {
  clearCachedAdminSession,
  getCachedAdminSession,
  loadAdminSession,
} from "@/lib/admin-session-client";

interface Course {
  id: string;
  title: string;
  description: string;
  isPublished: boolean;
  order: number;
  _count: { samples: number; questions: number };
}

interface Sample {
  id: string;
  title: string;
  type: string;
  filename: string;
  order: number;
}

interface Question {
  id: string;
  question: string;
  answer: string;
  order: number;
  answerMediaFilename?: string | null;
  answerMediaType?: string | null;
}

interface UserQuestion {
  id: string;
  question: string;
  whatsappNumber?: string | null;
  answer: string | null;
  status: string;
  source?: string;
  publishForUsers?: boolean;
  trainingOnly?: boolean;
  visitor?: { visitorKey: string } | null;
  order: number;
  createdAt: string;
  answerMediaFilename?: string | null;
  answerMediaType?: string | null;
}

function nextPreference(items: { order: number }[]) {
  if (items.length === 0) return 1;
  return Math.max(...items.map((i) => i.order)) + 1;
}

function orderItems<T extends { order: number }>(items: T[]) {
  return [...items].sort((a, b) => a.order - b.order);
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

export default function AdminDashboard() {
  const router = useRouter();
  const [admin, setAdmin] = useState<{
    name: string;
    email: string;
    role?: string;
    permissions?: AdminPermission[];
  } | null>(() => getCachedAdminSession());
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(() => !getCachedAdminSession());
  const [selectedCourse, setSelectedCourse] = useState<string | null>(null);
  const [courseDetail, setCourseDetail] = useState<{
    samples: Sample[];
    questions: Question[];
    userQuestions: UserQuestion[];
  } | null>(null);

  // Form states
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourse, setEditingCourse] = useState<Course | null>(null);
  const [courseForm, setCourseForm] = useState({
    title: "",
    description: "",
    isPublished: true,
    order: 1,
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploading, setUploading] = useState(false);
  const [qaForm, setQaForm] = useState({ question: "", answer: "", order: 1 });
  const [editingQuestion, setEditingQuestion] = useState<Question | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [userAnswerForm, setUserAnswerForm] = useState<Record<string, string>>({});
  const [userAnswerOrderForm, setUserAnswerOrderForm] = useState<Record<string, string>>({});
  const [userAnswerModeForm, setUserAnswerModeForm] = useState<Record<string, "publish" | "training">>({});
  const [editingAnsweredUser, setEditingAnsweredUser] = useState<UserQuestion | null>(null);
  const [answeredUserEditForm, setAnsweredUserEditForm] = useState({
    question: "",
    answer: "",
    order: "1",
  });
  const [qaMediaFile, setQaMediaFile] = useState<File | null>(null);
  const [removeQaMedia, setRemoveQaMedia] = useState(false);
  const [userAnswerMediaFile, setUserAnswerMediaFile] = useState<File | null>(null);
  const [answeredUserMediaFile, setAnsweredUserMediaFile] = useState<File | null>(null);
  const [removeAnsweredUserMedia, setRemoveAnsweredUserMedia] = useState(false);

  function can(permission: AdminPermission) {
    return admin?.role === "admin" || Boolean(admin?.permissions?.includes(permission));
  }

  function hasAny(permissions: AdminPermission[]) {
    return permissions.some((permission) => can(permission));
  }

  async function loadCourses() {
    const res = await fetch("/api/courses?admin=true");
    const data = await res.json();
    setCourses(Array.isArray(data) ? data : []);
    setLoading(false);
  }

  const checkAuth = useCallback(async () => {
    try {
      const nextAdmin = await loadAdminSession();
      if (!nextAdmin) {
        router.push("/admin/login");
        return;
      }
      setAdmin(nextAdmin);
      await loadCourses();
    } catch {
      router.push("/admin/login");
    }
  }, [router]);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  async function loadCourseDetail(courseId: string) {
    setSelectedCourse(courseId);
    const res = await fetch(`/api/courses/${courseId}?admin=true`);
    const data = await res.json();
    const questions = data.questions || [];
    const userQuestions = data.userQuestions || [];
    setCourseDetail({
      samples: data.samples || [],
      questions,
      userQuestions,
    });
    const qaItems = [
      ...questions,
      ...userQuestions.filter((q: UserQuestion) => q.status === "answered"),
    ];
    setQaForm((prev) => ({ ...prev, order: nextPreference(qaItems) }));
  }

  function refreshQaOrder(detail: {
    questions: Question[];
    userQuestions: UserQuestion[];
  }) {
    const qaItems = [
      ...detail.questions,
      ...detail.userQuestions.filter((q) => q.status === "answered"),
    ];
    setQaForm((prev) => ({ ...prev, order: nextPreference(qaItems) }));
  }

  function patchCourseCount(
    courseId: string,
    field: "samples" | "questions",
    delta: number
  ) {
    setCourses((prev) =>
      prev.map((course) =>
        course.id === courseId
          ? {
              ...course,
              _count: {
                ...course._count,
                [field]: Math.max(0, course._count[field] + delta),
              },
            }
          : course
      )
    );
  }

  async function answerUserQuestion(questionId: string) {
    if (!selectedCourse) return;
    const answer = userAnswerForm[questionId]?.trim();
    if (!answer && !userAnswerMediaFile) return;

    setSaving(true);
    const formData = new FormData();
    formData.append("questionId", questionId);
    formData.append("answer", answer || "");
    const qaItems = [
      ...(courseDetail?.questions || []),
      ...(courseDetail?.userQuestions || []).filter((q) => q.status === "answered"),
    ];
    formData.append("order", userAnswerOrderForm[questionId] || String(nextPreference(qaItems)));
    formData.append("publishMode", userAnswerModeForm[questionId] || "publish");
    if (userAnswerMediaFile) formData.append("answerMedia", userAnswerMediaFile);

    const res = await fetch(`/api/courses/${selectedCourse}/user-questions`, {
      method: "PUT",
      body: formData,
    });

    if (res.ok) {
      const updated = (await res.json()) as UserQuestion;
      setMessage("User ka sawal answer ho gaya aur frontend par show hoga!");
      setUserAnswerForm((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      setUserAnswerModeForm((prev) => {
        const next = { ...prev };
        delete next[questionId];
        return next;
      });
      setUserAnswerMediaFile(null);
      const nextUserQuestions = (courseDetail?.userQuestions || []).map((item) =>
        item.id === questionId ? { ...item, ...updated } : item
      );
      setCourseDetail((prev) =>
        prev ? { ...prev, userQuestions: nextUserQuestions } : prev
      );
      refreshQaOrder({
        questions: courseDetail?.questions || [],
        userQuestions: nextUserQuestions,
      });
    }
    setSaving(false);
  }

  async function deleteUserQuestion(questionId: string) {
    if (!selectedCourse || !confirm("User question delete karein?")) return;

    const res = await fetch(
      `/api/courses/${selectedCourse}/user-questions?questionId=${questionId}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      setMessage("User question delete ho gaya");
      if (editingAnsweredUser?.id === questionId) {
        setEditingAnsweredUser(null);
        setAnsweredUserEditForm({ question: "", answer: "", order: "1" });
      }
      const nextUserQuestions = (courseDetail?.userQuestions || []).filter(
        (item) => item.id !== questionId
      );
      setCourseDetail((prev) =>
        prev ? { ...prev, userQuestions: nextUserQuestions } : prev
      );
      refreshQaOrder({
        questions: courseDetail?.questions || [],
        userQuestions: nextUserQuestions,
      });
    }
  }

  function startEditAnsweredUser(q: UserQuestion) {
    setEditingAnsweredUser(q);
    setAnsweredUserEditForm({
      question: q.question,
      answer: q.answer || "",
      order: String(q.order),
    });
    setAnsweredUserMediaFile(null);
    setRemoveAnsweredUserMedia(false);
  }

  async function updateAnsweredUserQuestion() {
    if (!selectedCourse || !editingAnsweredUser) return;
    if (!answeredUserEditForm.question.trim()) return;
    if (
      !answeredUserEditForm.answer.trim() &&
      !answeredUserMediaFile &&
      !(editingAnsweredUser.answerMediaFilename && !removeAnsweredUserMedia)
    ) {
      setMessage("Answer text ya media file zaroori hai");
      return;
    }

    setSaving(true);
    const formData = new FormData();
    formData.append("questionId", editingAnsweredUser.id);
    formData.append("question", answeredUserEditForm.question);
    formData.append("answer", answeredUserEditForm.answer);
    formData.append("order", answeredUserEditForm.order);
    if (removeAnsweredUserMedia) formData.append("removeAnswerMedia", "true");
    if (answeredUserMediaFile) formData.append("answerMedia", answeredUserMediaFile);

    const res = await fetch(`/api/courses/${selectedCourse}/user-questions`, {
      method: "PUT",
      body: formData,
    });

    if (res.ok) {
      const updated = (await res.json()) as UserQuestion;
      setMessage("User sawal/jawab update ho gaya!");
      setEditingAnsweredUser(null);
      setAnsweredUserEditForm({ question: "", answer: "", order: "1" });
      setAnsweredUserMediaFile(null);
      setRemoveAnsweredUserMedia(false);
      const nextUserQuestions = (courseDetail?.userQuestions || []).map((item) =>
        item.id === updated.id ? { ...item, ...updated } : item
      );
      setCourseDetail((prev) =>
        prev ? { ...prev, userQuestions: nextUserQuestions } : prev
      );
      refreshQaOrder({
        questions: courseDetail?.questions || [],
        userQuestions: nextUserQuestions,
      });
    }
    setSaving(false);
  }

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    clearCachedAdminSession();
    router.push("/admin/login");
  }

  async function saveCourse() {
    setSaving(true);
    setMessage("");

    const url = editingCourse ? `/api/courses/${editingCourse.id}` : "/api/courses";
    const method = editingCourse ? "PUT" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(courseForm),
    });

    if (res.ok) {
      setMessage("Course save ho gaya!");
      setShowCourseForm(false);
      setEditingCourse(null);
      setCourseForm({ title: "", description: "", isPublished: true, order: nextPreference(courses) });
      loadCourses();
    } else {
      setMessage("Error: Course save nahi ho saka");
    }
    setSaving(false);
  }

  async function deleteCourse(id: string) {
    if (!confirm("Kya aap is course ko delete karna chahte hain?")) return;

    const res = await fetch(`/api/courses/${id}`, { method: "DELETE" });
    if (res.ok) {
      setMessage("Course delete ho gaya");
      if (selectedCourse === id) {
        setSelectedCourse(null);
        setCourseDetail(null);
      }
      loadCourses();
    }
  }

  async function uploadSample() {
    if (!selectedCourse || !uploadFile) return;
    setUploading(true);
    setMessage("");

    const formData = new FormData();
    formData.append("file", uploadFile);
    formData.append("title", uploadTitle || uploadFile.name);

    const res = await fetch(`/api/courses/${selectedCourse}/samples`, {
      method: "POST",
      body: formData,
    });

    if (res.ok) {
      const sample = (await res.json()) as Sample;
      setMessage("Sample upload ho gaya!");
      setUploadFile(null);
      setUploadTitle("");
      setCourseDetail((prev) =>
        prev
          ? {
              ...prev,
              samples: orderItems([...prev.samples, sample]),
            }
          : prev
      );
      patchCourseCount(selectedCourse, "samples", 1);
    } else {
      const data = await res.json();
      setMessage(`Error: ${data.error}`);
    }
    setUploading(false);
  }

  async function deleteSample(sampleId: string) {
    if (!selectedCourse || !confirm("Sample delete karein?")) return;

    const res = await fetch(
      `/api/courses/${selectedCourse}/samples?sampleId=${sampleId}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      setMessage("Sample delete ho gaya");
      setCourseDetail((prev) =>
        prev
          ? {
              ...prev,
              samples: prev.samples.filter((sample) => sample.id !== sampleId),
            }
          : prev
      );
      patchCourseCount(selectedCourse, "samples", -1);
    }
  }

  async function saveQuestion() {
    if (!selectedCourse) return;
    if (!qaForm.question.trim()) return;
    if (!qaForm.answer.trim() && !qaMediaFile && !(editingQuestion?.answerMediaFilename && !removeQaMedia)) {
      setMessage("Answer text ya media file zaroori hai");
      return;
    }

    setSaving(true);
    setMessage("");

    const formData = new FormData();
    formData.append("question", qaForm.question);
    formData.append("answer", qaForm.answer);
    formData.append("order", String(qaForm.order));
    if (removeQaMedia) formData.append("removeAnswerMedia", "true");
    if (qaMediaFile) formData.append("answerMedia", qaMediaFile);

    if (editingQuestion) {
      formData.append("questionId", editingQuestion.id);
      const res = await fetch(`/api/courses/${selectedCourse}/questions`, {
        method: "PUT",
        body: formData,
      });
      if (res.ok) {
        const updated = (await res.json()) as Question;
        setMessage("Question update ho gaya!");
        setEditingQuestion(null);
        setQaMediaFile(null);
        setRemoveQaMedia(false);
        const nextQuestions = orderItems(
          (courseDetail?.questions || []).map((item) =>
            item.id === updated.id ? updated : item
          )
        );
        const answeredUsers = (courseDetail?.userQuestions || []).filter(
          (item) => item.status === "answered"
        );
        setCourseDetail((prev) =>
          prev ? { ...prev, questions: nextQuestions } : prev
        );
        setQaForm({
          question: "",
          answer: "",
          order: nextPreference([...nextQuestions, ...answeredUsers]),
        });
      }
    } else {
      const res = await fetch(`/api/courses/${selectedCourse}/questions`, {
        method: "POST",
        body: formData,
      });
      if (res.ok) {
        const created = (await res.json()) as Question;
        setMessage("Question add ho gaya!");
        setQaMediaFile(null);
        const nextQuestions = orderItems([...(courseDetail?.questions || []), created]);
        const answeredUsers = (courseDetail?.userQuestions || []).filter(
          (item) => item.status === "answered"
        );
        setCourseDetail((prev) =>
          prev ? { ...prev, questions: nextQuestions } : prev
        );
        setQaForm({
          question: "",
          answer: "",
          order: nextPreference([...nextQuestions, ...answeredUsers]),
        });
        patchCourseCount(selectedCourse, "questions", 1);
      }
    }
    setSaving(false);
  }

  async function deleteQuestion(questionId: string) {
    if (!selectedCourse || !confirm("Question delete karein?")) return;

    const res = await fetch(
      `/api/courses/${selectedCourse}/questions?questionId=${questionId}`,
      { method: "DELETE" }
    );

    if (res.ok) {
      setMessage("Question delete ho gaya");
      const nextQuestions = (courseDetail?.questions || []).filter(
        (item) => item.id !== questionId
      );
      const answeredUsers = (courseDetail?.userQuestions || []).filter(
        (item) => item.status === "answered"
      );
      setCourseDetail((prev) =>
        prev ? { ...prev, questions: nextQuestions } : prev
      );
      setQaForm((prev) => ({
        ...prev,
        order: nextPreference([...nextQuestions, ...answeredUsers]),
      }));
      patchCourseCount(selectedCourse, "questions", -1);
    }
  }

  function startEditCourse(course: Course) {
    setEditingCourse(course);
    setCourseForm({
      title: course.title,
      description: course.description,
      isPublished: course.isPublished,
      order: course.order,
    });
    setShowCourseForm(true);
  }

  function startEditQuestion(q: Question) {
    setEditingQuestion(q);
    setQaForm({ question: q.question, answer: q.answer, order: q.order });
    setQaMediaFile(null);
    setRemoveQaMedia(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <AdminNav admin={admin} onLogout={handleLogout} />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {message && (
          <div className="mb-6 p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm flex items-center justify-between">
            {message}
            <button onClick={() => setMessage("")}>
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {hasAny([
          "courses:read",
          "courses:write",
          "samples:read",
          "samples:write",
          "qa:read",
          "qa:write",
          "userQuestions:read",
          "userQuestions:write",
        ]) && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Courses List */}
          <div className="lg:col-span-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="flex items-center justify-between p-4 border-b border-slate-100">
                <h2 className="font-bold text-slate-900 flex items-center gap-2">
                  <BookOpen className="w-5 h-5 text-primary-500" />
                  Courses ({courses.length})
                </h2>
                {can("courses:write") && (
                  <button
                    onClick={() => {
                      setEditingCourse(null);
                      setCourseForm({
                        title: "",
                        description: "",
                        isPublished: true,
                        order: nextPreference(courses),
                      });
                      setShowCourseForm(true);
                    }}
                    className="p-2 rounded-lg bg-primary-600 text-white hover:bg-primary-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                )}
              </div>

              <div className="max-h-[60vh] overflow-y-auto divide-y divide-slate-100">
                {courses.length === 0 ? (
                  <p className="p-6 text-center text-slate-400 text-sm">Koi course nahi hai</p>
                ) : (
                  courses.map((course) => (
                    <div
                      key={course.id}
                      className={`p-4 cursor-pointer transition-colors ${
                        selectedCourse === course.id
                          ? "bg-primary-50 border-l-4 border-primary-500"
                          : "hover:bg-slate-50"
                      }`}
                      onClick={() => loadCourseDetail(course.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 text-slate-600">
                              #{course.order}
                            </span>
                            <p className="font-semibold text-slate-800 truncate">{course.title}</p>
                          </div>
                          <div className="flex gap-3 mt-1 text-xs text-slate-400">
                            <span>{course._count.samples} samples</span>
                            <span>{course._count.questions} Q&A</span>
                          </div>
                          <span
                            className={`inline-block mt-1 text-xs px-2 py-0.5 rounded-full ${
                              course.isPublished
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {course.isPublished ? "Published" : "Draft"}
                          </span>
                        </div>
                        {can("courses:write") && (
                          <div className="flex gap-1">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditCourse(course);
                              }}
                              className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCourse(course.id);
                              }}
                              className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* Course Detail Panel */}
          <div className="lg:col-span-8">
            {!selectedCourse ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <BookOpen className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                <p className="text-slate-500">Manage karne ke liye ek course select karein</p>
              </div>
            ) : !hasAny([
              "samples:read",
              "samples:write",
              "qa:read",
              "qa:write",
              "userQuestions:read",
              "userQuestions:write",
            ]) ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center">
                <BookOpen className="w-16 h-16 mx-auto mb-4 text-slate-200" />
                <p className="text-slate-500">Is course ke content ke liye permission zaroori hai</p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Upload Sample */}
                {hasAny(["samples:read", "samples:write"]) && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
                    <Upload className="w-5 h-5 text-primary-500" />
                    Samples (PDF / Image)
                  </h3>
                  {can("samples:write") && (
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Sample title (optional)"
                        value={uploadTitle}
                        onChange={(e) => setUploadTitle(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none text-sm"
                      />
                      <div className="flex flex-col sm:flex-row gap-3">
                        <input
                          type="file"
                          accept="application/pdf,.pdf,image/*"
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                          className="flex-1 text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700 file:font-medium hover:file:bg-primary-100"
                        />
                        <button
                          onClick={uploadSample}
                          disabled={!uploadFile || uploading}
                          className="px-6 py-2.5 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                        >
                          {uploading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <Upload className="w-4 h-4" />
                          )}
                          Upload
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Samples List */}
                  {courseDetail && courseDetail.samples.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {courseDetail.samples.map((sample) => (
                        <div
                          key={sample.id}
                          className="flex items-center justify-between p-3 rounded-lg bg-slate-50 border border-slate-100"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-4 h-4 text-slate-400 flex-shrink-0" />
                            <span className="text-sm truncate">{sample.title}</span>
                            <span className="text-xs text-slate-400 uppercase">{sample.type}</span>
                          </div>
                          {can("samples:write") && (
                            <button
                              onClick={() => deleteSample(sample.id)}
                              className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )}

                {/* User Submitted Questions */}
                {hasAny(["userQuestions:read", "userQuestions:write"]) &&
                  courseDetail &&
                  courseDetail.userQuestions.filter((q) => q.status === "pending").length > 0 && (
                  <div className="bg-amber-50 rounded-2xl border border-amber-200 p-5 sm:p-6 shadow-sm">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
                      <MessageCircle className="w-5 h-5 text-amber-600" />
                      User ke Sawal (Pending)
                    </h3>
                    <div className="space-y-4">
                      {courseDetail.userQuestions
                        .filter((q) => q.status === "pending")
                        .map((q) => (
                          <div
                            key={q.id}
                            className="p-4 rounded-xl bg-white border border-amber-100"
                          >
                            <div className="mb-2 flex flex-wrap items-center gap-2">
                              {q.source === "bot" && (
                                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                                  AI posted
                                </span>
                              )}
                              {q.visitor?.visitorKey && (
                                <span className="break-all rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                                  Visitor: {q.visitor.visitorKey}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-slate-800 urdu-text leading-loose mb-2">
                              {q.question}
                            </p>
                            <p className="mb-2 text-xs text-slate-500">
                              Asked: {formatDateTime(q.createdAt)}
                            </p>
                            {q.whatsappNumber && (
                              <a
                                href={`https://wa.me/${q.whatsappNumber.replace(/\D/g, "")}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 mb-3 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors"
                                dir="ltr"
                              >
                                <MessageCircle className="w-3.5 h-3.5" />
                                WhatsApp: {q.whatsappNumber}
                              </a>
                            )}
                            {can("userQuestions:write") && (
                              <>
                                <label className="block text-xs text-slate-500 mb-1">
                                  Preference # (e.g. 1, 1.5, 2)
                                </label>
                                <input
                                  type="number"
                                  step="0.1"
                                  value={
                                    userAnswerOrderForm[q.id] ??
                                    String(
                                      nextPreference([
                                        ...(courseDetail?.questions || []),
                                        ...(courseDetail?.userQuestions || []).filter(
                                          (uq) => uq.status === "answered"
                                        ),
                                      ])
                                    )
                                  }
                                  onChange={(e) =>
                                    setUserAnswerOrderForm({
                                      ...userAnswerOrderForm,
                                      [q.id]: e.target.value,
                                    })
                                  }
                                  className="w-full max-w-[8rem] mb-2 px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                />
                                <textarea
                                  value={userAnswerForm[q.id] || ""}
                                  onChange={(e) =>
                                    setUserAnswerForm({ ...userAnswerForm, [q.id]: e.target.value })
                                  }
                                  rows={3}
                                  placeholder="Answer likhein..."
                                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 outline-none text-sm resize-y scroll-field urdu-text"
                                />
                                <input
                                  type="file"
                                  accept="application/pdf,.pdf,image/*"
                                  onChange={(e) => setUserAnswerMediaFile(e.target.files?.[0] || null)}
                                  className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700"
                                />
                                <select
                                  value={userAnswerModeForm[q.id] || "publish"}
                                  onChange={(e) =>
                                    setUserAnswerModeForm({
                                      ...userAnswerModeForm,
                                      [q.id]: e.target.value as "publish" | "training",
                                    })
                                  }
                                  className="mt-2 w-full max-w-xs rounded-lg border border-slate-200 px-3 py-2 text-sm"
                                >
                                  <option value="publish">Publish for user + train bot</option>
                                  <option value="training">Only bot training</option>
                                </select>
                                <p className="text-xs text-slate-400">Optional: Answer mein PDF ya image attach karein</p>
                                <div className="flex gap-2 mt-2">
                                  <button
                                    onClick={() => answerUserQuestion(q.id)}
                                    disabled={
                                      (!userAnswerForm[q.id]?.trim() && !userAnswerMediaFile) || saving
                                    }
                                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                                  >
                                    <Save className="w-3.5 h-3.5" /> Publish Answer
                                  </button>
                                  <button
                                    onClick={() => deleteUserQuestion(q.id)}
                                    className="px-4 py-2 rounded-lg border border-red-200 text-red-600 text-sm hover:bg-red-50"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Answered User Questions - CRUD */}
                {hasAny(["userQuestions:read", "userQuestions:write"]) &&
                  courseDetail &&
                  courseDetail.userQuestions.filter((q) => q.status === "answered" || q.status === "training").length > 0 && (
                  <div className="bg-emerald-50 rounded-2xl border border-emerald-200 p-5 sm:p-6 shadow-sm">
                    <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
                      <MessageCircle className="w-5 h-5 text-emerald-600" />
                      User ke Sawal (Answered / Training)
                    </h3>
                    <div className="space-y-3">
                      {courseDetail.userQuestions
                        .filter((q) => q.status === "answered" || q.status === "training")
                        .sort((a, b) => a.order - b.order)
                        .map((q) => (
                          <div
                            key={q.id}
                            className="p-4 rounded-xl bg-white border border-emerald-100"
                          >
                            {can("userQuestions:write") && editingAnsweredUser?.id === q.id ? (
                              <div className="space-y-2">
                                <input
                                  type="number"
                                  step="0.1"
                                  value={answeredUserEditForm.order}
                                  onChange={(e) =>
                                    setAnsweredUserEditForm({
                                      ...answeredUserEditForm,
                                      order: e.target.value,
                                    })
                                  }
                                  className="w-full max-w-[8rem] px-3 py-2 rounded-lg border border-slate-200 text-sm"
                                  placeholder="Preference #"
                                />
                                <textarea
                                  value={answeredUserEditForm.question}
                                  onChange={(e) =>
                                    setAnsweredUserEditForm({
                                      ...answeredUserEditForm,
                                      question: e.target.value,
                                    })
                                  }
                                  rows={2}
                                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm resize-y scroll-field urdu-text"
                                />
                                <textarea
                                  value={answeredUserEditForm.answer}
                                  onChange={(e) =>
                                    setAnsweredUserEditForm({
                                      ...answeredUserEditForm,
                                      answer: e.target.value,
                                    })
                                  }
                                  rows={3}
                                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 outline-none text-sm resize-y scroll-field urdu-text"
                                />
                                <input
                                  type="file"
                                  accept="application/pdf,.pdf,image/*"
                                  onChange={(e) =>
                                    setAnsweredUserMediaFile(e.target.files?.[0] || null)
                                  }
                                  className="w-full text-sm file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700"
                                />
                                {editingAnsweredUser.answerMediaFilename && !removeAnsweredUserMedia && (
                                  <button
                                    type="button"
                                    onClick={() => setRemoveAnsweredUserMedia(true)}
                                    className="text-xs text-red-600 hover:underline"
                                  >
                                    Current media remove karein
                                  </button>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    onClick={updateAnsweredUserQuestion}
                                    disabled={
                                      !answeredUserEditForm.question.trim() ||
                                      (!answeredUserEditForm.answer.trim() &&
                                        !answeredUserMediaFile &&
                                        !(editingAnsweredUser.answerMediaFilename && !removeAnsweredUserMedia)) ||
                                      saving
                                    }
                                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm hover:bg-emerald-700 disabled:opacity-50 flex items-center gap-1"
                                  >
                                    <Save className="w-3.5 h-3.5" /> Update
                                  </button>
                                  <button
                                  onClick={() => {
                                    setEditingAnsweredUser(null);
                                    setAnsweredUserEditForm({ question: "", answer: "", order: "1" });
                                    setAnsweredUserMediaFile(null);
                                    setRemoveAnsweredUserMedia(false);
                                  }}
                                    className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                  <div className="mb-1 flex flex-wrap items-center gap-2">
                                    {q.source === "bot" && (
                                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                                        AI posted
                                      </span>
                                    )}
                                    {(q.trainingOnly || q.status === "training") && (
                                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                                        Bot training only
                                      </span>
                                    )}
                                    {q.visitor?.visitorKey && (
                                      <span className="break-all rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                                        Visitor: {q.visitor.visitorKey}
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm font-medium text-slate-800 urdu-text leading-loose">
                                    <span className="text-slate-400 mr-1">#{q.order}</span>
                                    Q: {q.question}
                                  </p>
                                  <p className="text-xs text-slate-500">
                                    Asked: {formatDateTime(q.createdAt)}
                                  </p>
                                  <p className="text-xs text-slate-500 mt-1 urdu-text leading-loose">
                                    A: {q.answer}
                                  </p>
                                  {q.whatsappNumber && (
                                    <a
                                      href={`https://wa.me/${q.whatsappNumber.replace(/\D/g, "")}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1.5 mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-lg hover:bg-emerald-100 transition-colors"
                                      dir="ltr"
                                    >
                                      <MessageCircle className="w-3.5 h-3.5" />
                                      WhatsApp: {q.whatsappNumber}
                                    </a>
                                  )}
                                  {q.answerMediaFilename && (
                                    <p className="text-xs text-emerald-600 mt-1">
                                      Media attached ({q.answerMediaType})
                                    </p>
                                  )}
                                </div>
                                {can("userQuestions:write") && (
                                  <div className="flex gap-1 flex-shrink-0">
                                    <button
                                      onClick={() => startEditAnsweredUser(q)}
                                      className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500"
                                    >
                                      <Edit className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      onClick={() => deleteUserQuestion(q.id)}
                                      className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Q&A Management */}
                {hasAny(["qa:read", "qa:write"]) && (
                <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-sm">
                  <h3 className="font-bold text-slate-900 flex items-center gap-2 mb-4">
                    <HelpCircle className="w-5 h-5 text-accent-500" />
                    Questions & Answers
                    {editingQuestion && (
                      <span className="text-xs font-normal text-amber-600 ml-2">(Editing)</span>
                    )}
                  </h3>
                  {can("qa:write") && (
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">
                        Preference # (e.g. 1, 1.5, 2)
                      </label>
                      <input
                        type="number"
                        step="0.1"
                        value={qaForm.order}
                        onChange={(e) =>
                          setQaForm({ ...qaForm, order: parseFloat(e.target.value) || 0 })
                        }
                        className="w-full max-w-[8rem] px-3 py-2 rounded-xl border border-slate-200 text-sm"
                      />
                    </div>
                    <textarea
                      placeholder="Question likhein..."
                      value={qaForm.question}
                      onChange={(e) => setQaForm({ ...qaForm, question: e.target.value })}
                      rows={2}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none text-sm resize-y scroll-field urdu-text"
                    />
                    <textarea
                      placeholder="Answer likhein..."
                      value={qaForm.answer}
                      onChange={(e) => setQaForm({ ...qaForm, answer: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none text-sm resize-y scroll-field urdu-text"
                    />
                    <div>
                      <label className="block text-xs text-slate-500 mb-1">
                        Answer Media (PDF / Image) — optional
                      </label>
                      <input
                        type="file"
                        accept="application/pdf,.pdf,image/*"
                        onChange={(e) => {
                          setQaMediaFile(e.target.files?.[0] || null);
                          setRemoveQaMedia(false);
                        }}
                        className="w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary-50 file:text-primary-700"
                      />
                      {editingQuestion?.answerMediaFilename && !removeQaMedia && (
                        <button
                          type="button"
                          onClick={() => setRemoveQaMedia(true)}
                          className="text-xs text-red-600 mt-1 hover:underline"
                        >
                          Current answer media remove karein
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={saveQuestion}
                        disabled={
                          !qaForm.question.trim() ||
                          (!qaForm.answer.trim() &&
                            !qaMediaFile &&
                            !(editingQuestion?.answerMediaFilename && !removeQaMedia)) ||
                          saving
                        }
                        className="px-6 py-2.5 rounded-xl bg-accent-600 text-white font-medium hover:bg-accent-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                      >
                        {saving ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Save className="w-4 h-4" />
                        )}
                        {editingQuestion ? "Update" : "Add Question"}
                      </button>
                      {editingQuestion && (
                        <button
                          onClick={() => {
                            setEditingQuestion(null);
                            setQaForm({
                              question: "",
                              answer: "",
                              order: nextPreference(courseDetail?.questions || []),
                            });
                            setQaMediaFile(null);
                            setRemoveQaMedia(false);
                          }}
                          className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  </div>
                  )}

                  {/* Questions List */}
                  {courseDetail && courseDetail.questions.length > 0 && (
                    <div className="mt-4 space-y-2">
                      {[...courseDetail.questions]
                        .sort((a, b) => a.order - b.order)
                        .map((q) => (
                        <div
                          key={q.id}
                          className="p-3 rounded-lg bg-slate-50 border border-slate-100"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-slate-800">
                                <span className="text-slate-400 mr-1">#{q.order}</span>
                                {q.question}
                              </p>
                              <p className="text-xs text-slate-500 mt-1 line-clamp-2">
                                A: {q.answer}
                              </p>
                            </div>
                            {can("qa:write") && (
                              <div className="flex gap-1 flex-shrink-0">
                                <button
                                  onClick={() => startEditQuestion(q)}
                                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteQuestion(q.id)}
                                  className="p-1.5 rounded-lg hover:bg-red-100 text-red-500"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                )}
              </div>
            )}
          </div>
        </div>
        )}
      </main>

      {/* Course Form Modal */}
      {showCourseForm && can("courses:write") && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg animate-fade-in">
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-bold text-lg">
                {editingCourse ? "Edit Course" : "New Course"}
              </h3>
              <button
                onClick={() => {
                  setShowCourseForm(false);
                  setEditingCourse(null);
                }}
                className="p-2 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Title</label>
                <input
                  type="text"
                  value={courseForm.title}
                  onChange={(e) => setCourseForm({ ...courseForm, title: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                  placeholder="Diploma ka naam"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Preference # (e.g. 1, 1.5, 2)
                </label>
                <input
                  type="number"
                  step="0.1"
                  value={courseForm.order}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, order: parseFloat(e.target.value) || 0 })
                  }
                  className="w-full max-w-[10rem] px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Description
                </label>
                <textarea
                  value={courseForm.description}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, description: e.target.value })
                  }
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none resize-y scroll-field"
                  placeholder="Course ki detail..."
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={courseForm.isPublished}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, isPublished: e.target.checked })
                  }
                  className="w-4 h-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-slate-700 flex items-center gap-1">
                  {courseForm.isPublished ? (
                    <Eye className="w-4 h-4 text-emerald-500" />
                  ) : (
                    <EyeOff className="w-4 h-4 text-amber-500" />
                  )}
                  {courseForm.isPublished ? "Published (users dekh sakte hain)" : "Draft (hidden)"}
                </span>
              </label>
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-slate-100">
              <button
                onClick={() => {
                  setShowCourseForm(false);
                  setEditingCourse(null);
                }}
                className="px-5 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={saveCourse}
                disabled={!courseForm.title.trim() || !courseForm.description.trim() || saving}
                className="px-5 py-2.5 rounded-xl bg-primary-600 text-white font-medium hover:bg-primary-700 disabled:opacity-50 flex items-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
