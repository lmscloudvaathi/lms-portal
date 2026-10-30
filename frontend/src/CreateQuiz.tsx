import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import axios from "axios";
import {
  ArrowLeft,
  CheckCircle,
  ClipboardList,
  Download,
  FileSpreadsheet,
  HelpCircle,
  Plus,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import API_BASE_URL, { resolveMediaUrl } from "./config";
import ThumbnailPicker from "./components/ThumbnailPicker";

type QuizQuestionType = "single" | "true_false" | "multi" | "matching";

type QuizOptionDraft = {
  label: string;
  is_correct: boolean;
  match_side?: "left" | "right" | null;
  match_key?: string | null;
};

type QuizQuestionDraft = {
  prompt: string;
  question_type: QuizQuestionType;
  points: number;
  options: QuizOptionDraft[];
};

type BankQuiz = {
  id: number;
  title: string;
  description?: string | null;
  image_url?: string | null;
  pass_percent: number;
  duration?: number | null;
  max_attempts?: number | null;
  is_published: boolean;
  course_ids: number[];
  question_count: number;
  questions?: Array<{
    id: number;
    prompt: string;
    question_type: QuizQuestionType;
    points: number;
    options: Array<{
      id: number;
      label: string;
      is_correct?: boolean;
      match_side?: string | null;
      match_key?: string | null;
    }>;
  }>;
};

type CourseOpt = { id: number; title: string; is_published?: boolean };
type ViewMode = "list" | "create" | "manage";

const emptyQuestion = (type: QuizQuestionType = "single"): QuizQuestionDraft => {
  if (type === "true_false") {
    return {
      prompt: "",
      question_type: "true_false",
      points: 1,
      options: [
        { label: "True", is_correct: true },
        { label: "False", is_correct: false },
      ],
    };
  }
  if (type === "matching") {
    return {
      prompt: "",
      question_type: "matching",
      points: 1,
      options: [
        { label: "", is_correct: false, match_side: "left", match_key: "p1" },
        { label: "", is_correct: false, match_side: "right", match_key: "p1" },
        { label: "", is_correct: false, match_side: "left", match_key: "p2" },
        { label: "", is_correct: false, match_side: "right", match_key: "p2" },
      ],
    };
  }
  return {
    prompt: "",
    question_type: type,
    points: 1,
    options: [
      { label: "", is_correct: true },
      { label: "", is_correct: false },
    ],
  };
};

const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

type MetaFieldsProps = {
  title: string;
  setTitle: (v: string) => void;
  description: string;
  setDescription: (v: string) => void;
  imageUrl: string;
  setImageUrl: (v: string) => void;
  passPercent: string;
  setPassPercent: (v: string) => void;
  attemptsUnlimited: boolean;
  setAttemptsUnlimited: (v: boolean) => void;
  maxAttempts: string;
  setMaxAttempts: (v: string) => void;
  isPublished: boolean;
  setIsPublished: (v: boolean) => void;
  courseIds: number[];
  courses: CourseOpt[];
  toggleCourse: (id: number) => void;
  showPublishToggle?: boolean;
};

const MetaFields = ({
  title,
  setTitle,
  description,
  setDescription,
  imageUrl,
  setImageUrl,
  passPercent,
  setPassPercent,
  attemptsUnlimited,
  setAttemptsUnlimited,
  maxAttempts,
  setMaxAttempts,
  isPublished,
  setIsPublished,
  courseIds,
  courses,
  toggleCourse,
  showPublishToggle = false,
}: MetaFieldsProps) => (
  <div className="space-y-4">
    <div>
      <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Title</label>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#005EB8]"
        placeholder="e.g. Python Basics Checkpoint"
      />
    </div>
    <div>
      <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
        Description / instructions
      </label>
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#005EB8]"
        placeholder="Shown to students before they start the quiz..."
      />
    </div>
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">Thumbnail</label>
      <ThumbnailPicker compact value={imageUrl} onChange={setImageUrl} />
    </div>
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">Pass %</label>
        <input
          type="number"
          min={0}
          max={100}
          value={passPercent}
          onChange={(e) => setPassPercent(e.target.value)}
          className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm outline-none focus:border-[#005EB8]"
        />
      </div>
      <div>
        <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-500">
          Attempts per student
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="radio"
              name="quiz-attempts"
              checked={attemptsUnlimited}
              onChange={() => setAttemptsUnlimited(true)}
            />
            Unlimited
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
            <input
              type="radio"
              name="quiz-attempts"
              checked={!attemptsUnlimited}
              onChange={() => setAttemptsUnlimited(false)}
            />
            Limited
          </label>
          {!attemptsUnlimited && (
            <input
              type="number"
              min={1}
              max={100}
              value={maxAttempts}
              onChange={(e) => setMaxAttempts(e.target.value)}
              className="w-24 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#005EB8]"
              placeholder="e.g. 3"
            />
          )}
        </div>
      </div>
    </div>
    {showPublishToggle && (
      <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
        <input type="checkbox" checked={isPublished} onChange={(e) => setIsPublished(e.target.checked)} />
        Published (visible to students)
      </label>
    )}
    <div>
      <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
        Assign to courses (optional)
      </label>
      <div className="max-h-40 overflow-y-auto rounded-xl border border-slate-200 p-3">
        {courses.length === 0 ? (
          <p className="text-sm text-slate-400">No courses available.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {courses.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={courseIds.includes(c.id)} onChange={() => toggleCourse(c.id)} />
                <span className="truncate">{c.title}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>
);

const QuizToast = ({
  show,
  type,
  message,
}: {
  show: boolean;
  type: "success" | "error";
  message: string;
}) => {
  if (!show) return null;
  return createPortal(
    <div className="fixed right-5 top-20 z-[9999] flex max-w-sm items-center gap-3 rounded-xl border border-slate-200 bg-white px-5 py-3 shadow-lg sm:top-24">
      {type === "success" ? (
        <CheckCircle className="shrink-0 text-[#87C232]" size={20} />
      ) : (
        <X className="shrink-0 text-red-500" size={20} />
      )}
      <p className="text-sm font-semibold text-slate-700">{message}</p>
    </div>,
    document.body,
  );
};

const CreateQuiz = () => {
  const [view, setView] = useState<ViewMode>("list");
  const [quizzes, setQuizzes] = useState<BankQuiz[]>([]);
  const [courses, setCourses] = useState<CourseOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [passPercent, setPassPercent] = useState("70");
  const [duration, setDuration] = useState("");
  const [attemptsUnlimited, setAttemptsUnlimited] = useState(true);
  const [maxAttempts, setMaxAttempts] = useState("3");
  const [isPublished, setIsPublished] = useState(false);
  const [courseIds, setCourseIds] = useState<number[]>([]);
  const [questions, setQuestions] = useState<QuizQuestionDraft[]>([emptyQuestion("single")]);
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({
    show: false,
    message: "",
    type: "success",
  });

  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((t) => ({ ...t, show: false })), 3200);
  };

  const loadList = useCallback(async () => {
    setLoading(true);
    try {
      const [qRes, cRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/quizzes`, { headers: authHeaders() }),
        axios.get(`${API_BASE_URL}/instructor/quiz-courses`, { headers: authHeaders() }),
      ]);
      setQuizzes(Array.isArray(qRes.data) ? qRes.data : []);
      setCourses(Array.isArray(cRes.data) ? cRes.data : []);
    } catch (err: any) {
      setQuizzes([]);
      setCourses([]);
      const detail = err?.response?.data?.detail;
      triggerToast(typeof detail === "string" ? detail : "Failed to load quizzes.", "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const resetForm = () => {
    setEditingId(null);
    setTitle("");
    setDescription("");
    setImageUrl("");
    setPassPercent("70");
    setDuration("");
    setAttemptsUnlimited(true);
    setMaxAttempts("3");
    setIsPublished(false);
    setCourseIds([]);
    setQuestions([emptyQuestion("single")]);
  };

  const openCreate = () => {
    resetForm();
    setView("create");
  };

  const backToList = async () => {
    resetForm();
    setView("list");
    await loadList();
  };

  const openManage = async (id: number) => {
    try {
      const res = await axios.get(`${API_BASE_URL}/quizzes/${id}`, { headers: authHeaders() });
      const q: BankQuiz = res.data;
      setEditingId(q.id);
      setTitle(q.title || "");
      setDescription(q.description || "");
      setImageUrl(q.image_url || "");
      setPassPercent(String(q.pass_percent ?? 70));
      setDuration(q.duration != null ? String(q.duration) : "");
      if (q.max_attempts != null && Number(q.max_attempts) > 0) {
        setAttemptsUnlimited(false);
        setMaxAttempts(String(q.max_attempts));
      } else {
        setAttemptsUnlimited(true);
        setMaxAttempts("3");
      }
      setIsPublished(Boolean(q.is_published));
      setCourseIds(q.course_ids || []);
      if (q.questions?.length) {
        setQuestions(
          q.questions.map((item) => ({
            prompt: item.prompt,
            question_type: item.question_type,
            points: item.points || 1,
            options: (item.options || []).map((o) => ({
              label: o.label,
              is_correct: Boolean(o.is_correct),
              match_side: (o.match_side as "left" | "right") || null,
              match_key: o.match_key || null,
            })),
          }))
        );
      } else {
        setQuestions([emptyQuestion("single")]);
      }
      setView("manage");
    } catch {
      triggerToast("Failed to open quiz.", "error");
    }
  };

  const matchingPairs = (q: QuizQuestionDraft) => {
    const lefts = q.options.filter((o) => o.match_side === "left");
    const rightsByKey = Object.fromEntries(
      q.options.filter((o) => o.match_side === "right").map((o) => [o.match_key || "", o])
    );
    return lefts.map((left) => ({
      key: left.match_key || "",
      left,
      right:
        rightsByKey[left.match_key || ""] || {
          label: "",
          match_side: "right" as const,
          match_key: left.match_key,
          is_correct: false,
        },
    }));
  };

  const validateQuestions = (): string | null => {
    const real = questions.filter((q) => q.prompt.trim());
    if (!real.length) return "Upload or add at least one question.";
    for (let i = 0; i < real.length; i++) {
      const q = real[i];
      if (q.question_type === "matching") {
        const pairs = matchingPairs(q);
        if (pairs.length < 1) return `Question ${i + 1}: add matching pairs.`;
        for (const p of pairs) {
          if (!p.left.label.trim() || !p.right.label.trim()) {
            return `Question ${i + 1}: fill all matching left/right labels.`;
          }
        }
      } else {
        if (q.options.length < 2) return `Question ${i + 1} needs at least 2 options.`;
        if (q.options.some((o) => !o.label.trim())) return `Question ${i + 1} has an empty option.`;
        const correct = q.options.filter((o) => o.is_correct).length;
        if (q.question_type === "multi" && correct < 1) return `Question ${i + 1}: mark at least one correct option.`;
        if (q.question_type !== "multi" && correct !== 1) return `Question ${i + 1}: mark exactly one correct option.`;
      }
    }
    return null;
  };

  const resolvedMaxAttempts = () => {
    if (attemptsUnlimited) return null;
    const n = Math.max(1, Math.min(100, Number(maxAttempts) || 1));
    return n;
  };

  const createQuizOnly = async () => {
    if (!title.trim()) return triggerToast("Title is required.", "error");
    if (!attemptsUnlimited && !(Number(maxAttempts) > 0)) {
      return triggerToast("Enter a valid attempt limit (1–100).", "error");
    }
    setSaving(true);
    try {
      await axios.post(
        `${API_BASE_URL}/quizzes`,
        {
          title: title.trim(),
          description: description.trim() || null,
          image_url: imageUrl.trim() || null,
          pass_percent: Math.max(0, Math.min(100, Number(passPercent) || 70)),
          duration: duration ? Number(duration) : null,
          max_attempts: resolvedMaxAttempts(),
          is_published: false,
          course_ids: courseIds,
        },
        { headers: authHeaders() }
      );
      triggerToast("Quiz created. Open it to upload questions from the template.", "success");
      await backToList();
    } catch (e: any) {
      triggerToast(e?.response?.data?.detail || "Failed to create quiz.", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveManageMeta = async () => {
    if (!editingId) return;
    if (!title.trim()) return triggerToast("Title is required.", "error");
    if (!attemptsUnlimited && !(Number(maxAttempts) > 0)) {
      return triggerToast("Enter a valid attempt limit (1–100).", "error");
    }
    setSaving(true);
    try {
      await axios.put(
        `${API_BASE_URL}/quizzes/${editingId}`,
        {
          title: title.trim(),
          description: description.trim() || null,
          image_url: imageUrl.trim() || null,
          pass_percent: Math.max(0, Math.min(100, Number(passPercent) || 70)),
          duration: duration ? Number(duration) : null,
          max_attempts: resolvedMaxAttempts(),
          is_published: isPublished,
        },
        { headers: authHeaders() }
      );
      await axios.put(
        `${API_BASE_URL}/quizzes/${editingId}/assignments`,
        { course_ids: courseIds },
        { headers: authHeaders() }
      );
      triggerToast("Quiz details saved.", "success");
      await loadList();
    } catch (e: any) {
      triggerToast(e?.response?.data?.detail || "Failed to save details.", "error");
    } finally {
      setSaving(false);
    }
  };

  const saveQuestionsAndMaybePublish = async (publish: boolean) => {
    if (!editingId) return;
    const err = validateQuestions();
    if (err) return triggerToast(err, "error");
    setSaving(true);
    try {
      await axios.put(
        `${API_BASE_URL}/quizzes/${editingId}`,
        {
          title: title.trim(),
          description: description.trim() || null,
          image_url: imageUrl.trim() || null,
          pass_percent: Math.max(0, Math.min(100, Number(passPercent) || 70)),
          duration: duration ? Number(duration) : null,
          max_attempts: resolvedMaxAttempts(),
          is_published: publish,
        },
        { headers: authHeaders() }
      );
      await axios.put(
        `${API_BASE_URL}/quizzes/${editingId}/assignments`,
        { course_ids: courseIds },
        { headers: authHeaders() }
      );
      await axios.put(
        `${API_BASE_URL}/quizzes/${editingId}/questions`,
        {
          pass_percent: Math.max(0, Math.min(100, Number(passPercent) || 70)),
          duration: duration ? Number(duration) : null,
          title: title.trim(),
          questions: questions
            .filter((q) => q.prompt.trim())
            .map((q, qi) => ({
              prompt: q.prompt.trim(),
              question_type: q.question_type,
              points: Math.max(1, Number(q.points) || 1),
              order: qi,
              options: q.options.map((o, oi) => ({
                label: o.label.trim(),
                is_correct: Boolean(o.is_correct),
                order: oi,
                match_side: o.match_side || null,
                match_key: o.match_key || null,
              })),
            })),
        },
        { headers: authHeaders() }
      );
      setIsPublished(publish);
      triggerToast(publish ? "Quiz published." : "Questions saved.", "success");
      await loadList();
      if (publish) await backToList();
    } catch (e: any) {
      triggerToast(e?.response?.data?.detail || "Failed to save quiz.", "error");
    } finally {
      setSaving(false);
    }
  };

  const downloadTemplate = async () => {
    try {
      const res = await axios.get(`${API_BASE_URL}/quizzes/template.xlsx`, {
        headers: authHeaders(),
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a");
      a.href = url;
      a.download = "quiz_template.xlsx";
      a.click();
      window.URL.revokeObjectURL(url);
      triggerToast("Template downloaded. Fill questions + answers, then upload.", "success");
    } catch {
      triggerToast("Failed to download template.", "error");
    }
  };

  const importExcel = async (file: File | null) => {
    if (!file || !editingId) {
      triggerToast("Open a created quiz first, then upload the template.", "error");
      return;
    }
    setSaving(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await axios.post(`${API_BASE_URL}/quizzes/${editingId}/import-excel`, form, {
        headers: { ...authHeaders(), "Content-Type": "multipart/form-data" },
      });
      const q: BankQuiz = res.data;
      if (q.questions?.length) {
        setQuestions(
          q.questions.map((item) => ({
            prompt: item.prompt,
            question_type: item.question_type,
            points: item.points || 1,
            options: (item.options || []).map((o) => ({
              label: o.label,
              is_correct: Boolean(o.is_correct),
              match_side: (o.match_side as "left" | "right") || null,
              match_key: o.match_key || null,
            })),
          }))
        );
      }
      triggerToast(`Uploaded ${q.question_count} question(s). Review, then publish.`, "success");
      await loadList();
    } catch (e: any) {
      const detail = e?.response?.data?.detail;
      triggerToast(typeof detail === "string" ? detail : "Import failed.", "error");
    } finally {
      setSaving(false);
    }
  };

  const setPublishFromList = async (quiz: BankQuiz, publish: boolean) => {
    if (publish && !quiz.question_count) {
      triggerToast("Open the quiz and upload questions before publishing.", "error");
      return;
    }
    try {
      await axios.put(
        `${API_BASE_URL}/quizzes/${quiz.id}`,
        { is_published: publish },
        { headers: authHeaders() }
      );
      triggerToast(publish ? "Quiz published." : "Quiz unpublished.", "success");
      await loadList();
    } catch (e: any) {
      triggerToast(e?.response?.data?.detail || (publish ? "Failed to publish." : "Failed to unpublish."), "error");
    }
  };

  const setPublishFromManage = async (publish: boolean) => {
    if (!editingId) return;
    if (publish) {
      const filled = questions.filter((q) => q.prompt.trim()).length;
      if (!filled) {
        triggerToast("Add or upload questions before publishing.", "error");
        return;
      }
      await saveQuestionsAndMaybePublish(true);
      return;
    }
    setSaving(true);
    try {
      await axios.put(
        `${API_BASE_URL}/quizzes/${editingId}`,
        { is_published: false },
        { headers: authHeaders() }
      );
      setIsPublished(false);
      triggerToast("Quiz unpublished.", "success");
      await loadList();
    } catch (e: any) {
      triggerToast(e?.response?.data?.detail || "Failed to unpublish.", "error");
    } finally {
      setSaving(false);
    }
  };

  const deleteQuiz = async (id: number) => {
    if (!confirm("Delete this quiz and all attempts?")) return;
    try {
      await axios.delete(`${API_BASE_URL}/quizzes/${id}`, { headers: authHeaders() });
      triggerToast("Quiz deleted.", "success");
      await loadList();
    } catch {
      triggerToast("Failed to delete quiz.", "error");
    }
  };

  const toggleCourse = (id: number) => {
    setCourseIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  };

  const setQuestionType = (index: number, type: QuizQuestionType) => {
    setQuestions((prev) => prev.map((q, i) => (i === index ? emptyQuestion(type) : q)));
  };

  const metaProps: MetaFieldsProps = {
    title,
    setTitle,
    description,
    setDescription,
    imageUrl,
    setImageUrl,
    passPercent,
    setPassPercent,
    attemptsUnlimited,
    setAttemptsUnlimited,
    maxAttempts,
    setMaxAttempts,
    isPublished,
    setIsPublished,
    courseIds,
    courses,
    toggleCourse,
  };

  if (view === "create") {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void backToList()}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft size={16} /> Back to quizzes
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void createQuizOnly()}
            className="inline-flex items-center gap-2 rounded-xl bg-[#005EB8] px-4 py-2 text-sm font-bold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Creating…" : "Create quiz"}
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="mb-1 text-xl font-extrabold text-slate-800">Create quiz</h1>
          <p className="mb-5 text-sm text-slate-500">
            Step 1: add title, description, and thumbnail. After creating, open the quiz to upload questions.
          </p>
          <MetaFields {...metaProps} />
        </div>
        <QuizToast show={toast.show} type={toast.type} message={toast.message} />
      </div>
    );
  }

  if (view === "manage" && editingId) {
    return (
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => void backToList()}
            className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900"
          >
            <ArrowLeft size={16} /> Back to quizzes
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveManageMeta()}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              Save details
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void saveQuestionsAndMaybePublish(false)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              Save questions
            </button>
            {isPublished ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void setPublishFromManage(false)}
                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-bold text-amber-800 disabled:opacity-60"
              >
                Unpublish
              </button>
            ) : (
              <button
                type="button"
                disabled={saving}
                onClick={() => void setPublishFromManage(true)}
                className="rounded-xl bg-[#005EB8] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
              >
                Publish quiz
              </button>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="mb-1 text-xl font-extrabold text-slate-800">Manage quiz</h1>
          <p className="mb-5 text-sm text-slate-500">
            Step 2: upload questions from the Excel template (with answers), then publish.
          </p>
          <MetaFields {...metaProps} showPublishToggle />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold text-slate-800">
                <FileSpreadsheet className="text-[#005EB8]" size={20} /> Upload quiz template
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Download the template, fill questions with correct answers, then upload. This replaces the current questions.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void downloadTemplate()}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                <Download size={16} /> Download template
              </button>
              <label
                className={`inline-flex cursor-pointer items-center gap-2 rounded-xl bg-[#005EB8] px-4 py-2 text-sm font-bold text-white ${
                  saving ? "pointer-events-none opacity-60" : ""
                }`}
              >
                <Upload size={16} /> Upload Excel
                <input
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    e.target.value = "";
                    void importExcel(f);
                  }}
                />
              </label>
            </div>
          </div>
          <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
            <li>
              <span className="font-semibold">single / multi:</span> option_a–d + <code className="rounded bg-slate-100 px-1">correct</code> (A or A,C)
            </li>
            <li>
              <span className="font-semibold">true_false:</span> <code className="rounded bg-slate-100 px-1">correct</code> = True or False
            </li>
            <li>
              <span className="font-semibold">matching:</span> match_left / match_right with the same prompt per pair
            </li>
          </ul>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800">
              Questions ({questions.filter((q) => q.prompt.trim()).length})
            </h2>
            <button
              type="button"
              onClick={() => setQuestions((prev) => [...prev, emptyQuestion("single")])}
              className="inline-flex items-center gap-1 text-sm font-bold text-[#005EB8]"
            >
              <Plus size={16} /> Add manually
            </button>
          </div>

          <div className="space-y-4">
            {questions.map((q, qi) => (
              <div key={qi} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Question {qi + 1}</span>
                  {questions.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== qi))}
                      className="text-xs font-bold text-red-500"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <div className="mb-3 grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-500">Type</label>
                    <select
                      value={q.question_type}
                      onChange={(e) => setQuestionType(qi, e.target.value as QuizQuestionType)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="single">Multiple choice (single)</option>
                      <option value="multi">Multi-select</option>
                      <option value="true_false">True / False</option>
                      <option value="matching">Matching</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs font-bold text-slate-500">Points</label>
                    <input
                      type="number"
                      min={1}
                      value={q.points}
                      onChange={(e) =>
                        setQuestions((prev) =>
                          prev.map((qq, i) => (i === qi ? { ...qq, points: Number(e.target.value) || 1 } : qq))
                        )
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <label className="mb-1 block text-xs font-bold text-slate-500">Prompt</label>
                <textarea
                  rows={2}
                  value={q.prompt}
                  onChange={(e) =>
                    setQuestions((prev) => prev.map((qq, i) => (i === qi ? { ...qq, prompt: e.target.value } : qq)))
                  }
                  className="mb-3 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                />
                {q.question_type === "matching" ? (
                  <div className="space-y-2">
                    {matchingPairs(q).map((pair) => (
                      <div key={pair.key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                        <input
                          value={pair.left.label}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((qq, i) =>
                                i === qi
                                  ? {
                                      ...qq,
                                      options: qq.options.map((o) =>
                                        o.match_key === pair.key && o.match_side === "left"
                                          ? { ...o, label: e.target.value }
                                          : o
                                      ),
                                    }
                                  : qq
                              )
                            )
                          }
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          placeholder="Left"
                        />
                        <input
                          value={pair.right.label}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((qq, i) =>
                                i === qi
                                  ? {
                                      ...qq,
                                      options: qq.options.map((o) =>
                                        o.match_key === pair.key && o.match_side === "right"
                                          ? { ...o, label: e.target.value }
                                          : o
                                      ),
                                    }
                                  : qq
                              )
                            )
                          }
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                          placeholder="Right"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setQuestions((prev) =>
                              prev.map((qq, i) =>
                                i === qi ? { ...qq, options: qq.options.filter((o) => o.match_key !== pair.key) } : qq
                              )
                            )
                          }
                          className="p-2 text-red-500"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        const key = `p${Date.now()}`;
                        setQuestions((prev) =>
                          prev.map((qq, i) =>
                            i === qi
                              ? {
                                  ...qq,
                                  options: [
                                    ...qq.options,
                                    { label: "", is_correct: false, match_side: "left", match_key: key },
                                    { label: "", is_correct: false, match_side: "right", match_key: key },
                                  ],
                                }
                              : qq
                          )
                        );
                      }}
                      className="text-sm font-bold text-[#005EB8]"
                    >
                      + Add pair
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {q.options.map((opt, oi) => (
                      <div key={oi} className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            setQuestions((prev) =>
                              prev.map((qq, i) => {
                                if (i !== qi) return qq;
                                if (qq.question_type === "multi") {
                                  return {
                                    ...qq,
                                    options: qq.options.map((o, j) =>
                                      j === oi ? { ...o, is_correct: !o.is_correct } : o
                                    ),
                                  };
                                }
                                return {
                                  ...qq,
                                  options: qq.options.map((o, j) => ({ ...o, is_correct: j === oi })),
                                };
                              })
                            )
                          }
                          className={`flex h-7 w-7 shrink-0 items-center justify-center border-2 text-xs font-bold text-white ${
                            q.question_type === "multi" ? "rounded-md" : "rounded-full"
                          }`}
                          style={{
                            borderColor: opt.is_correct ? "#87C232" : "#e2e8f0",
                            background: opt.is_correct ? "#87C232" : "white",
                          }}
                        >
                          {opt.is_correct ? "✓" : ""}
                        </button>
                        <input
                          value={opt.label}
                          disabled={q.question_type === "true_false"}
                          onChange={(e) =>
                            setQuestions((prev) =>
                              prev.map((qq, i) =>
                                i === qi
                                  ? {
                                      ...qq,
                                      options: qq.options.map((o, j) =>
                                        j === oi ? { ...o, label: e.target.value } : o
                                      ),
                                    }
                                  : qq
                              )
                            )
                          }
                          className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm disabled:opacity-80"
                        />
                      </div>
                    ))}
                    {q.question_type !== "true_false" && (
                      <button
                        type="button"
                        onClick={() =>
                          setQuestions((prev) =>
                            prev.map((qq, i) =>
                              i === qi
                                ? { ...qq, options: [...qq.options, { label: "", is_correct: false }] }
                                : qq
                            )
                          )
                        }
                        className="text-sm font-bold text-[#005EB8]"
                      >
                        + Add option
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
        <QuizToast show={toast.show} type={toast.type} message={toast.message} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-extrabold text-slate-800">
            <HelpCircle className="text-[#005EB8]" /> Create Quiz
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            1) Create quiz (title, description, thumbnail) · 2) Open it · 3) Upload template · 4) Publish
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void downloadTemplate()}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
          >
            <FileSpreadsheet size={16} /> Download template
          </button>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-[#005EB8] px-4 py-2 text-sm font-bold text-white"
          >
            <Plus size={16} /> New quiz
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-slate-500">Loading quizzes…</p>
      ) : quizzes.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-10 text-center">
          <ClipboardList className="mx-auto mb-3 text-slate-300" size={36} />
          <p className="font-semibold text-slate-700">No quizzes yet</p>
          <p className="mt-1 text-sm text-slate-500">Create a quiz first, then open it to upload questions.</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {quizzes.map((q) => (
            <div key={q.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="aspect-video bg-slate-100">
                {q.image_url ? (
                  <img src={resolveMediaUrl(q.image_url)} alt="" className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-300">
                    <HelpCircle size={36} />
                  </div>
                )}
              </div>
              <div className="p-5">
                <div className="mb-2 flex items-start justify-between gap-2">
                  <h2 className="text-lg font-bold text-slate-800">{q.title}</h2>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      q.is_published ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500"
                    }`}
                  >
                    {q.is_published ? "Published" : "Draft"}
                  </span>
                </div>
                <p className="mb-3 line-clamp-2 text-sm text-slate-500">{q.description || "No description"}</p>
                <p className="mb-4 text-xs font-semibold text-slate-400">
                  {q.question_count} question{q.question_count === 1 ? "" : "s"} · Pass {q.pass_percent}%
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void openManage(q.id)}
                    className="flex-1 rounded-xl bg-slate-100 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200"
                  >
                    Open
                  </button>
                  {q.is_published ? (
                    <button
                      type="button"
                      onClick={() => void setPublishFromList(q, false)}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-bold text-amber-800"
                    >
                      Unpublish
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void setPublishFromList(q, true)}
                      className="rounded-xl bg-[#005EB8] px-3 py-2 text-sm font-bold text-white"
                    >
                      Publish
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => void deleteQuiz(q.id)}
                    className="rounded-xl px-3 py-2 text-sm font-bold text-red-500 hover:bg-red-50"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <QuizToast show={toast.show} type={toast.type} message={toast.message} />
    </div>
  );
};

export default CreateQuiz;
