import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import { motion } from "framer-motion";
import {
  ArrowLeft, Award, BookOpen, CheckCircle2, ChevronDown, ChevronRight,
  Clock, Code, FileText, HelpCircle, LayoutDashboard, Lock, PlayCircle,
  Radio, Trophy, UploadCloud, Download, ExternalLink,
} from "lucide-react";
import API_BASE_URL, { resolveMediaUrl } from "./config";
import BrandLogo from "./components/BrandLogo";
import { categoryLabel, resolveCourseCategory } from "./utils/courseCategories";
import { certificateVerifyPath, downloadCertificatePdf } from "./utils/certificates";

type LessonRow = {
  id: number;
  title: string;
  type: string;
  duration?: number | null;
  is_mandatory?: boolean;
  is_completed: boolean;
  completed_at?: string | null;
  assignment_status?: string | null;
};

type ModuleRow = {
  id: number;
  title: string;
  completed: number;
  total: number;
  percent: number;
  lessons: LessonRow[];
};

type ChallengeRow = {
  id: number;
  title: string;
  difficulty: string;
  is_solved: boolean;
};

type DashboardPayload = {
  course: {
    id: number;
    title: string;
    description?: string;
    image_url?: string | null;
    course_type?: string;
    language?: string;
    category?: string | null;
    instructor_name?: string | null;
  };
  enrollment: {
    enrollment_type: string;
    enrolled_at?: string | null;
    days_left: number;
    is_trial_expired: boolean;
  };
  progress: {
    completed: number;
    total: number;
    percent: number;
    is_complete: boolean;
    remaining_minutes: number;
    modules_completed: number;
    modules_total: number;
  };
  by_type: Record<string, { completed: number; total: number }>;
  modules: ModuleRow[];
  challenges: {
    solved: number;
    total: number;
    percent: number;
    by_difficulty: Record<string, { solved: number; total: number; items: ChallengeRow[] }>;
  } | null;
  next_lesson: { id: number; title: string; type: string; module_title?: string } | null;
  next_challenge: ChallengeRow | null;
  recent_activity: { id: number; title: string; type: string; completed_at: string }[];
  certificate: { eligible: boolean; claimed: boolean; issued_at?: string | null; credential_id?: string | null; verify_url?: string | null };
};

const TYPE_META: Record<string, { label: string; icon: typeof PlayCircle }> = {
  videos: { label: "Videos", icon: PlayCircle },
  notes: { label: "Notes", icon: FileText },
  quizzes: { label: "Quizzes", icon: HelpCircle },
  assignments: { label: "Assignments", icon: UploadCloud },
  code_tests: { label: "Code tests", icon: Code },
  live_tests: { label: "Live tests", icon: Radio },
  lessons: { label: "Lessons", icon: BookOpen },
};

const lessonIcon = (type?: string) => {
  const kind = (type || "").toLowerCase();
  if (kind.includes("video")) return PlayCircle;
  if (kind === "note") return FileText;
  if (kind === "quiz") return HelpCircle;
  if (kind.includes("code")) return Code;
  if (kind === "assignment") return UploadCloud;
  if (kind === "live_class") return Radio;
  return BookOpen;
};

const ProgressRing = ({ percent, size = 132 }: { percent: number; size?: number }) => {
  const value = Math.max(0, Math.min(100, Number(percent) || 0));
  const stroke = 10;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const done = value >= 100;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="white" stroke="#e2e8f0" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={done ? "#87C232" : "#005EB8"}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-extrabold text-slate-900 tabular-nums leading-none">{value}%</span>
        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mt-1">Complete</span>
      </div>
    </div>
  );
};

const formatWhen = (value?: string | null) => {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
};

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
    <p className="text-sm font-extrabold text-slate-800 mt-1">{value}</p>
  </div>
);

export default function CourseProgressDashboard() {
  const { courseId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [openModules, setOpenModules] = useState<number[]>([]);
  const [claiming, setClaiming] = useState(false);
  const autoIssueAttempted = useRef(false);
  const [toast, setToast] = useState({ show: false, message: "", type: "success" as "success" | "error" });

  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 2800);
  };

  const loadDashboard = useCallback(async () => {
    const token = localStorage.getItem("token");
    if (!token || !courseId) return;
    setLoading(true);
    setError("");
    try {
      const res = await axios.get(`${API_BASE_URL}/courses/${courseId}/progress-dashboard`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setData(res.data);
      const incomplete = (res.data.modules || [])
        .filter((module: ModuleRow) => module.total > 0 && module.completed < module.total)
        .map((module: ModuleRow) => module.id);
      setOpenModules(incomplete.length ? incomplete.slice(0, 2) : (res.data.modules?.[0] ? [res.data.modules[0].id] : []));
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 403) setError("You need to enroll in this course to view its progress dashboard.");
      else if (status === 404) setError("This course could not be found.");
      else setError(err?.response?.data?.detail || "Could not load course progress.");
    } finally {
      setLoading(false);
    }
  }, [courseId]);

  useEffect(() => { void loadDashboard(); }, [loadDashboard]);

  const goToPlayer = (lessonId?: number) => {
    if (!courseId) return;
    const query = lessonId ? `?lesson=${lessonId}` : "";
    navigate(`/course/${courseId}/player${query}`);
  };

  const handleDownloadCertificate = async () => {
    if (!courseId || !data) return;
    try {
      await downloadCertificatePdf(Number(courseId), data.course.title);
      triggerToast("Certificate downloaded.", "success");
    } catch {
      triggerToast("Could not download certificate.", "error");
    }
  };

  const handleClaimCertificate = useCallback(async (options?: { silent?: boolean }) => {
    if (!courseId) return false;
    setClaiming(true);
    try {
      const token = localStorage.getItem("token");
      const res = await axios.post(`${API_BASE_URL}/courses/${courseId}/claim-certificate`, {}, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.data.status === "success") {
        if (!options?.silent) {
          triggerToast("Your Cloudvaathi certificate is ready!", "success");
        }
        await loadDashboard();
        return true;
      }
      if (!options?.silent) {
        triggerToast(res.data.message || "Course is not complete yet.", "error");
      }
      return false;
    } catch {
      if (!options?.silent) {
        triggerToast("Could not issue certificate.", "error");
      }
      return false;
    } finally {
      setClaiming(false);
    }
  }, [courseId, loadDashboard]);

  useEffect(() => {
    autoIssueAttempted.current = false;
  }, [courseId]);

  useEffect(() => {
    if (!data?.certificate?.eligible || data.certificate.claimed || claiming || autoIssueAttempted.current) return;
    autoIssueAttempted.current = true;
    void handleClaimCertificate({ silent: true }).then((issued) => {
      if (issued) {
        triggerToast("Course complete — your Cloudvaathi certificate was issued and emailed.", "success");
      }
    });
  }, [data?.certificate?.eligible, data?.certificate?.claimed, claiming, handleClaimCertificate]);

  const typeCards = useMemo(() => {
    if (!data) return [];
    return Object.entries(data.by_type || {}).filter(([, stats]) => stats.total > 0);
  }, [data]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#005EB8]" />
          <p className="text-slate-500 font-bold animate-pulse">Loading course dashboard...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 p-8 text-center">
          <Lock size={36} className="mx-auto text-slate-300 mb-4" />
          <h2 className="text-xl font-extrabold text-slate-800 mb-2">Progress unavailable</h2>
          <p className="text-slate-500 text-sm mb-6">{error || "Something went wrong."}</p>
          <button onClick={() => navigate("/student-dashboard")} className="px-4 py-2 rounded-lg bg-[#005EB8] text-white font-bold text-sm">
            Back to My Learning
          </button>
        </div>
      </div>
    );
  }

  const { course, enrollment, progress, certificate } = data;
  const locked = enrollment.is_trial_expired;
  const continueLabel = progress.completed === 0 ? "Start learning" : "Continue learning";
  const continueTarget = course.course_type === "coding" ? undefined : data.next_lesson?.id;

  return (
    <div className="min-h-screen font-sans">
      {toast.show && (
        <div className={`fixed top-5 right-5 z-[10000] px-6 py-3 rounded-lg shadow-xl text-white font-bold flex items-center gap-3 ${toast.type === "success" ? "bg-green-500" : "bg-red-500"}`}>
          {toast.type === "success" ? <CheckCircle2 size={18} /> : <Lock size={18} />}
          {toast.message}
        </div>
      )}

      <header className="glass border-b border-border/50 px-4 lg:px-8 py-4 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={() => navigate("/student-dashboard")} className="p-2 rounded-lg hover:bg-white/10 text-muted-foreground" title="My Learning">
              <ArrowLeft size={20} />
            </button>
            <BrandLogo size="sm" imageOnly />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Course dashboard</p>
              <h1 className="text-sm sm:text-base font-extrabold text-foreground truncate">{course.title}</h1>
            </div>
          </div>
          <button
            disabled={locked}
            onClick={() => goToPlayer(continueTarget)}
            className={`hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm ${locked ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-[#005EB8] text-white hover:bg-[#004a94]"}`}
          >
            <PlayCircle size={16} /> {continueLabel}
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-4 lg:p-8 space-y-6">
        <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="grid lg:grid-cols-[1.4fr_220px] gap-6 p-6 lg:p-8">
            <div>
              <div className="flex items-start gap-4">
                <div className="w-24 h-24 rounded-2xl overflow-hidden bg-slate-100 shrink-0 hidden sm:block">
                  {course.image_url ? (
                    <img src={resolveMediaUrl(course.image_url)} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300"><BookOpen /></div>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-[#005EB8] text-[10px] font-extrabold uppercase tracking-wide">
                      {categoryLabel(resolveCourseCategory(course))}
                    </span>
                    {enrollment.enrollment_type === "trial" && (
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${locked ? "bg-red-50 text-red-600" : "bg-orange-50 text-orange-600"}`}>
                        {locked ? "Trial ended" : `${enrollment.days_left} days left`}
                      </span>
                    )}
                    {certificate.claimed && (
                      <span className="px-2.5 py-0.5 rounded-full bg-yellow-50 text-yellow-700 text-[10px] font-extrabold uppercase">Certificate earned</span>
                    )}
                  </div>
                  <h2 className="text-2xl font-extrabold text-slate-900 mb-2">{course.title}</h2>
                  <p className="text-sm text-slate-500 line-clamp-3">{course.description || "Track your lessons, assignments, and completion for this course."}</p>
                  <p className="text-xs text-slate-400 mt-3">
                    {course.instructor_name ? `Instructor: ${course.instructor_name}` : "Your enrolled course"}
                    {enrollment.enrolled_at ? ` · Joined ${formatWhen(enrollment.enrolled_at)}` : ""}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6">
                <Stat label="Lessons done" value={`${progress.completed}/${progress.total}`} />
                <Stat label="Modules done" value={`${progress.modules_completed}/${progress.modules_total}`} />
                <Stat label="Remaining" value={progress.remaining_minutes ? `${progress.remaining_minutes} min` : "—"} />
                <Stat label="Status" value={progress.is_complete ? "Complete" : progress.completed ? "In progress" : "Not started"} />
              </div>
            </div>

            <div className="flex flex-col items-center justify-center gap-4">
              <ProgressRing percent={progress.percent} />
              <button
                disabled={locked}
                onClick={() => goToPlayer(continueTarget)}
                className={`w-full py-3 rounded-xl font-bold text-sm flex items-center justify-center gap-2 ${locked ? "bg-slate-200 text-slate-400 cursor-not-allowed" : "bg-slate-900 text-white hover:bg-[#005EB8]"}`}
              >
                {locked ? <Lock size={16} /> : <PlayCircle size={16} />}
                {locked ? "Unlock to continue" : continueLabel}
              </button>
            </div>
          </div>
        </motion.section>

        {certificate.eligible && (
          <div className="bg-blue-50 border border-blue-100 rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Award className="text-[#005EB8]" />
              <div>
                <p className="font-extrabold text-slate-800">
                  {certificate.claimed ? "Cloudvaathi certificate ready" : claiming ? "Issuing certificate..." : "You finished this course"}
                </p>
                <p className="text-sm text-slate-500">
                  {certificate.claimed
                    ? (certificate.credential_id ? `Certificate No: ${certificate.credential_id}` : "Download your Cloudvaathi certificate.")
                    : "Your certificate will be issued automatically when all requirements are complete."}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {certificate.claimed && certificate.credential_id && (
                <button onClick={() => navigate(certificateVerifyPath(certificate.credential_id!))} className="px-4 py-2 rounded-xl border border-slate-200 text-slate-700 font-bold text-sm flex items-center gap-2">
                  <ExternalLink size={16} /> Verify
                </button>
              )}
              {certificate.claimed ? (
                <button onClick={handleDownloadCertificate} className="px-4 py-2 rounded-xl bg-[#005EB8] text-white font-bold text-sm flex items-center gap-2">
                  <Download size={16} /> Download
                </button>
              ) : (
                <button onClick={() => void handleClaimCertificate()} disabled={claiming} className="px-4 py-2 rounded-xl bg-[#005EB8] text-white font-bold text-sm">
                  {claiming ? "Issuing..." : "Issue certificate"}
                </button>
              )}
            </div>
          </div>
        )}

        {typeCards.length > 0 && (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {typeCards.map(([key, stats]) => {
              const meta = TYPE_META[key] || TYPE_META.lessons;
              const Icon = meta.icon;
              const pct = stats.total ? Math.round((stats.completed / stats.total) * 100) : 0;
              return (
                <div key={key} className="bg-white rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center gap-2 text-slate-500 mb-3">
                    <Icon size={16} />
                    <span className="text-xs font-bold uppercase tracking-wide">{meta.label}</span>
                  </div>
                  <p className="text-2xl font-extrabold text-slate-800">{stats.completed}<span className="text-slate-400 text-base font-bold">/{stats.total}</span></p>
                  <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full bg-[#005EB8]" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {data.challenges && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-extrabold text-slate-800 flex items-center gap-2"><Trophy size={18} className="text-[#005EB8]" /> Coding challenges</h3>
              <span className="text-sm font-bold text-slate-500">{data.challenges.solved}/{data.challenges.total} solved</span>
            </div>
            <div className="grid sm:grid-cols-3 gap-4">
              {["Easy", "Medium", "Hard"].map((level) => {
                const bucket = data.challenges?.by_difficulty?.[level] || { solved: 0, total: 0, items: [] };
                const pct = bucket.total ? Math.round((bucket.solved / bucket.total) * 100) : 0;
                return (
                  <div key={level} className="rounded-xl border border-slate-100 p-4 bg-slate-50">
                    <div className="flex justify-between text-sm font-bold mb-2">
                      <span>{level}</span>
                      <span className="text-slate-500">{bucket.solved}/{bucket.total}</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-white overflow-hidden">
                      <div className="h-full rounded-full bg-[#87C232]" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {data.modules.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center gap-2">
              <LayoutDashboard size={18} className="text-[#005EB8]" />
              <h3 className="font-extrabold text-slate-800">Module progress</h3>
            </div>
            {data.modules.map((module, idx) => {
              const open = openModules.includes(module.id);
              const complete = module.total > 0 && module.completed === module.total;
              return (
                <div key={module.id} className="border-b border-slate-100 last:border-0">
                  <button
                    onClick={() => setOpenModules((prev) => prev.includes(module.id) ? prev.filter((id) => id !== module.id) : [...prev, module.id])}
                    className="w-full text-left px-6 py-4 flex items-center gap-4 hover:bg-slate-50"
                  >
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-extrabold ${complete ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}`}>
                      {complete ? <CheckCircle2 size={16} /> : idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-slate-800 truncate">{module.title}</p>
                      <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                        <div className={`h-full rounded-full ${complete ? "bg-[#87C232]" : "bg-[#005EB8]"}`} style={{ width: `${module.percent}%` }} />
                      </div>
                    </div>
                    <span className="text-xs font-bold text-slate-400 tabular-nums">{module.completed}/{module.total}</span>
                    {open ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                  </button>
                  {open && (
                    <div className="px-6 pb-4 space-y-1">
                      {module.lessons.map((lesson) => {
                        const Icon = lessonIcon(lesson.type);
                        return (
                          <button
                            key={lesson.id}
                            disabled={locked}
                            onClick={() => goToPlayer(lesson.id)}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-slate-50 text-left disabled:opacity-50"
                          >
                            {lesson.is_completed ? (
                              <CheckCircle2 size={16} className="text-[#87C232] shrink-0" />
                            ) : (
                              <Icon size={16} className="text-slate-400 shrink-0" />
                            )}
                            <span className={`flex-1 text-sm ${lesson.is_completed ? "text-slate-400 line-through" : "text-slate-700 font-medium"}`}>{lesson.title}</span>
                            {lesson.assignment_status && (
                              <span className="text-[10px] font-bold uppercase text-slate-400">{lesson.assignment_status}</span>
                            )}
                            {lesson.duration ? <span className="text-[11px] text-slate-400 flex items-center gap-1"><Clock size={11} />{lesson.duration}m</span> : null}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {data.recent_activity.length > 0 && (
          <section className="bg-white rounded-2xl border border-slate-200 p-6">
            <h3 className="font-extrabold text-slate-800 mb-4">Recent activity</h3>
            <div className="space-y-3">
              {data.recent_activity.map((item) => (
                <div key={`${item.id}-${item.completed_at}`} className="flex items-center gap-3 text-sm">
                  <CheckCircle2 size={16} className="text-[#87C232]" />
                  <span className="flex-1 text-slate-700 font-medium">{item.title}</span>
                  <span className="text-slate-400 text-xs">{formatWhen(item.completed_at)}</span>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
