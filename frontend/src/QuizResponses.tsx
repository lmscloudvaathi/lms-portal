import { useEffect, useState } from "react";
import axios from "axios";
import API_BASE_URL from "./config";
import {
  ChevronDown,
  ChevronRight,
  ClipboardList,
  User,
  Award,
} from "lucide-react";
import CvToast from "./components/CvToast";

type QuizCourse = { id: number; title: string; is_published?: boolean };

type AttemptRow = {
  id: number;
  score: number;
  max_score: number;
  percent: number;
  submitted_at: string | null;
  student_id: number;
  student_name: string;
  student_email: string;
  attempt_number: number;
};

type QuizBlock = {
  content_item_id: number;
  title: string;
  pass_percent: number;
  attempt_count: number;
  attempts: AttemptRow[];
};

type AttemptDetail = {
  id: number;
  quiz_title: string;
  score: number;
  max_score: number;
  percent: number;
  submitted_at: string | null;
  student: { id: number | null; name: string | null; email: string | null };
  answers: {
    question_id: number;
    prompt: string;
    question_type: string;
    is_correct: boolean;
    points_awarded: number;
    points: number;
    selected_options: { id: number; label: string }[];
    correct_options: { id: number; label: string }[];
  }[];
};

const QuizResponses = () => {
  const [courses, setCourses] = useState<QuizCourse[]>([]);
  const [courseId, setCourseId] = useState<string>("");
  const [quizzes, setQuizzes] = useState<QuizBlock[]>([]);
  const [courseTitle, setCourseTitle] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingQuizzes, setLoadingQuizzes] = useState(false);
  const [expandedQuiz, setExpandedQuiz] = useState<number | null>(null);
  const [detail, setDetail] = useState<AttemptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({
    show: false,
    message: "",
    type: "success",
  });

  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast((prev) => ({ ...prev, show: false })), 3000);
  };

  const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem("token")}` });

  useEffect(() => {
    const loadCourses = async () => {
      try {
        const res = await axios.get(`${API_BASE_URL}/instructor/quiz-courses`, {
          headers: authHeaders(),
        });
        setCourses(res.data || []);
        if (res.data?.length) setCourseId(String(res.data[0].id));
      } catch {
        triggerToast("Failed to load courses with quizzes.", "error");
      } finally {
        setLoading(false);
      }
    };
    void loadCourses();
  }, []);

  useEffect(() => {
    if (!courseId) {
      setQuizzes([]);
      return;
    }
    const load = async () => {
      setLoadingQuizzes(true);
      setExpandedQuiz(null);
      setDetail(null);
      try {
        const res = await axios.get(`${API_BASE_URL}/courses/${courseId}/quiz-responses`, {
          headers: authHeaders(),
        });
        setCourseTitle(res.data.course_title || "");
        setQuizzes(res.data.quizzes || []);
      } catch {
        triggerToast("Failed to load quiz responses.", "error");
        setQuizzes([]);
      } finally {
        setLoadingQuizzes(false);
      }
    };
    void load();
  }, [courseId]);

  const openAttempt = async (attemptId: number) => {
    setDetailLoading(true);
    try {
      const res = await axios.get(`${API_BASE_URL}/quiz-attempts/${attemptId}`, {
        headers: authHeaders(),
      });
      setDetail(res.data);
    } catch {
      triggerToast("Could not load attempt details.", "error");
    } finally {
      setDetailLoading(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-muted-foreground">Loading quiz responses…</div>;
  }

  return (
    <div className="relative font-sans">
      <h1 className="mb-2 flex items-center gap-2 text-2xl font-bold">
        <ClipboardList className="text-primary" /> Quiz Responses
      </h1>
      <p className="mb-6 text-sm text-slate-500">
        View student attempts for in-app quizzes on draft or published courses. Add quizzes anytime from Course Builder.
      </p>

      <div className="mb-6 max-w-md">
        <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-slate-500">
          Course
        </label>
        <select
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-primary/40"
        >
          {courses.length === 0 && <option value="">No courses found</option>}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}{c.is_published ? " (Published)" : " (Draft)"}
            </option>
          ))}
        </select>
      </div>

      {loadingQuizzes ? (
        <p className="text-slate-500">Loading…</p>
      ) : quizzes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <p className="mb-2 font-semibold text-slate-700">No quizzes in this course yet</p>
          <p className="mb-4 text-sm text-slate-500">
            Open the course builder, pick a module, and add an in-app Quiz — works on published courses too.
          </p>
          {courseId && (
            <a
              href={`/dashboard/course/${courseId}/builder`}
              className="inline-flex rounded-xl bg-[#005EB8] px-5 py-2.5 text-sm font-bold text-white hover:bg-blue-700"
            >
              Open Course Builder
            </a>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm font-semibold text-slate-600">{courseTitle}</p>
          {quizzes.map((quiz) => (
            <div
              key={quiz.content_item_id}
              className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
            >
              <button
                type="button"
                onClick={() =>
                  setExpandedQuiz(expandedQuiz === quiz.content_item_id ? null : quiz.content_item_id)
                }
                className="flex w-full items-center justify-between p-5 text-left hover:bg-slate-50"
              >
                <div>
                  <h2 className="text-lg font-bold text-slate-800">{quiz.title}</h2>
                  <p className="text-sm text-slate-500">
                    {quiz.attempt_count} attempt{quiz.attempt_count === 1 ? "" : "s"} · Pass {quiz.pass_percent}%
                  </p>
                </div>
                {expandedQuiz === quiz.content_item_id ? (
                  <ChevronDown size={20} />
                ) : (
                  <ChevronRight size={20} />
                )}
              </button>

              {expandedQuiz === quiz.content_item_id && (
                <div className="border-t border-slate-100 bg-slate-50 p-4">
                  {quiz.attempts.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">No submissions yet.</p>
                  ) : (
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b border-slate-100 bg-slate-50 text-xs uppercase text-slate-500">
                          <tr>
                            <th className="px-4 py-3">Student</th>
                            <th className="px-4 py-3">Attempt</th>
                            <th className="px-4 py-3">Score</th>
                            <th className="px-4 py-3">Submitted</th>
                            <th className="px-4 py-3" />
                          </tr>
                        </thead>
                        <tbody>
                          {quiz.attempts.map((a) => (
                            <tr key={a.id} className="border-b border-slate-50 last:border-0">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <User size={16} className="text-slate-400" />
                                  <div>
                                    <div className="font-semibold text-slate-800">{a.student_name}</div>
                                    <div className="text-xs text-slate-400">{a.student_email}</div>
                                  </div>
                                </div>
                              </td>
                              <td className="px-4 py-3 font-semibold text-slate-600">#{a.attempt_number}</td>
                              <td className="px-4 py-3">
                                <span
                                  className={`inline-flex items-center gap-1 font-bold ${
                                    a.percent >= quiz.pass_percent ? "text-green-600" : "text-amber-600"
                                  }`}
                                >
                                  <Award size={14} />
                                  {a.percent}% ({a.score}/{a.max_score})
                                </span>
                              </td>
                              <td className="px-4 py-3 text-slate-500">
                                {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <button
                                  type="button"
                                  onClick={() => void openAttempt(a.id)}
                                  className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-bold text-[#005EB8] hover:bg-blue-100"
                                >
                                  View answers
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {(detail || detailLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-lg font-extrabold text-slate-800">
                  {detail?.quiz_title || "Attempt details"}
                </h3>
                {detail && (
                  <p className="text-sm text-slate-500">
                    {detail.student?.name} · {detail.percent}% ({detail.score}/{detail.max_score})
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded-lg px-3 py-1.5 text-sm font-bold text-slate-500 hover:bg-slate-100"
              >
                Close
              </button>
            </div>
            {detailLoading && !detail ? (
              <p className="py-10 text-center text-slate-400">Loading…</p>
            ) : (
              <div className="space-y-3">
                {detail?.answers.map((ans, idx) => (
                  <div
                    key={ans.question_id}
                    className={`rounded-xl border p-4 ${
                      ans.is_correct ? "border-green-100 bg-green-50/50" : "border-red-100 bg-red-50/50"
                    }`}
                  >
                    <p className="text-xs font-bold uppercase text-slate-400">Q{idx + 1}</p>
                    <p className="font-semibold text-slate-800">{ans.prompt}</p>
                    <p className="mt-2 text-sm">
                      <span className="text-slate-500">Answer: </span>
                      {ans.selected_options.map((o) => o.label).join(", ") || "—"}
                    </p>
                    <p className="text-sm">
                      <span className="text-slate-500">Correct: </span>
                      <span className="font-medium text-green-700">
                        {ans.correct_options.map((o) => o.label).join(", ")}
                      </span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <CvToast
        show={toast.show}
        type={toast.type}
        message={toast.message}
        title={toast.type === "success" ? "Success" : "Alert"}
        onClose={() => setToast({ ...toast, show: false })}
      />
    </div>
  );
};

export default QuizResponses;
