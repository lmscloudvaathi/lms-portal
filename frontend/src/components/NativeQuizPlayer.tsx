import { useCallback, useEffect, useState } from "react";
import axios from "axios";
import API_BASE_URL from "../config";
import {
  ArrowLeft,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  RotateCcw,
  XCircle,
} from "lucide-react";

type QuizOption = { id: number; label: string };
type QuizQuestion = {
  id: number;
  prompt: string;
  question_type: "single" | "true_false" | "multi";
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
  lessonId: number;
  lessonTitle: string;
  onBack: () => void;
  onCompleted?: (payload: { certificate_issued?: boolean }) => void;
};

type Phase = "loading" | "start" | "taking" | "results" | "error";

const NativeQuizPlayer = ({ lessonId, lessonTitle, onBack, onCompleted }: Props) => {
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [passPercent, setPassPercent] = useState(70);
  const [duration, setDuration] = useState<number | null>(null);
  const [attemptCount, setAttemptCount] = useState(0);
  const [bestPercent, setBestPercent] = useState<number | null>(null);
  const [passedBefore, setPassedBefore] = useState(false);
  const [answers, setAnswers] = useState<Record<number, number[]>>({});
  const [qIndex, setQIndex] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<SubmitResult | null>(null);

  const token = () => localStorage.getItem("token");

  const loadMeta = useCallback(async () => {
    setPhase("loading");
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token()}` };
      const [takeRes, attemptsRes] = await Promise.all([
        axios.get(`${API_BASE_URL}/content/${lessonId}/quiz/take`, { headers }),
        axios.get(`${API_BASE_URL}/content/${lessonId}/quiz/my-attempts`, { headers }),
      ]);
      setQuestions(takeRes.data.questions || []);
      setPassPercent(takeRes.data.pass_percent ?? 70);
      setDuration(takeRes.data.duration ?? null);
      setAttemptCount(attemptsRes.data.attempt_count || 0);
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
  }, [lessonId]);

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

  const startQuiz = () => {
    setAnswers({});
    setQIndex(0);
    setResult(null);
    setError("");
    setPhase("taking");
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

  const submitQuiz = async () => {
    setSubmitting(true);
    setError("");
    try {
      const headers = { Authorization: `Bearer ${token()}` };
      const payload = {
        answers: questions.map((q) => ({
          question_id: q.id,
          selected_option_ids: answers[q.id] || [],
        })),
      };
      const res = await axios.post(`${API_BASE_URL}/content/${lessonId}/quiz/submit`, payload, { headers });
      const data = res.data as SubmitResult;
      setResult(data);
      setBestPercent(data.best_percent);
      setAttemptCount((c) => c + 1);
      setPassedBefore(data.best_percent >= data.pass_percent);
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

  const topBar = (
    <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
      <button
        type="button"
        onClick={onBack}
        className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
      >
        <ArrowLeft size={18} />
        <span>Back</span>
      </button>
      <h1 className="min-w-0 flex-1 truncate text-center text-sm font-bold text-slate-800 sm:text-base">
        {lessonTitle}
      </h1>
      <div className="w-[4.5rem] sm:w-16" aria-hidden />
    </header>
  );

  if (phase === "loading") {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col bg-white">
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
      <div className="fixed inset-0 z-[200] flex flex-col bg-white">
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
      <div className="fixed inset-0 z-[200] flex flex-col bg-white">
        {topBar}
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-5 py-10">
          <div className="w-full max-w-md text-center">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Quiz</p>
            <h2 className="mb-8 text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">{lessonTitle}</h2>

            <div className="mb-10 grid grid-cols-2 gap-3 text-left sm:grid-cols-3">
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-400">Questions</p>
                <p className="text-lg font-bold text-slate-800">{questions.length}</p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3">
                <p className="text-xs text-slate-400">Pass mark</p>
                <p className="text-lg font-bold text-slate-800">{passPercent}%</p>
              </div>
              <div className="col-span-2 rounded-xl bg-slate-50 px-4 py-3 sm:col-span-1">
                <p className="text-xs text-slate-400">Best score</p>
                <p className={`text-lg font-bold ${passedBefore ? "text-green-600" : "text-slate-800"}`}>
                  {bestPercent == null ? "—" : `${bestPercent}%`}
                </p>
              </div>
            </div>

            {duration != null && (
              <p className="mb-6 text-sm text-slate-500">Suggested time: {duration} min</p>
            )}

            {questions.length === 0 ? (
              <p className="text-sm text-slate-400">No questions yet.</p>
            ) : (
              <button
                type="button"
                onClick={startQuiz}
                className="w-full rounded-xl bg-[#005EB8] py-3.5 text-base font-semibold text-white transition hover:bg-blue-700"
              >
                {attemptCount > 0 ? "Retake quiz" : "Start quiz"}
              </button>
            )}

            {attemptCount > 0 && (
              <p className="mt-4 text-xs text-slate-400">
                {attemptCount} attempt{attemptCount === 1 ? "" : "s"} so far · best score counts
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (phase === "results" && result) {
    return (
      <div className="fixed inset-0 z-[200] flex flex-col bg-white">
        {topBar}
        <div className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-2xl px-5 py-10">
            <div className="mb-10 text-center">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">Your score</p>
              <p className="text-5xl font-bold tracking-tight text-slate-900">{result.percent}%</p>
              <p className="mt-2 text-sm text-slate-500">
                {result.score} of {result.max_score} correct
              </p>
              <p
                className={`mt-4 inline-block text-sm font-semibold ${
                  result.passed ? "text-green-600" : "text-amber-600"
                }`}
              >
                {result.passed ? "Passed" : `Need ${result.pass_percent}% to pass`}
              </p>
            </div>

            <div className="mb-8 flex flex-wrap justify-center gap-3">
              <button
                type="button"
                onClick={startQuiz}
                className="inline-flex items-center gap-2 rounded-xl bg-[#005EB8] px-5 py-2.5 text-sm font-semibold text-white"
              >
                <RotateCcw size={16} /> Retake
              </button>
              <button
                type="button"
                onClick={onBack}
                className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Exit quiz
              </button>
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Review</p>
              {result.review.map((row, idx) => (
                <div key={row.question_id} className="border-b border-slate-100 py-4 last:border-0">
                  <div className="mb-2 flex items-start gap-2">
                    {row.is_correct ? (
                      <CheckCircle className="mt-0.5 shrink-0 text-green-600" size={18} />
                    ) : (
                      <XCircle className="mt-0.5 shrink-0 text-red-500" size={18} />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-slate-400">Q{idx + 1}</p>
                      <p className="font-medium text-slate-800">{row.prompt}</p>
                      <p className="mt-2 text-sm text-slate-500">
                        Your answer:{" "}
                        <span className="text-slate-800">
                          {row.selected_options.length
                            ? row.selected_options.map((o) => o.label).join(", ")
                            : "—"}
                        </span>
                      </p>
                      {!row.is_correct && (
                        <p className="mt-1 text-sm text-green-700">
                          Correct: {row.correct_options.map((o) => o.label).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  const current = questions[qIndex];
  const selected = current ? answers[current.id] || [] : [];
  const progressPct = questions.length ? ((qIndex + 1) / questions.length) * 100 : 0;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-white">
      {topBar}
      <div className="h-1 w-full bg-slate-100">
        <div className="h-full bg-[#005EB8] transition-all" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="flex items-center justify-between px-5 py-3 text-sm text-slate-500">
        <span>
          Question {qIndex + 1} of {questions.length}
        </span>
        <span className="text-xs">
          {current?.question_type === "multi"
            ? "Select all that apply"
            : current?.question_type === "true_false"
              ? "True or False"
              : "Choose one"}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-6">
        {current && (
          <div className="mx-auto max-w-xl pt-4 sm:pt-8">
            <h2 className="mb-8 text-xl font-bold leading-snug text-slate-900 sm:text-2xl">
              {current.prompt}
            </h2>
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
  );
};

export default NativeQuizPlayer;
