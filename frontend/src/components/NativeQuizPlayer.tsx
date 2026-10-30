import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import API_BASE_URL from "../config";
import {
  ArrowLeft,
  Check,
  CheckCircle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Eye,
  RotateCcw,
  XCircle,
} from "lucide-react";

type QuizOption = {
  id: number;
  label: string;
  match_side?: string | null;
};

type QuizQuestion = {
  id: number;
  prompt: string;
  question_type: "single" | "true_false" | "multi" | "matching";
  points: number;
  options: QuizOption[];
};

type ReviewRow = {
  question_id: number;
  prompt: string;
  question_type: string;
  points: number;
  points_awarded: number;
  is_correct: boolean;
  selected_options: { id: number; label: string }[];
  correct_options: { id: number; label: string }[];
};

type SubmitResult = {
  attempt_id: number;
  score: number;
  max_score: number;
  percent: number;
  best_percent: number;
  pass_percent: number;
  passed: boolean;
  lesson_completed: boolean;
  certificate_issued?: boolean;
  review: ReviewRow[];
};

type Props = {
  lessonId?: number;
  quizId?: number;
  lessonTitle: string;
  onBack: () => void;
  onCompleted?: (payload: { certificate_issued?: boolean }) => void;
};

type Phase = "loading" | "start" | "taking" | "results" | "error";

const NativeQuizPlayer = ({ lessonId, quizId, lessonTitle, onBack, onCompleted }: Props) => {
  const mode = quizId != null ? "bank" : "lesson";
  const shellRef = useRef<HTMLDivElement>(null);
  const allowFsExitRef = useRef(false);
  const phaseRef = useRef<Phase>("loading");

  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [description, setDescription] = useState("");
  const [topicTitle, setTopicTitle] = useState(lessonTitle);
  const [passPercent, setPassPercent] = useState(70);
  const [attemptCount, setAttemptCount] = useState(0);
  const [maxAttempts, setMaxAttempts] = useState<number | null>(null);
  const [attemptsRemaining, setAttemptsRemaining] = useState<number | null>(null);
  const [canAttempt, setCanAttempt] = useState(true);
  const [bestPercent, setBestPercent] = useState<number | null>(null);
  const [passedBefore, setPassedBefore] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [matchAnswers, setMatchAnswers] = useState<Record<number, Record<number, number>>>({});
  const [qIndex, setQIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);
  const [exitModal, setExitModal] = useState<"back" | "fullscreen" | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showAnswers, setShowAnswers] = useState(false);

  phaseRef.current = phase;

  const token = () => localStorage.getItem("token");

  const takeUrl = useMemo(() => {
    if (mode === "bank") return `${API_BASE_URL}/quizzes/${quizId}/take`;
    return `${API_BASE_URL}/content/${lessonId}/quiz/take`;
  }, [mode, quizId, lessonId]);

  const attemptsUrl = useMemo(() => {
    if (mode === "bank") return `${API_BASE_URL}/quizzes/${quizId}/my-attempts`;
    return `${API_BASE_URL}/content/${lessonId}/quiz/my-attempts`;
  }, [mode, quizId, lessonId]);

  const submitUrl = useMemo(() => {
    if (mode === "bank") return `${API_BASE_URL}/quizzes/${quizId}/submit`;
    return `${API_BASE_URL}/content/${lessonId}/quiz/submit`;
  }, [mode, quizId, lessonId]);

  const exitFullscreen = useCallback(async () => {
    allowFsExitRef.current = true;
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
    } catch {
      /* ignore */
    }
    allowFsExitRef.current = false;
  }, []);

  const enterFullscreen = useCallback(async () => {
    const el = shellRef.current;
    if (!el) return;
    try {
      if (!document.fullscreenElement) await el.requestFullscreen();
    } catch {
      /* browser may block — quiz still usable */
    }
  }, []);

  const loadMeta = useCallback(async () => {
    if (mode === "bank" && quizId == null) return;
    if (mode === "lesson" && lessonId == null) return;
    setPhase("loading");
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token()}` };
      const [takeRes, attemptsRes] = await Promise.all([
        axios.get(takeUrl, { headers }),
        axios.get(attemptsUrl, { headers }),
      ]);
      setQuestions(takeRes.data.questions || []);
      setDescription(String(takeRes.data.description || "").trim());
      setTopicTitle(String(takeRes.data.title || lessonTitle || "Quiz"));
      setPassPercent(takeRes.data.pass_percent ?? attemptsRes.data.pass_percent ?? 70);
      const count = attemptsRes.data.attempt_count || takeRes.data.attempt_count || 0;
      setAttemptCount(count);
      const maxA =
        takeRes.data.max_attempts ?? attemptsRes.data.max_attempts ?? null;
      const maxNorm = maxA != null && Number(maxA) > 0 ? Number(maxA) : null;
      setMaxAttempts(maxNorm);
      const remaining =
        takeRes.data.attempts_remaining ??
        attemptsRes.data.attempts_remaining ??
        (maxNorm == null ? null : Math.max(0, maxNorm - count));
      setAttemptsRemaining(remaining);
      const allowed =
        takeRes.data.can_attempt ??
        attemptsRes.data.can_attempt ??
        (remaining == null || remaining > 0);
      setCanAttempt(Boolean(allowed));
      setBestPercent(
        attemptsRes.data.best_percent === undefined || attemptsRes.data.best_percent === null
          ? null
          : attemptsRes.data.best_percent
      );
      setPassedBefore(Boolean(attemptsRes.data.passed));
      setPhase("start");
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Could not load quiz.");
      setPhase("error");
    }
  }, [takeUrl, attemptsUrl, mode, quizId, lessonId, lessonTitle]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      if (document.fullscreenElement) return;
      if (allowFsExitRef.current) return;
      if (phaseRef.current === "taking") {
        setExitModal("fullscreen");
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  const isAnswered = useCallback(
    (q: QuizQuestion) => {
      if (q.question_type === "matching") {
        const lefts = q.options.filter((o) => (o.match_side || "").toLowerCase() === "left");
        const mmap = matchAnswers[q.id] || {};
        return lefts.length > 0 && lefts.every((l) => Boolean(mmap[l.id]));
      }
      return (answers[q.id] || []).length > 0;
    },
    [answers, matchAnswers]
  );

  const answeredCount = useMemo(
    () => questions.filter((q) => isAnswered(q)).length,
    [questions, isAnswered]
  );
  const blankCount = questions.length - answeredCount;

  const startQuiz = async () => {
    if (!canAttempt) return;
    setAnswers({});
    setMatchAnswers({});
    setQIndex(0);
    setResult(null);
    setShowAnswers(false);
    setError("");
    setExitModal(null);
    setPhase("taking");
    await enterFullscreen();
  };

  const leaveToStart = async () => {
    setExitModal(null);
    setShowAnswers(false);
    setResult(null);
    await exitFullscreen();
    setPhase("start");
  };

  const confirmExit = async () => {
    const reason = exitModal;
    setExitModal(null);
    await exitFullscreen();
    if (reason === "back") {
      onBack();
      return;
    }
    if (reason === "fullscreen") {
      setPhase("start");
    }
  };

  const cancelExit = async () => {
    setExitModal(null);
    if (phaseRef.current === "taking") await enterFullscreen();
  };

  const requestLeave = () => {
    if (phase === "taking") {
      // Keep modal inside the fullscreen shell (portals to body are invisible in FS)
      setExitModal("back");
      return;
    }
    void exitFullscreen().then(() => onBack());
  };

  const toggleOption = (question: QuizQuestion, optionId: number) => {
    setAnswers((prev) => {
      const current = prev[question.id] || [];
      if (question.question_type === "multi") {
        const next = current.includes(optionId)
          ? current.filter((id) => id !== optionId)
          : [...current, optionId];
        return { ...prev, [question.id]: next };
      }
      return { ...prev, [question.id]: [optionId] };
    });
  };

  const setMatch = (questionId: number, leftId: number, rightId: number) => {
    setMatchAnswers((prev) => ({
      ...prev,
      [questionId]: { ...(prev[questionId] || {}), [leftId]: rightId },
    }));
  };

  const submitQuiz = async () => {
    setSubmitting(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token()}` };
      const payload = {
        answers: questions.map((q) => {
          if (q.question_type === "matching") {
            const mmap = matchAnswers[q.id] || {};
            return {
              question_id: q.id,
              selected_option_ids: [],
              match_map: Object.fromEntries(
                Object.entries(mmap).map(([left, right]) => [String(left), right])
              ),
            };
          }
          return {
            question_id: q.id,
            selected_option_ids: answers[q.id] || [],
          };
        }),
      };
      const res = await axios.post(submitUrl, payload, { headers });
      const data = res.data as SubmitResult;
      setResult(data);
      setBestPercent(data.best_percent);
      setAttemptCount((c) => {
        const next = c + 1;
        if (maxAttempts != null) {
          setAttemptsRemaining(Math.max(0, maxAttempts - next));
          setCanAttempt(next < maxAttempts);
        }
        return next;
      });
      setPassedBefore(data.best_percent >= data.pass_percent);
      await exitFullscreen();
      setPhase("results");
      if (data.lesson_completed) {
        onCompleted?.({ certificate_issued: data.certificate_issued });
      }
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Submit failed.");
    } finally {
      setSubmitting(false);
    }
  };

  const attemptLabel =
    maxAttempts == null
      ? "Unlimited attempts"
      : `${Math.max(0, attemptsRemaining ?? maxAttempts - attemptCount)} of ${maxAttempts} remaining`;

  const topBar = (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <button
        type="button"
        onClick={requestLeave}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <ArrowLeft size={18} />
        <span>Back</span>
      </button>
      <h1 className="min-w-0 flex-1 truncate text-center text-sm font-bold text-slate-800 sm:text-base">
        {topicTitle || lessonTitle}
      </h1>
      <div className="w-[4.5rem] sm:w-16" aria-hidden />
    </header>
  );

  const exitDialog = exitModal ? (
    <div className="absolute inset-0 z-[10000] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl">
        <h3 className="text-sm font-bold text-slate-900">Leave quiz?</h3>
        <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
          {exitModal === "fullscreen"
            ? "You left fullscreen. Click OK to return to instructions, or Cancel to continue in fullscreen."
            : "Your answers are not submitted until you press Submit. OK will exit the quiz."}
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => void cancelExit()}
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void confirmExit()}
            className="rounded-lg bg-[#005EB8] px-3 py-1.5 text-xs font-bold text-white"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  ) : null;

  if (phase === "loading") {
    return (
      <div ref={shellRef} className="fixed inset-0 z-[200] flex flex-col bg-white">
        {topBar}
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-400">
          <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#005EB8] border-t-transparent" />
          <p className="text-sm font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div ref={shellRef} className="fixed inset-0 z-[200] flex flex-col bg-white">
        {topBar}
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <XCircle className="text-red-500" size={36} />
          <p className="max-w-sm text-base font-medium text-slate-700">{error || "Something went wrong"}</p>
          <button
            type="button"
            onClick={() => void loadMeta()}
            className="rounded-lg bg-[#005EB8] px-5 py-2.5 text-sm font-semibold text-white"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (phase === "start") {
    return (
      <div ref={shellRef} className="fixed inset-0 z-[200] flex flex-col bg-slate-50">
        {topBar}
        <div className="flex flex-1 items-start justify-center overflow-y-auto px-3 py-3 sm:px-5 sm:py-4">
          <div className="my-auto w-full max-w-lg rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
            <p className="mb-0.5 text-[10px] font-bold uppercase tracking-wider text-[#005EB8]">
              Quiz instructions
            </p>
            <h2 className="mb-1.5 break-words text-base font-extrabold leading-snug tracking-tight text-slate-900 sm:text-lg">
              {topicTitle || lessonTitle}
            </h2>
            {description ? (
              <p className="mb-3 max-h-20 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                {description}
              </p>
            ) : (
              <p className="mb-3 text-xs text-slate-500">Read the rules below, then start when you are ready.</p>
            )}

            <div className="mb-3 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Questions</p>
                <p className="text-sm font-bold text-slate-800">{questions.length}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Pass mark</p>
                <p className="text-sm font-bold text-slate-800">{passPercent}%</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Attempts</p>
                <p className="text-sm font-bold text-slate-800">{maxAttempts == null ? "∞" : maxAttempts}</p>
              </div>
              <div className="rounded-lg bg-slate-50 px-2 py-1.5">
                <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-400">Best score</p>
                <p className={`text-sm font-bold ${passedBefore ? "text-green-600" : "text-slate-800"}`}>
                  {bestPercent == null ? "—" : `${bestPercent}%`}
                </p>
              </div>
            </div>

            <div className="mb-3 rounded-lg border border-slate-200 bg-white p-2.5">
              <p className="mb-1 text-[10px] font-bold uppercase tracking-wide text-slate-500">Before you begin</p>
              <ul className="list-disc space-y-0.5 pl-4 text-[11px] leading-snug text-slate-600">
                <li>The quiz opens in fullscreen. Stay in fullscreen until you submit.</li>
                <li>Use the question number grid to jump between questions.</li>
                <li>Answered = green; unanswered = blank. Review before submit.</li>
                <li>Leaving fullscreen or Back needs confirmation (OK).</li>
                <li>Best score counts toward the pass mark ({passPercent}%).</li>
                <li>
                  Attempts: <span className="font-semibold text-slate-800">{attemptLabel}</span>
                  {attemptCount > 0 ? ` · ${attemptCount} used` : null}
                </li>
              </ul>
            </div>

            {questions.length === 0 ? (
              <p className="text-xs text-slate-400">No questions yet.</p>
            ) : !canAttempt ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                Maximum attempts reached. You cannot take this quiz again.
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void startQuiz()}
                className="inline-flex w-full items-center justify-center rounded-lg bg-[#005EB8] py-2 text-sm font-bold text-white transition hover:bg-blue-700"
              >
                {attemptCount > 0 ? "Retake quiz" : "Start quiz"}
              </button>
            )}
          </div>
        </div>
        {exitDialog}
      </div>
    );
  }

  if (phase === "results" && result) {
    const canRetake = maxAttempts == null || (attemptsRemaining != null && attemptsRemaining > 0) || canAttempt;
    const correctCount = result.review.filter((r) => r.is_correct).length;
    const totalQuestions = result.review.length;
    const attendedCount = result.review.filter((r) => r.selected_options.length > 0).length;
    const quizAttemptsLeft =
      maxAttempts == null ? null : Math.max(0, attemptsRemaining ?? maxAttempts - attemptCount);
    return (
      <div ref={shellRef} className="fixed inset-0 z-[200] flex flex-col bg-slate-50">
        {topBar}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-xl px-4 py-6 sm:py-8">
            <p className="mb-1 text-center text-[10px] font-bold uppercase tracking-wider text-[#005EB8]">
              Score dashboard
            </p>
            <h2 className="mb-5 text-center text-lg font-extrabold text-slate-900 sm:text-xl">
              {topicTitle || lessonTitle}
            </h2>

            <div className="mb-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Score</p>
                <p className="mt-1 text-4xl font-bold tracking-tight text-slate-900">{result.percent}%</p>
                <p
                  className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    result.passed ? "bg-green-50 text-green-700" : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {result.passed ? "Passed" : "Not passed"}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2.5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Attended</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">
                    {attendedCount}/{totalQuestions}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2.5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Pass %</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">{result.pass_percent}%</p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2.5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Obtained</p>
                  <p className="mt-0.5 text-sm font-bold text-[#005EB8]">
                    {result.score}/{result.max_score}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2.5 text-center">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Correct</p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">
                    {correctCount}/{totalQuestions}
                  </p>
                </div>
                <div className="col-span-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-2.5 text-center sm:col-span-2">
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                    Quiz attempts
                  </p>
                  <p className="mt-0.5 text-sm font-bold text-slate-800">
                    {maxAttempts == null
                      ? `${attemptCount} used · Unlimited`
                      : `${attemptCount} / ${maxAttempts} used · ${quizAttemptsLeft} left`}
                  </p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3 text-[11px] text-slate-500">
                <span>Best: {result.best_percent}%</span>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap justify-center gap-2">
              <button
                type="button"
                onClick={() => setShowAnswers((v) => !v)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-[#005EB8] px-3 py-1.5 text-xs font-semibold text-white"
              >
                <Eye size={12} />
                {showAnswers ? "Hide answers" : "View answers"}
                {showAnswers ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              </button>
              {canRetake && (
                <button
                  type="button"
                  onClick={() => void leaveToStart()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <RotateCcw size={12} /> Retake
                </button>
              )}
              <button
                type="button"
                onClick={() => void exitFullscreen().then(() => onBack())}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Exit quiz
              </button>
            </div>

            {showAnswers && (
              <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Questions & answers
                </p>
                <div className="space-y-2">
                  {result.review.map((row, idx) => (
                    <div key={row.question_id} className="border-b border-slate-100 py-2.5 last:border-0">
                      <div className="flex items-start gap-1.5">
                        {row.is_correct ? (
                          <CheckCircle className="mt-0.5 shrink-0 text-green-600" size={14} />
                        ) : (
                          <XCircle className="mt-0.5 shrink-0 text-red-500" size={14} />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] text-slate-400">
                            Q{idx + 1} · {row.points_awarded}/{row.points} pts
                          </p>
                          <p className="text-sm font-medium text-slate-800">{row.prompt}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            Your answer:{" "}
                            <span className="text-slate-800">
                              {row.selected_options.length
                                ? row.selected_options.map((o) => o.label).join("; ")
                                : "—"}
                            </span>
                          </p>
                          {!row.is_correct && (
                            <p className="mt-0.5 text-xs text-green-700">
                              Correct: {row.correct_options.map((o) => o.label).join("; ")}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
        {exitDialog}
      </div>
    );
  }

  const current = questions[qIndex];
  const selected = current ? answers[current.id] || [] : [];
  const progressPct = questions.length ? (answeredCount / questions.length) * 100 : 0;
  const leftOpts =
    current?.question_type === "matching"
      ? current.options.filter((o) => (o.match_side || "").toLowerCase() === "left")
      : [];
  const rightOpts =
    current?.question_type === "matching"
      ? current.options.filter((o) => (o.match_side || "").toLowerCase() === "right")
      : [];
  const currentMatches = current ? matchAnswers[current.id] || {} : {};

  const hint =
    current?.question_type === "multi"
      ? "Select all that apply"
      : current?.question_type === "true_false"
        ? "True or False"
        : current?.question_type === "matching"
          ? "Match each left item"
          : "Choose one";

  return (
    <div ref={shellRef} className="fixed inset-0 z-[200] flex bg-slate-100">
      {/* Side panel — question grid */}
      <aside
        className={`${
          sidebarOpen ? "w-56 sm:w-64" : "w-0"
        } flex shrink-0 flex-col overflow-hidden border-r border-slate-200 bg-white transition-[width] duration-200`}
      >
        <div className="border-b border-slate-100 px-4 py-3">
          <p className="truncate text-xs font-bold uppercase tracking-wide text-[#005EB8]">Topic</p>
          <p className="mt-0.5 truncate text-sm font-bold text-slate-800" title={topicTitle || lessonTitle}>
            {topicTitle || lessonTitle}
          </p>
        </div>
        <div className="border-b border-slate-100 px-4 py-3 text-xs text-slate-500">
          <div className="flex justify-between gap-2">
            <span>
              Answered <strong className="text-green-700">{answeredCount}</strong>
            </span>
            <span>
              Blank <strong className="text-slate-700">{blankCount}</strong>
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-[#005EB8] transition-all" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-wider text-slate-400">Questions</p>
          <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
            {questions.map((q, i) => {
              const done = isAnswered(q);
              const active = i === qIndex;
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => setQIndex(i)}
                  className={`flex h-9 items-center justify-center rounded-lg text-xs font-bold transition ${
                    active
                      ? "bg-[#005EB8] text-white ring-2 ring-[#005EB8]/30"
                      : done
                        ? "bg-green-100 text-green-800 hover:bg-green-200"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                  }`}
                  title={done ? `Question ${i + 1} — answered` : `Question ${i + 1} — blank`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
          <div className="mt-4 space-y-1.5 px-1 text-[11px] text-slate-500">
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-[#005EB8]" /> Current
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-green-100 ring-1 ring-green-300" /> Answered
            </div>
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded bg-slate-100 ring-1 ring-slate-300" /> Blank
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-white">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              onClick={() => setSidebarOpen((v) => !v)}
              className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              {sidebarOpen ? "Hide grid" : "Show grid"}
            </button>
            <button
              type="button"
              onClick={requestLeave}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              <ArrowLeft size={16} /> Exit
            </button>
          </div>
          <div className="min-w-0 flex-1 text-center">
            <p className="truncate text-sm font-bold text-slate-800">{topicTitle || lessonTitle}</p>
            <p className="text-[11px] text-slate-400">
              Q{qIndex + 1} of {questions.length} · {hint}
            </p>
          </div>
          <div className="w-[4.5rem]" aria-hidden />
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-6 sm:px-8">
          {current && (
            <div className="mx-auto max-w-2xl pt-6 sm:pt-10">
              <h2 className="mb-8 text-xl font-bold leading-snug text-slate-900 sm:text-2xl">{current.prompt}</h2>

              {current.question_type === "matching" ? (
                <div className="space-y-4">
                  {leftOpts.map((left) => (
                    <div key={left.id} className="rounded-xl border border-slate-200 p-3">
                      <p className="mb-2 text-sm font-semibold text-slate-800">{left.label}</p>
                      <select
                        value={currentMatches[left.id] ?? ""}
                        onChange={(e) => setMatch(current.id, left.id, Number(e.target.value))}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                      >
                        <option value="">Select match…</option>
                        {rightOpts.map((right) => (
                          <option key={right.id} value={right.id}>
                            {right.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {current.options.map((opt) => {
                    const isOn = selected.includes(opt.id);
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => toggleOption(current, opt.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition sm:text-base ${
                          isOn
                            ? "border-[#005EB8] bg-blue-50 text-[#005EB8]"
                            : "border-slate-200 text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center border-2 ${
                            current.question_type === "multi" ? "rounded-md" : "rounded-full"
                          } ${isOn ? "border-[#005EB8] bg-[#005EB8] text-white" : "border-slate-300"}`}
                        >
                          {isOn ? <Check size={12} strokeWidth={3} /> : null}
                        </span>
                        {opt.label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <button
            type="button"
            disabled={qIndex === 0}
            onClick={() => setQIndex((i) => Math.max(0, i - 1))}
            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 disabled:opacity-35"
          >
            <ChevronLeft size={16} /> Prev
          </button>
          <p className="hidden text-xs text-slate-400 sm:block">
            {answeredCount}/{questions.length} answered
          </p>
          {qIndex < questions.length - 1 ? (
            <button
              type="button"
              onClick={() => setQIndex((i) => Math.min(questions.length - 1, i + 1))}
              className="inline-flex items-center gap-1 rounded-xl bg-[#005EB8] px-5 py-2.5 text-sm font-semibold text-white"
            >
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting}
              onClick={() => void submitQuiz()}
              className="rounded-xl bg-[#005EB8] px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          )}
        </div>
        {error && <p className="bg-red-50 px-4 py-2 text-center text-sm text-red-600">{error}</p>}
      </div>
      {exitDialog}
    </div>
  );
};

export default NativeQuizPlayer;
