import { useState, useEffect, useRef, useMemo, useCallback, type ReactNode } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import API_BASE_URL, { resolveMediaUrl } from './config';
import { runTestCasesLocally } from './utils/pyodideEnv';
import {
    LayoutDashboard, BookOpen, Compass, Award, LogOut,
    CheckCircle, AlertTriangle, X,
    Code, Play, Monitor, ChevronRight, Cloud, Flag,
    Menu, Sparkles, User, PlayCircle, Trophy, Lock, BellRing, Trash2, Download, Clock, ExternalLink
} from "lucide-react";
import { motion } from "framer-motion";

// ✅ AI IMPORTS 
import * as tf from "@tensorflow/tfjs";
import * as blazeface from "@tensorflow-models/blazeface";

import "@tensorflow/tfjs-backend-webgl";
import BrandLogo from "./components/BrandLogo";
import ProfileMenu from "./components/ProfileMenu";
import Modal, { forceUnlockBodyScroll } from "./components/Modal";
import CvToast, { ToastPortal } from "./components/CvToast";
import { useEdgeSwipe } from "./hooks/useEdgeSwipe";
import { CODE_TEMPLATES } from './utils/codeTemplates';
import { clearSession, getValidSession, isStudentSession } from "./utils/session";
import { categoryLabel, groupCoursesByCategory, resolveCourseCategory, type CourseCategoryId } from "./utils/courseCategories";
import { certificateVerifyPath, downloadCertificatePdf } from "./utils/certificates";
import { loadRazorpayScript } from "./utils/loadRazorpay";
import { loadJetBrainsMonoFont } from "./utils/loadFonts";

// --- TYPES ---
interface Course {
    id: number;
    title: string;
    description: string;
    price: number;
    image_url: string;
    instructor_id: number;
    // ✅ Updated Fields
    course_type?: string; // "standard" | "coding"
    category?: string;
    language?: string;
    enrollment_type?: "paid" | "trial";
    days_left?: number;
    is_trial_expired?: boolean;
    has_certificate?: boolean;
    certificate_id?: string | null;
}

interface CodeTest { id: number; title: string; time_limit: number; problems: any[]; completed?: boolean; }

// --- 🟢 HELPER COMPONENTS ---

const SideNavItem = ({
    icon,
    label,
    active,
    onClick,
}: {
    icon: ReactNode;
    label: string;
    active: boolean;
    onClick: () => void;
}) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-xl px-3.5 py-3 text-left text-[15px] font-bold transition-all ${
            active
                ? "bg-input text-primary shadow-sm"
                : "text-muted-foreground hover:bg-white/5 hover:text-foreground"
        }`}
    >
        <span className="shrink-0">{icon}</span>
        <span className="truncate">{label}</span>
    </button>
);

const NavItem = ({ icon, label, active, onClick }: any) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all text-sm font-bold ${active
            ? "bg-secondary text-primary"
            : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
            }`}
    >
        {icon} {label}
    </button>
);

const StatCard = ({ icon: Icon, label, value }: any) => (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} whileHover={{ y: -4, boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)" }} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-5 transition-all">
        <div className="p-3 rounded-xl bg-slate-100 text-slate-600"><Icon size={24} /></div>
        <div><h4 className="text-3xl font-extrabold text-slate-800 tracking-tight">{value}</h4><p className="text-slate-500 text-xs font-bold uppercase tracking-wider mt-1">{label}</p></div>
    </motion.div>
);

type CourseProgress = { percent: number; completed: number; total: number };

const CourseProgressVisual = ({ progress }: { progress?: CourseProgress }) => {
    const percent = Math.max(0, Math.min(100, Number(progress?.percent) || 0));
    const completed = Number(progress?.completed) || 0;
    const total = Number(progress?.total) || 0;
    const done = percent >= 100 && total > 0;
    const fill = done ? "#87C232" : "#005EB8";
    const status = total === 0 ? "Not started" : done ? "Completed" : "In progress";

    return (
        <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
                <span className={`text-[11px] font-bold uppercase tracking-wide ${done ? "text-[#87C232]" : "text-slate-500"}`}>
                    {status}
                </span>
                <span className="text-xs font-extrabold text-slate-800 tabular-nums">{percent}%</span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
                <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${percent}%`, background: fill }}
                />
            </div>
            <div className="mt-1.5">
                <span className="text-[11px] text-slate-400 font-medium">
                    {total > 0 ? `${completed} of ${total} lessons` : "Lessons will appear here"}
                </span>
            </div>
        </div>
    );
};

const CourseProgressRing = ({ percent }: { percent: number }) => {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    const size = 46;
    const stroke = 3.5;
    const radius = (size - stroke) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;
    const done = value >= 100;

    return (
        <div className="absolute bottom-2 right-2 bg-white/95 rounded-full shadow-sm p-0.5" title={`${value}% complete`}>
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
                <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-slate-800 tabular-nums">
                    {value}%
                </span>
            </div>
        </div>
    );
};

const formatStudentCourseAmount = (price: unknown): string | null => {
    if (!isStudentSession()) return null;
    if (price === null || price === undefined || price === "") return null;
    const amount = Number(price);
    if (!Number.isFinite(amount)) return null;
    return amount === 0 ? "Free" : `₹${amount}`;
};

const CourseCard = ({ course, type, navigate, handleFreeEnroll, openEnrollModal, handleDownloadSyllabus, onPayClick, progress }: any) => {
    const getImageUrl = (url: string) => resolveMediaUrl(url);

    return (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all relative group">

            {/* ✅ 1. COMPLETED RIBBON */}
            {course.has_certificate && (
                <div className="absolute top-4 -right-12 bg-yellow-400 text-yellow-900 text-[10px] font-extrabold px-12 py-1 rotate-45 z-20 shadow-md">
                    COMPLETED
                </div>
            )}

            <div
                className={`h-40 bg-slate-200 relative flex items-center justify-center ${type === "enrolled" && !course.is_trial_expired ? "cursor-pointer" : ""}`}
                onClick={() => { if (type === "enrolled" && !course.is_trial_expired) navigate(`/course/${course.id}`); }}
            >
                {course.image_url ? (
                    <img src={getImageUrl(course.image_url)} alt={course.title} className="w-full h-full object-cover" />
                ) : (
                    <BookOpen size={40} className="text-slate-400" />
                )}

                {/* Status Badges */}
                {type === "enrolled" && (
                    <div className="absolute top-2 left-2 flex gap-2">
                        {course.enrollment_type === "paid" ? (
                            <div className="bg-green-600 text-white px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm">
                                <CheckCircle size={10} /> PAID
                            </div>
                        ) : (
                            <div className={`px-2 py-1 rounded-md text-[10px] font-bold flex items-center gap-1 shadow-sm ${course.is_trial_expired ? "bg-red-600 text-white" : "bg-orange-500 text-white"}`}>
                                <Clock size={10} /> {course.is_trial_expired ? "TRIAL ENDED" : `${course.days_left} DAYS LEFT`}
                            </div>
                        )}
                    </div>
                )}
                {type === "enrolled" && !course.is_trial_expired && (
                    <CourseProgressRing percent={progress?.percent ?? 0} />
                )}
            </div>

            <div className="p-5">
                <span className="inline-block mb-2 px-2.5 py-0.5 rounded-full bg-blue-50 text-[#005EB8] text-[10px] font-extrabold uppercase tracking-wide">
                    {categoryLabel(resolveCourseCategory(course))}
                </span>
                <h4
                    className={`font-bold text-slate-800 mb-3 truncate ${type === "enrolled" && !course.is_trial_expired ? "cursor-pointer hover:text-[#005EB8]" : ""}`}
                    title={course.title}
                    onClick={() => { if (type === "enrolled" && !course.is_trial_expired) navigate(`/course/${course.id}`); }}
                >{course.title}</h4>
                {type === "enrolled" && <CourseProgressVisual progress={progress} />}

                <div className="flex justify-between items-center">
                    {/* Course fee is visible only after a student logs in */}
                    {type === "enrolled" ? (
                        <div className="flex items-center gap-2">
                            {course.enrollment_type === "trial" ? (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onPayClick(course); }}
                                    className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-200 transition-colors border border-green-200 animate-pulse"
                                >
                                    {(() => {
                                        const amount = formatStudentCourseAmount(course.price);
                                        return amount ? `Pay ${amount}` : "Pay & Unlock";
                                    })()}
                                </button>
                            ) : (
                                <span className="text-sm font-bold text-slate-400">Lifetime Access</span>
                            )}
                        </div>
                    ) : (
                        <span className={`text-lg font-extrabold ${course.price === 0 ? "text-[#87C232]" : "text-[#005EB8]"}`}>
                            {formatStudentCourseAmount(course.price) ?? ""}
                        </span>
                    )}

                    {/* ✅ 3. ACTION BUTTONS */}
                    {type === "available" ? (
                        <button onClick={() => course.price === 0 ? handleFreeEnroll(course.id) : openEnrollModal(course)} className={`px-4 py-2 rounded-lg text-white font-bold text-sm flex items-center gap-2 ${course.price === 0 ? "bg-[#87C232]" : "bg-[#005EB8]"}`}>
                            {course.price === 0 ? <Sparkles size={14} /> : <Lock size={14} />} {course.price === 0 ? "Enroll" : "Unlock"}
                        </button>
                    ) : (
                        <div className="flex gap-2">
                            <button
                                onClick={(e) => { e.stopPropagation(); handleDownloadSyllabus(course.description); }}
                                className="bg-white border border-slate-300 text-slate-600 p-2 rounded-lg hover:bg-slate-50 transition-colors"
                                title="Download Syllabus"
                            >
                                <Download size={16} />
                            </button>
                            <button
                                onClick={() => navigate(`/course/${course.id}`)}
                                disabled={course.is_trial_expired}
                                className={`px-3 py-2 rounded-lg font-bold text-sm flex items-center gap-2 border transition-colors ${course.is_trial_expired ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed" : "bg-white border-slate-300 text-slate-700 hover:bg-slate-50"}`}
                                title="Progress dashboard"
                            >
                                <LayoutDashboard size={14} />
                            </button>
                            <button
                                onClick={() => navigate(`/course/${course.id}/player`)}
                                disabled={course.is_trial_expired}
                                className={`px-4 py-2 rounded-lg font-bold text-sm flex items-center gap-2 transition-colors ${course.is_trial_expired ? "bg-slate-300 text-slate-500 cursor-not-allowed" : "bg-slate-800 text-white hover:bg-slate-900"}`}
                            >
                                <PlayCircle size={14} /> {course.is_trial_expired ? "Locked" : "Resume"}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- 🔄 POLL RESULT HELPER (Added Globally) ---
// --- POLLING HELPER REMOVED (execute is synchronous) ---

// --- 🔵 MAIN COMPONENT ---

const StudentDashboard = () => {
    const navigate = useNavigate();
    const RAZORPAY_PAYLINK_URL = import.meta.env.VITE_RAZORPAY_PAYLINK_URL;
    const [activeTab, setActiveTab] = useState("home");

    const switchTab = (tab: string) => {
        forceUnlockBodyScroll();
        setShowModal(false);
        setShowPassKeyModal(null);
        setIsMobileMenuOpen(false);
        setActiveTab(tab);
    };

    // ✅ NEW: Sub-tab for My Learning (Standard vs Coding)
    const [learningSubTab, setLearningSubTab] = useState("standard");
    const [exploreCategory, setExploreCategory] = useState<"all" | CourseCategoryId>("all");

    const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
    const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [progressMap, setProgressMap] = useState<{ [key: number]: { percent: number, completed: number, total: number } }>({});
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [studentProfile, setStudentProfile] = useState({ name: "Loading...", email: "..." });
    const [newPassword, setNewPassword] = useState("");
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    // Modal & Settings
    const [showModal, setShowModal] = useState(false);
    const [selectedCourse, setSelectedCourse] = useState<Course | null>(null);
    const [processing, setProcessing] = useState(false);
    const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({
        show: false, message: "", type: "success"
    });

    // --- CODE ARENA STATES ---
    const [codeTests, setCodeTests] = useState<CodeTest[]>([]);
    const [activeTest, setActiveTest] = useState<CodeTest | null>(null);
    const [passKeyInput, setPassKeyInput] = useState("");
    const [showPassKeyModal, setShowPassKeyModal] = useState<number | null>(null);

    const openMobileMenu = useCallback(() => setIsMobileMenuOpen(true), []);
    const closeMobileMenu = useCallback(() => setIsMobileMenuOpen(false), []);

    useEdgeSwipe({
        enabled: !activeTest,
        open: isMobileMenuOpen,
        onOpen: openMobileMenu,
        onClose: closeMobileMenu,
    });

    useEffect(() => {
        if (!isMobileMenuOpen) return;
        const prev = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prev;
        };
    }, [isMobileMenuOpen]);

    // --- 🛡️ PROCTORING STATES ---
    const [timeLeft, setTimeLeft] = useState(0);
    const [warnings, setWarnings] = useState(0);
    const [faceStatus, setFaceStatus] = useState<"ok" | "missing" | "multiple">("ok");
    const [isFullScreenViolation, setIsFullScreenViolation] = useState(false);

    // Problem & Code State
    const [currentProblemIndex, setCurrentProblemIndex] = useState(0);
    const [solutions, setSolutions] = useState<{ [key: number]: string }>({});
    const [userCode, setUserCode] = useState(CODE_TEMPLATES.python);
    const [language, setLanguage] = useState(71);

    const [consoleOutput, setConsoleOutput] = useState("Ready to execute...");
    const [executionStatus, setExecutionStatus] = useState("idle");
    // ✅ NEW: Strict "Unlock Submit" State
    const [canSubmit, setCanSubmit] = useState(false);

    const activeTestRef = useRef<CodeTest | null>(null);
    const timeLeftRef = useRef(0);
    const passedProblemsRef = useRef<Record<number, boolean>>({});
    const [passedProblems, setPassedProblems] = useState<Record<number, boolean>>({});

    const videoRef = useRef<HTMLVideoElement>(null);
    const proctorStreamRef = useRef<MediaStream | null>(null);

    const stopProctorCamera = useCallback(() => {
        try {
            proctorStreamRef.current?.getTracks().forEach((t) => t.stop());
        } finally {
            proctorStreamRef.current = null;
            const v = videoRef.current;
            if (v?.srcObject) {
                (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
                v.srcObject = null;
            }
        }
    }, []);

    // 🎨 PROFESSIONAL THEME PALETTE
    const brand = {
        cloudBlue: "var(--neon-cyan)", cloudGreen: "var(--neon-cyan)", mainBg: "transparent", cardBg: "var(--surface)", border: "var(--border)", textMain: "var(--foreground)", textLight: "var(--muted-foreground)"
    };

    const languages = [
        { id: 71, name: "Python (3.8.1)", value: "python" },
        { id: 62, name: "Java (OpenJDK 13)", value: "java" },
        { id: 54, name: "C++ (GCC 9.2.0)", value: "cpp" },
        { id: 63, name: "JavaScript (Node.js)", value: "javascript" },
    ];

    activeTestRef.current = activeTest;
    timeLeftRef.current = timeLeft;

    useEffect(() => {
        if (activeTest) loadJetBrainsMonoFont();
    }, [activeTest]);

    // ✅ Toast Helper
    const triggerToast = (message: string, type: "success" | "error" = "success") => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    };
    const getErrorMessage = (err: any, fallback: string) =>
        err?.response?.data?.detail || err?.response?.data?.message || err?.message || fallback;

    // ✅ INITIAL FETCH WITH SAFETY CHECKS
    const fetchProfile = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
            setStudentProfile({
                name: res.data.full_name,
                email: res.data.email
            });
        } catch (e) { console.error("Profile fetch error", e); }
    };

    const fetchNotifications = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/notifications`, { headers: { Authorization: `Bearer ${token}` } });
            setNotifications(res.data);
            setUnreadCount(res.data.filter((n: any) => !n.is_read).length);
        } catch (e) { console.error("Notif error", e); }
    };

    useEffect(() => {
        // Poll every 30s
        fetchNotifications();
        const interval = setInterval(fetchNotifications, 30000);
        return () => clearInterval(interval);
    }, []);

    const fetchData = async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            if (!token) { navigate("/"); return; }

            const config = { headers: { Authorization: `Bearer ${token}` } };

            const [allRes, myRes] = await Promise.all([
                axios.get(`${API_BASE_URL}/courses`, config),
                axios.get(`${API_BASE_URL}/my-courses`, config)
            ]);

            // SAFETY CHECK: Ensure we have arrays
            const allData = Array.isArray(allRes.data) ? allRes.data : [];
            const myData = Array.isArray(myRes.data) ? myRes.data : [];

            const myCourseIds = new Set(myData.map((c: any) => c.id));
            setAvailableCourses(allData.filter((c: any) => !myCourseIds.has(c.id)));
            setEnrolledCourses(myData);
        } catch (err: any) {
            if (err.response?.status === 401) { clearSession(); navigate("/"); }
        } finally {
            setLoading(false);
        }
    };

    const handleUpdatePassword = async () => {
        if (!newPassword) return triggerToast("Please enter a new password", "error");

        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/user/change-password`,
                { new_password: newPassword },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            triggerToast("Password Updated Successfully!", "success");
            setNewPassword(""); // ✅ This uses the setter, fixing your error!
        } catch (err) {
            triggerToast("Failed to update password", "error");
        }
    };

    const fetchCodeTests = async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            const res = await axios.get(`${API_BASE_URL}/code-tests`, { headers: { Authorization: `Bearer ${token}` } });
            setCodeTests(Array.isArray(res.data) ? res.data : []);
        } catch (err) { console.error(err); }
    };

    useEffect(() => {
        const session = getValidSession();
        if (!session) { navigate("/"); return; }
        if (session.role === "instructor") { navigate("/dashboard"); return; }
        fetchData();
        fetchCodeTests();
        fetchProfile();
    }, []);

    useEffect(() => {
        if (enrolledCourses.length === 0) return;
        const lockedProgress: { [key: number]: { percent: number; completed: number; total: number } } = {};
        for (const course of enrolledCourses) {
            if (course.is_trial_expired) {
                lockedProgress[course.id] = { percent: 0, completed: 0, total: 0 };
            } else {
                fetchCourseProgress(course.id);
            }
        }
        if (Object.keys(lockedProgress).length > 0) {
            setProgressMap(prev => ({ ...prev, ...lockedProgress }));
        }
    }, [enrolledCourses]);

    const exploreGroups = useMemo(() => groupCoursesByCategory(availableCourses), [availableCourses]);
    const visibleExploreGroups = useMemo(
        () => exploreCategory === "all" ? exploreGroups : exploreGroups.filter((group) => group.id === exploreCategory),
        [exploreCategory, exploreGroups]
    );

    const fetchCourseProgress = async (courseId: number) => {
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/courses/${courseId}/player`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const modules = res.data?.modules || [];

            // Count items that are explicitly completed OR marked complete by instructor
            const completed = modules.reduce((acc: number, m: any) => acc + m.lessons.filter((l: any) => l.is_completed).length, 0);

            // Calculate total lessons count, not just modules
            const totalLessons = modules.reduce((acc: number, m: any) => acc + m.lessons.length, 0);

            const percent = totalLessons === 0 ? 0 : Math.round((completed / totalLessons) * 100);

            // Save to map using Course ID as key
            setProgressMap(prev => ({
                ...prev,
                [courseId]: { percent, completed, total: totalLessons }
            }));
        } catch (err) {
            if (axios.isAxiosError(err) && err.response?.status === 402) {
                setProgressMap(prev => ({
                    ...prev,
                    [courseId]: { percent: 0, completed: 0, total: 0 }
                }));
                return;
            }
            console.error("Failed to fetch progress", err);
        }
    };

    // 🛡️ MILITARY GRADE PROCTORING LOGIC
    useEffect(() => {
        let aiInterval: ReturnType<typeof setInterval> | undefined;
        let cancelled = false;
        if (activeTest) {
            const savedWarns = localStorage.getItem(`warns_${activeTest.id}`);
            if (savedWarns) setWarnings(parseInt(savedWarns));
            const savedSolutions = localStorage.getItem(`sols_${activeTest.id}`);
            if (savedSolutions) {
                const parsed = JSON.parse(savedSolutions);
                setSolutions(parsed);
                setUserCode(parsed[0] || CODE_TEMPLATES.python);
            } else {
                setUserCode(CODE_TEMPLATES.python);
            }
            const savedPassed = localStorage.getItem(`passed_${activeTest.id}`);
            if (savedPassed) {
                try {
                    const p = JSON.parse(savedPassed) as Record<number, boolean>;
                    passedProblemsRef.current = p;
                    setPassedProblems(p);
                } catch {
                    passedProblemsRef.current = {};
                    setPassedProblems({});
                }
            } else {
                passedProblemsRef.current = {};
                setPassedProblems({});
            }

            const timer = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        void submitTest(false);
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            const triggerViolation = (type: string) => {
                const currentCount = parseInt(localStorage.getItem(`warns_${activeTest.id}`) || "0") + 1;
                localStorage.setItem(`warns_${activeTest.id}`, currentCount.toString());
                setWarnings(currentCount);

                if (currentCount > 2) {
                    submitTest(true);
                    triggerToast(`⛔ TEST TERMINATED: ${type}`, "error");
                }
            };

            const handleFullScreenChange = () => {
                if (!document.fullscreenElement) {
                    setIsFullScreenViolation(true);
                    triggerViolation("Full Screen Exited");
                } else {
                    setIsFullScreenViolation(false);
                }
            };

            const handleVisibilityChange = () => {
                if (document.hidden) triggerViolation("Tab Switch Detected");
            };

            document.addEventListener("fullscreenchange", handleFullScreenChange);
            document.addEventListener("visibilitychange", handleVisibilityChange);

            const setupAI = async () => {
                try {
                    await tf.setBackend("webgl");
                    const loadedModel = await blazeface.load();
                    if (!navigator.mediaDevices?.getUserMedia) {
                        triggerToast("Camera API not available in this browser.", "error");
                        return;
                    }
                    const stream = await navigator.mediaDevices.getUserMedia({
                        video: { facingMode: "user" },
                        audio: false,
                    });
                    if (cancelled) {
                        stream.getTracks().forEach((t) => t.stop());
                        return;
                    }
                    proctorStreamRef.current = stream;

                    let attachAttempts = 0;
                    let faceLoopStarted = false;
                    const attachWhenReady = () => {
                        if (cancelled) {
                            stream.getTracks().forEach((t) => t.stop());
                            return;
                        }
                        const v = videoRef.current;
                        if (v) {
                            v.srcObject = stream;
                            v.onloadeddata = () => {
                                if (cancelled || faceLoopStarted) return;
                                faceLoopStarted = true;
                                aiInterval = setInterval(async () => {
                                    if (cancelled || !videoRef.current || videoRef.current.readyState !== 4) return;
                                    try {
                                        const predictions = await loadedModel.estimateFaces(videoRef.current, false);
                                        if (predictions.length === 0) setFaceStatus("missing");
                                        else if (predictions.length > 1) setFaceStatus("multiple");
                                        else setFaceStatus("ok");
                                    } catch {
                                        /* ignore frame errors */
                                    }
                                }, 1000);
                            };
                            return;
                        }
                        if (++attachAttempts < 45) requestAnimationFrame(attachWhenReady);
                    };
                    attachWhenReady();
                } catch (err) {
                    console.error(err);
                    triggerToast("Could not start the proctoring camera. Check permissions and try again.", "error");
                }
            };
            void setupAI();

            return () => {
                cancelled = true;
                clearInterval(timer);
                if (aiInterval) clearInterval(aiInterval);
                document.removeEventListener("fullscreenchange", handleFullScreenChange);
                document.removeEventListener("visibilitychange", handleVisibilityChange);
                stopProctorCamera();
            };
        }
    }, [activeTest, stopProctorCamera]);

    const handleStartTest = async () => {
        const token = localStorage.getItem("token");
        const testId = showPassKeyModal;
        if (testId == null) return;

        try {
            if (!navigator.mediaDevices?.getUserMedia) {
                triggerToast("Camera is not supported in this browser. You cannot start the test.", "error");
                return;
            }
            await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "user" },
                audio: false,
            }).then((s) => s.getTracks().forEach((t) => t.stop()));
        } catch {
            triggerToast("Camera access is required before the test can begin. Allow the camera and try again.", "error");
            return;
        }

        try {
            const el = document.documentElement;
            if (el.requestFullscreen) {
                await el.requestFullscreen();
            }
        } catch {
            triggerToast("Full screen is required for this test. Please allow full screen and try again.", "error");
            return;
        }

        try {
            const formData = new FormData();
            formData.append("pass_key", passKeyInput);
            const res = await axios.post(`${API_BASE_URL}/code-tests/${testId}/start`, formData, {
                headers: { Authorization: `Bearer ${token}` },
            });
            const prevWarns = localStorage.getItem(`warns_${res.data.id}`);
            if (prevWarns && parseInt(prevWarns) > 2) {
                stopProctorCamera();
                if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
                triggerToast("Test Terminated Previously", "error");
                return;
            }
            setActiveTest(res.data);
            setTimeLeft(res.data.time_limit * 60);
            setCurrentProblemIndex(0);
            setPassedProblems({});
            passedProblemsRef.current = {};
            setShowPassKeyModal(null);
            setWarnings(prevWarns ? parseInt(prevWarns) : 0);
        } catch (err) {
            stopProctorCamera();
            if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
            triggerToast("Invalid Pass Key", "error");
        }
    };

    const returnToFullScreen = async () => {
        try {
            if (document.documentElement.requestFullscreen) {
                await document.documentElement.requestFullscreen();
                setIsFullScreenViolation(false);
            }
        } catch (e) { console.log(e); }
    };

    const handleSave = () => {
        if (!activeTest) return;
        const newSolutions = { ...solutions, [currentProblemIndex]: userCode };
        setSolutions(newSolutions);
        localStorage.setItem(`sols_${activeTest.id}`, JSON.stringify(newSolutions));
        triggerToast("✅ Code Saved!", "success");
    };

    // ✅ UPDATED EXECUTION LOGIC (Batch Mode)
    const handleRunCode = async () => {
        setExecutionStatus("running");
        setConsoleOutput("Processing...");
        setCanSubmit(false); // Reset permission

        const currentProb = activeTest?.problems[currentProblemIndex];
        let allCases: any[] = [];
        try {
            allCases = currentProb ? JSON.parse(currentProb.test_cases) : [];
        } catch (e) { allCases = []; }

        if (allCases.length === 0) {
            setConsoleOutput("⚠️ No test cases found.");
            setExecutionStatus("error");
            return;
        }

        // Dry-run uses only non-hidden cases (official grading still uses full suite on submit)
        const dryRunCases = allCases.filter((c) => !c.hidden);
        const casesForDryRun = dryRunCases.length > 0 ? dryRunCases : allCases;

        // 🟢 CASE 1: PYTHON (Run Locally with Strict Test Cases)
        if (language === 71) {
            setConsoleOutput("🔹 Running Local Tests (Pyodide)...");
            // Use the strict test runner
            const localRes = await runTestCasesLocally(userCode, casesForDryRun);

            if (localRes.success) {
                setExecutionStatus("success");
                setConsoleOutput(localRes.output); // Detailed output from runner
                triggerToast("All Local Tests Passed!", "success");
                setCanSubmit(true); // ✅ Unlock Submit
            } else {
                setExecutionStatus("error");
                setConsoleOutput(`❌ Execution Failed:\n${localRes.error || localRes.output}`);
                triggerToast("Tests Failed", "error");
            }
            return; // Stop here
        }

        if (!activeTest || !currentProb) {
            setExecutionStatus("error");
            setConsoleOutput("⚠️ Missing problem data.");
            return;
        }

        // 🔴 CASE 2: C++ / JAVA (Run on Server — dry run uses server-resolved public cases when possible)
        setConsoleOutput("🚀 specific language test on Server...");

        try {
            const res = await axios.post(`${API_BASE_URL}/execute`,
                {
                    source_code: userCode,
                    language_id: language,
                    test_cases: [],
                    code_test_id: activeTest.id,
                    problem_id: currentProb.id,
                    execution_mode: "dry_run",
                },
                { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
            );

            const report = res.data;
            if (typeof report === "string") {
                setExecutionStatus("error");
                setConsoleOutput(`❌ Server Error:\n${report}`);
                return;
            }
            if (report.error) {
                setExecutionStatus("error");
                const hint = report.detail ? `\n\nDetail: ${report.detail}` : "";
                setConsoleOutput(`❌ Server Error: ${report.error}${hint}`);
                return;
            }

            // Check if passed/failed matching consistent strict logic
            const passed = report.stats?.passed ?? 0;
            const total = report.stats?.total ?? 0;

            if (total === 0) {
                setExecutionStatus("error");
                setConsoleOutput(
                    "❌ Compiler returned no usable test summary (0/0).\n\n" +
                    "Ensure the server returns JSON with `results` and `stats` for each run."
                );
                return;
            }

            let outputStr = `✨ Dry Run Complete!\nPassed: ${passed}/${total}\nRuntime: ${report.stats?.runtime_ms ?? "—"}ms\n\n`;

            // Append Details
            (report.results || []).forEach((r: any) => {
                const idx = typeof r?.id === "number" ? r.id + 1 : "?";
                outputStr += `${r.status === "Passed" ? "✅" : "❌"} Case ${idx}: ${r.status}\n`;
                if (r.status !== "Passed") {
                    outputStr += `   Input: ${r.input ?? r.stdin}\n   Expected: ${r.expected ?? r.output}\n   Actual: ${r.actual}\n\n`;
                }
            });

            setConsoleOutput(outputStr);

            if (passed === total) {
                setExecutionStatus("success");
                triggerToast("All Tests Passed!", "success");
                setCanSubmit(true); // ✅ Unlock Submit
            } else {
                setExecutionStatus("error");
                triggerToast("Tests Failed", "error");
            }

        } catch (err: any) {
            setExecutionStatus("error");
            setConsoleOutput("❌ server error: " + (err.response?.data?.error || err.message));
        }
    };

    // ✅ NEW: SUBMIT FUNCTION (Official Grading)
    const handleSubmit = async () => {
        if (!canSubmit) {
            triggerToast("Please successfully RUN your code before submitting.", "error");
            return;
        }

        setExecutionStatus("running");
        setConsoleOutput("🚀 Submitting to Official Grader...");

        const currentProb = activeTest?.problems[currentProblemIndex];
        if (!activeTest || !currentProb) {
            triggerToast("No active problem.", "error");
            return;
        }

        try {
            // Grading uses canonical cases from the backend (includes hidden tests)
            const res = await axios.post(`${API_BASE_URL}/execute`,
                {
                    source_code: userCode,
                    language_id: language,
                    test_cases: [],
                    code_test_id: activeTest.id,
                    problem_id: currentProb.id,
                },
                { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
            );

            const report = res.data;

            if (typeof report === "string") {
                setExecutionStatus("error");
                setConsoleOutput(`❌ SERVER ERROR:\n${report}`);
                triggerToast("Compiler returned invalid response", "error");
                return;
            }

            if (report.error) {
                setExecutionStatus("error");
                const hint = report.detail ? `\n\nDetail: ${report.detail}` : "";
                setConsoleOutput(`❌ SERVER ERROR:\n${report.error}${hint}`);
                triggerToast("Compiler error", "error");
                return;
            }

            // Check PASS/FAIL logic
            const passedCount = report.stats?.passed ?? 0;
            const totalCount = report.stats?.total ?? 0;

            if (totalCount === 0) {
                setExecutionStatus("error");
                setConsoleOutput(
                    "❌ The compiler did not report any test results (0/0).\n\n" +
                    "The backend must return JSON like: { \"stats\": { \"passed\": n, \"total\": n, \"runtime_ms\": n }, \"results\": [ { \"input\", \"expected\", \"actual\", \"status\" } ] }.\n" +
                    "A plain string response will not work for Code Arena."
                );
                triggerToast("Invalid compiler response", "error");
                return;
            }

            // 🚨 STRICT SUCCESS VALIDATION
            if (passedCount === totalCount) {
                setExecutionStatus("success");
                setConsoleOutput(`🎉 Challenge Solved! All ${totalCount} test cases passed.\n\nRuntime: ${report.stats?.runtime_ms ?? "—"}ms`);
                triggerToast("🎉 Challenge Solved!", "success");

                handleSave();
                const nextPassed = { ...passedProblemsRef.current, [currentProblemIndex]: true };
                passedProblemsRef.current = nextPassed;
                setPassedProblems(nextPassed);
                if (activeTest) localStorage.setItem(`passed_${activeTest.id}`, JSON.stringify(nextPassed));
            } else {
                setExecutionStatus("error");
                const fail = (report.results as any[])?.find((r: any) => r && r.status !== "Passed");
                const fin = fail?.input ?? fail?.stdin ?? "(hidden or n/a)";
                const fexp = fail?.expected ?? fail?.output ?? "(n/a)";
                const fact = fail?.actual ?? "(n/a)";
                setConsoleOutput(`❌ Test cases failed (${passedCount}/${totalCount} passed).\n\nFirst failure:\nInput: ${fin}\nExpected: ${fexp}\nActual: ${fact}`);
                triggerToast("Some tests failed", "error");
            }
        } catch (err: any) {
            setExecutionStatus("error");
            setConsoleOutput("❌ System Error: " + (err.response?.data?.error || err.message));
        }
    };


    const switchQuestion = (index: number) => {
        handleSave();
        setCanSubmit(false); // ✅ Reset permission on switch
        setCurrentProblemIndex(index);
        setUserCode(solutions[index] || CODE_TEMPLATES.python);
        setConsoleOutput("Ready...");
        setExecutionStatus("idle");
    };

    const submitTest = async (disqualified = false) => {
        const at = activeTestRef.current;
        if (!at) return;
        const token = localStorage.getItem("token");
        const n = at.problems.length;
        let solved = 0;
        for (let i = 0; i < n; i++) if (passedProblemsRef.current[i]) solved++;
        const score = disqualified ? 0 : Math.round((solved / Math.max(n, 1)) * 100);
        const limitSec = at.time_limit * 60;
        const elapsed = Math.max(0, limitSec - timeLeftRef.current);
        const mm = Math.floor(elapsed / 60);
        const ss = elapsed % 60;
        const time_taken = disqualified ? "Terminated" : `${mm}m ${ss}s`;
        try {
            await axios.post(`${API_BASE_URL}/code-tests/submit`, {
                test_id: at.id,
                score,
                problems_solved: disqualified ? 0 : solved,
                time_taken,
            }, { headers: { Authorization: `Bearer ${token}` } });
            stopProctorCamera();
            if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
            setActiveTest(null);
            localStorage.removeItem(`sols_${at.id}`);
            localStorage.removeItem(`passed_${at.id}`);
            passedProblemsRef.current = {};
            setPassedProblems({});
            triggerToast(disqualified ? "Test Terminated." : "Test submitted successfully!", disqualified ? "error" : "success");
            fetchCodeTests();
        } catch (err) {
            triggerToast("Could not submit test.", "error");
        }
    };

    const finishTestEarly = async () => {
        const at = activeTest;
        if (!at) return;
        const n = at.problems.length;
        let solved = 0;
        for (let i = 0; i < n; i++) if (passedProblemsRef.current[i]) solved++;
        if (solved < n) {
            triggerToast(`Solve all ${n} problems first (${solved}/${n} passed).`, "error");
            return;
        }
        await submitTest(false);
    };

    const codeArenaAllPassed = useMemo(() => {
        if (!activeTest) return false;
        const tot = activeTest.problems.length;
        let ok = 0;
        for (let i = 0; i < tot; i++) if (passedProblems[i]) ok++;
        return tot > 0 && ok === tot;
    }, [activeTest, passedProblems]);

    const codeArenaSolvedCount = useMemo(() => {
        if (!activeTest) return 0;
        let ok = 0;
        for (let i = 0; i < activeTest.problems.length; i++) if (passedProblems[i]) ok++;
        return ok;
    }, [activeTest, passedProblems]);

    const handleFreeEnroll = async (courseId: number) => {
        setProcessing(true);
        try {
            await axios.post(`${API_BASE_URL}/enroll/${courseId}`, { type: "paid" }, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
            triggerToast("🎉 Enrolled!", "success"); fetchData(); setActiveTab("learning");
        } catch (err) { triggerToast("Enrollment failed.", "error"); } finally { setProcessing(false); }
    };

    const handleEnrollStrategy = async (type: "trial" | "paid") => {
        if (!selectedCourse) return;
        setProcessing(true);

        try {
            if (type === "trial") {
                await axios.post(`${API_BASE_URL}/enroll/${selectedCourse.id}`,
                    { type: "trial" },
                    { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }
                );
                triggerToast(`🎉 Free Trial Started for ${selectedCourse.title}!`, "success");
                fetchData(); setShowModal(false); setActiveTab("learning");
            } else {
                const isLoaded = await loadRazorpayScript();
                if (!isLoaded) { triggerToast("SDK Failed to load", "error"); return; }
                const razorpayKey = import.meta.env.VITE_RAZORPAY_KEY_ID;
                if (!razorpayKey || String(razorpayKey).includes("replace_me")) {
                    triggerToast("Set a valid VITE_RAZORPAY_KEY_ID in frontend/.env", "error");
                    return;
                }

                const token = localStorage.getItem("token");
                const orderRes = await axios.post(`${API_BASE_URL}/create-order`,
                    { course_id: selectedCourse.id },
                    { headers: { Authorization: `Bearer ${token}` } }
                );

                const options = {
                    key: orderRes.data.key_id || razorpayKey,
                    amount: orderRes.data.amount,
                    currency: orderRes.data.currency,
                    name: "Cloud Vaathi Pro",
                    description: `Unlock ${selectedCourse.title}`,
                    order_id: orderRes.data.id,
                    handler: async function (response: any) {
                        await axios.post(
                            `${API_BASE_URL}/payment/verify`,
                            {
                                course_id: selectedCourse.id,
                                razorpay_payment_id: response.razorpay_payment_id,
                                razorpay_order_id: response.razorpay_order_id,
                                razorpay_signature: response.razorpay_signature
                            },
                            { headers: { Authorization: `Bearer ${token}` } }
                        );
                        triggerToast("🎉 Payment Successful! Course Unlocked.", "success");
                        fetchData(); setShowModal(false); setActiveTab("learning");
                    },
                    prefill: { name: "Student", email: "lmscloudvaathi@gmail.com" },
                    theme: { color: "#005EB8" },
                };

                const rzp = new (window as any).Razorpay(options);
                rzp.open();
            }
        } catch (err: any) {
            triggerToast(getErrorMessage(err, "Transaction Failed."), "error");
        } finally {
            setProcessing(false);
        }
    };

    const handleDownloadCertificate = async (courseId: number, courseTitle: string) => {
        triggerToast("Downloading certificate...", "success");
        try {
            await downloadCertificatePdf(courseId, courseTitle);
        } catch (error) {
            console.error("Download error:", error);
            triggerToast("Failed to download certificate. Try again.", "error");
        }
    };

    // ✅ NEW: Handle Syllabus Download (Direct Link)
    const handleDownloadSyllabus = (url: string) => {
        if (!url) {
            triggerToast("No syllabus link available.", "error");
            return;
        }
        window.open(url, '_blank');
    };

    const openEnrollModal = (course: Course) => { setSelectedCourse(course); setShowModal(true); };
    const handleLogout = () => { clearSession(); navigate("/"); };

    // --- ⚔️ THE REAL CODE ARENA VIEW ---
    if (activeTest) {
        return (
            <div className="flex flex-col lg:flex-row h-screen bg-[#F8FAFC] font-sans overflow-hidden relative">
                {isFullScreenViolation && (
                    <div className="fixed inset-0 z-[9999] bg-[#0f172a] flex flex-col items-center justify-center text-center p-6">
                        <div className="mb-6"><AlertTriangle size={60} className="text-red-500 mx-auto mb-4" /></div>
                        <h1 className="text-2xl lg:text-4xl font-extrabold text-white tracking-widest mb-4">TEST INTERRUPTED</h1>
                        <p className="text-slate-400 text-sm lg:text-lg max-w-lg mb-2">You have exited full-screen mode. This is a proctoring violation.</p>
                        <div className="bg-white/10 px-8 py-3 rounded-lg border border-red-500/30 mb-8"><span className="text-red-400 font-bold text-lg tracking-wider">Remaining Warnings: {Math.max(0, 3 - warnings)}</span></div>
                        <button onClick={returnToFullScreen} className="bg-red-500 hover:bg-red-600 text-white px-6 py-3 lg:px-8 lg:py-4 rounded font-bold text-sm lg:text-lg tracking-wider flex items-center gap-2"><Monitor size={20} /> RETURN TO FULL SCREEN</button>
                    </div>
                )}

                {/* LEFT PANEL: Question & Cam */}
                <div className="w-full lg:w-[35%] h-[40%] lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r border-slate-300 bg-white shadow-lg z-10">
                    <div className="h-12 lg:h-16 border-b border-slate-200 flex items-center px-4 lg:px-6 bg-white shrink-0 gap-2 flex-wrap">
                        <h3 className="text-lg lg:text-2xl font-extrabold text-slate-800 truncate">Problem {currentProblemIndex + 1}</h3>
                        <span className="ml-auto bg-blue-50 text-blue-800 text-[10px] lg:text-xs font-bold px-2 py-1 rounded whitespace-nowrap">
                            {codeArenaSolvedCount}/{activeTest.problems.length} done
                        </span>
                        <span className="bg-slate-900 text-white text-[10px] lg:text-xs font-mono font-bold px-2 py-1 rounded whitespace-nowrap">
                            {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                        </span>
                        <span className="bg-yellow-100 text-yellow-700 text-[10px] lg:text-xs font-bold px-2 py-1 rounded">MEDIUM</span>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 lg:p-6 bg-white">
                        <p className="text-slate-500 mb-6 italic">No description provided.</p>
                        {activeTest.problems[currentProblemIndex]?.description && <div className="prose prose-sm text-slate-600 mb-6">{activeTest.problems[currentProblemIndex].description}</div>}
                        <h4 className="font-extrabold text-slate-900 mb-4 text-xs lg:text-sm uppercase tracking-wide">TEST CASES</h4>
                        <div className="space-y-2">{JSON.parse(activeTest.problems[currentProblemIndex]?.test_cases || "[]").filter((tc: any) => !tc.hidden).map((tc: any, i: number) => (<div key={i} className="bg-slate-50 border border-slate-200 p-2 lg:p-3 rounded text-xs lg:text-sm"><span className="font-mono font-bold block">Input: {tc.input}</span></div>))}</div>
                    </div>

                    {/* Camera View - Smaller on Mobile */}
                    <div className="h-32 lg:h-56 bg-slate-100 border-t border-slate-300 p-2 lg:p-4 relative flex items-center justify-center overflow-hidden shrink-0">
                        <video ref={videoRef} autoPlay muted className="w-full h-full object-cover rounded-lg border-2 border-slate-300 bg-black" />
                        <div className="absolute top-4 left-4 lg:top-6 lg:left-6 bg-red-600 text-white text-[10px] font-bold px-2 py-0.5 rounded flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-white animate-pulse"></div> REC</div>
                        {faceStatus !== "ok" && <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10"><span className="text-red-400 font-bold bg-black px-2 py-1 rounded border border-red-500 text-xs lg:text-sm">FACE MISSING</span></div>}
                    </div>
                </div>

                {/* RIGHT PANEL: Editor & Terminal */}
                <div className="w-full lg:w-[65%] h-[60%] lg:h-full flex flex-col bg-[#F3F4F6]">
                    <div className="h-10 lg:h-12 bg-white border-b border-slate-200 flex items-center justify-between px-2 lg:px-4 shrink-0">
                        <span className="text-[10px] lg:text-xs font-bold text-slate-400 uppercase flex items-center gap-2"><Code size={14} /> Code Editor</span>
                        <select value={language} onChange={(e) => {
                            const newLangId = Number(e.target.value);
                            setLanguage(newLangId);
                            const template = newLangId === 71 ? CODE_TEMPLATES.python : (newLangId === 62 ? CODE_TEMPLATES.java : CODE_TEMPLATES.cpp);
                            setUserCode(template);
                        }} className="text-[10px] lg:text-xs border border-slate-300 rounded px-2 py-1 bg-white font-bold text-slate-700">
                            {languages.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                        </select>
                    </div>
                    <div className="flex-1 bg-white relative">
                        <Editor height="100%" theme="light" language={languages.find(l => l.id === language)?.value} value={userCode} onChange={(val) => setUserCode(val || "")} options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, fontFamily: "'JetBrains Mono', monospace", padding: { top: 16 }, lineNumbers: "on" }} />
                    </div>

                    {/* Terminal - Smaller on mobile */}
                    <div className="h-24 lg:h-32 bg-[#0F172A] border-t border-slate-700 text-slate-300 p-2 lg:p-3 font-mono text-[10px] lg:text-xs overflow-y-auto flex flex-col shrink-0">
                        <div className="flex items-center gap-2 text-slate-500 font-bold uppercase text-[10px] mb-2 border-b border-slate-700 pb-1"><Monitor size={12} /> Terminal Output</div>
                        <pre className={`whitespace-pre-wrap flex-1 ${executionStatus === "error" ? "text-red-400" : "text-green-400"}`}>{executionStatus === "running" ? <span className="text-yellow-400">Compiling...</span> : consoleOutput}</pre>
                    </div>

                    <div className="h-14 lg:h-16 bg-white border-t border-slate-200 flex items-center justify-end px-2 lg:px-6 gap-2 lg:gap-3 shrink-0 flex-wrap">
                        <button type="button" onClick={() => switchQuestion(currentProblemIndex + 1 < activeTest.problems.length ? currentProblemIndex + 1 : 0)} className="flex items-center gap-2 px-3 py-2 lg:px-6 lg:py-2.5 rounded-lg border border-slate-300 text-slate-700 font-bold text-xs lg:text-sm hover:bg-slate-50 transition-colors"><ChevronRight size={14} className="lg:w-4 lg:h-4" /> <span className="hidden sm:inline">Next</span></button>

                        {/* 🟢 Run Code (Dry Run) */}
                        <button onClick={handleRunCode} disabled={executionStatus === "running"} className="flex items-center gap-2 px-3 py-2 lg:px-6 lg:py-2.5 rounded-lg bg-slate-200 text-slate-700 font-bold text-xs lg:text-sm hover:bg-slate-300 transition-colors"><Play size={14} fill="currentColor" className="lg:w-4 lg:h-4" /> Run Code</button>

                        {/* 🔵 Submit (Official Grading) */}
                        <button
                            onClick={handleSubmit}
                            disabled={executionStatus === "running" || !canSubmit}
                            title={!canSubmit ? "Run code successfully first" : "Submit solution"}
                            className={`flex items-center gap-2 px-3 py-2 lg:px-6 lg:py-2.5 rounded-lg border font-bold text-xs lg:text-sm shadow-md transition-all
                            ${canSubmit
                                    ? "bg-[#005EB8] text-white hover:bg-blue-700 border-transparent"
                                    : "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed"
                                }`}
                        >
                            <Cloud size={14} className="lg:w-4 lg:h-4" /> Submit
                        </button>

                        <button
                            type="button"
                            onClick={finishTestEarly}
                            disabled={executionStatus === "running" || !codeArenaAllPassed}
                            title="Submit the test after all problems pass official grading"
                            className={`flex items-center gap-2 px-3 py-2 lg:px-8 lg:py-2.5 rounded-lg font-bold text-xs lg:text-sm shadow-md transition-all
                                ${codeArenaAllPassed
                                    ? "bg-[#87C232] text-white hover:bg-[#76a82b] border border-transparent"
                                    : "bg-slate-200 text-slate-400 border border-slate-300 cursor-not-allowed"
                                }`}
                        >
                            <Flag size={14} className="lg:w-4 lg:h-4" /> Finish
                        </button>
                    </div>
                </div>

                <ToastPortal show={toast.show}>
                    <div className={`px-6 py-3 rounded-lg shadow-xl text-white font-bold flex items-center gap-3 animate-bounce ${toast.type === "success" ? "bg-green-500" : "bg-red-500"}`}>
                        {toast.type === "success" ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                        {toast.message}
                    </div>
                </ToastPortal>
            </div>
        );
    }

    // ✅ LOADING SPINNER UI
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
                    <p className="text-muted-foreground font-bold animate-pulse">Loading Cloud Vaathi Dashboard...</p>
                </div>
            </div>
        );
    }



    // --- DASHBOARD UI ---
    return (
        <div className="min-h-screen bg-transparent font-sans">

            {/* 1. HEADER BAR */}
            <header className="glass border-b border-border/50 px-4 lg:px-8 py-3 sm:py-4 flex justify-between items-center sticky top-0 z-50 relative">

                {/* Left: Logo & Mobile Toggle */}
                <div className="flex min-w-0 items-center gap-3">
                    <button
                        type="button"
                        onClick={openMobileMenu}
                        className="rounded-lg p-2 text-muted-foreground hover:bg-white/10 lg:hidden"
                        aria-label="Open sections"
                    >
                        <Menu size={24} />
                    </button>
                    <div className="min-w-0">
                        <BrandLogo size="md" showTagline />
                        <p className="mt-0.5 text-[11px] font-medium text-muted-foreground lg:hidden">
                            Sections · swipe from left
                        </p>
                    </div>
                </div>

                {/* Center: Desktop Navigation Menu */}
                <nav className="hidden lg:flex items-center gap-2">
                    <NavItem icon={<LayoutDashboard size={18} />} label="Home" active={activeTab === "home"} onClick={() => switchTab("home")} />
                    <NavItem icon={<BookOpen size={18} />} label="My Learning" active={activeTab === "learning"} onClick={() => switchTab("learning")} />
                    <NavItem icon={<Code size={18} />} label="Code Test" active={activeTab === "test"} onClick={() => switchTab("test")} />
                    <NavItem icon={<Compass size={18} />} label="Explore" active={activeTab === "explore"} onClick={() => switchTab("explore")} />
                    <NavItem icon={<Award size={18} />} label="Certificates" active={activeTab === "certificates"} onClick={() => switchTab("certificates")} />
                </nav>

                {/* Right: Actions (Notification & Profile) */}
                <div className="flex items-center gap-2 lg:gap-4">
                    <button
                        type="button"
                        onClick={() => {
                            switchTab("notifications");
                            setUnreadCount(0);
                            axios.patch(`${API_BASE_URL}/notifications/read`, {}, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
                        }}
                        className="relative p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-600"
                    >
                        <BellRing size={20} />
                        {unreadCount > 0 && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
                    </button>

                    <ProfileMenu
                        name={studentProfile.name}
                        email={studentProfile.email}
                        onSettings={() => switchTab("settings")}
                        onSignOut={handleLogout}
                        signOutLabel="Logout"
                    >
                        <User size={18} className="lg:w-5 lg:h-5" />
                    </ProfileMenu>
                </div>
            </header>

            {/* Edge swipe hint (mobile) */}
            {!isMobileMenuOpen && (
                <div
                    aria-hidden
                    className="pointer-events-none fixed left-0 top-1/2 z-40 h-24 w-1.5 -translate-y-1/2 rounded-r-full bg-primary/40 lg:hidden"
                />
            )}

            {/* 2. MOBILE SIDE SECTIONS (swipe or menu) */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-[60] lg:hidden">
                    <button
                        type="button"
                        aria-label="Close sections"
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={closeMobileMenu}
                    />

                    <motion.aside
                        initial={{ x: -320 }}
                        animate={{ x: 0 }}
                        transition={{ type: "spring", stiffness: 320, damping: 32 }}
                        className="absolute left-0 top-0 flex h-full w-[min(18rem,86vw)] flex-col border-r border-border/50 glass p-5 shadow-2xl"
                        aria-label="Sections"
                    >
                        <div className="mb-5 flex items-center justify-between border-b border-border pb-4">
                            <div>
                                <BrandLogo size="sm" />
                                <p className="mt-1 text-[11px] font-bold uppercase tracking-widest text-primary">Student</p>
                            </div>
                            <button
                                type="button"
                                onClick={closeMobileMenu}
                                className="rounded-lg p-2 text-muted-foreground hover:bg-white/10"
                                aria-label="Close"
                            >
                                <X size={22} />
                            </button>
                        </div>

                        <nav className="flex flex-1 flex-col gap-1.5 overflow-y-auto">
                            <SideNavItem icon={<LayoutDashboard size={20} />} label="Home" active={activeTab === "home"} onClick={() => switchTab("home")} />
                            <SideNavItem icon={<BookOpen size={20} />} label="My Learning" active={activeTab === "learning"} onClick={() => switchTab("learning")} />
                            <SideNavItem icon={<Code size={20} />} label="Code Test" active={activeTab === "test"} onClick={() => switchTab("test")} />
                            <SideNavItem icon={<Compass size={20} />} label="Explore" active={activeTab === "explore"} onClick={() => switchTab("explore")} />
                            <SideNavItem icon={<Award size={20} />} label="Certificates" active={activeTab === "certificates"} onClick={() => switchTab("certificates")} />
                            <SideNavItem icon={<BellRing size={20} />} label="Notifications" active={activeTab === "notifications"} onClick={() => switchTab("notifications")} />
                            <SideNavItem icon={<User size={20} />} label="Settings" active={activeTab === "settings"} onClick={() => switchTab("settings")} />
                        </nav>

                        <div className="mt-4 border-t border-border pt-4">
                            <button
                                type="button"
                                onClick={handleLogout}
                                className="flex w-full items-center gap-3 rounded-xl p-3 text-sm font-bold text-red-400 transition-colors hover:bg-red-500/10"
                            >
                                <LogOut size={20} /> Sign Out
                            </button>
                            <p className="mt-3 text-center text-[11px] text-muted-foreground">Swipe left to close</p>
                        </div>
                    </motion.aside>
                </div>
            )}

            {/* 3. MAIN CONTENT AREA (Full Width) */}
            <main className="p-4 lg:p-8 max-w-7xl mx-auto">

                {/* Dynamic Title based on Tab */}
                <div className="mb-8">
                    <h2 className="text-3xl font-extrabold text-slate-800">
                        {activeTab === "home" && "Dashboard Overview"}
                        {activeTab === "learning" && "My Learning"}
                        {activeTab === "explore" && "Explore Courses"}
                        {activeTab === "test" && "Coding Arena"}
                        {activeTab === "certificates" && "My Achievements"}
                        {activeTab === "notifications" && "Notifications"}
                        {activeTab === "settings" && "Account Settings"}
                    </h2>
                    <p className="text-slate-500 font-medium">Welcome to your student portal</p>
                </div>

                {/* --- CONTENT SECTIONS --- */}

                {/* NOTIFICATIONS TAB */}
                {activeTab === "notifications" && (
                    <div className="max-w-3xl mx-auto space-y-4 animate-fade-in">
                        {notifications.length === 0 ? (
                            <div className="text-center py-20 text-slate-400 italic bg-white rounded-xl border border-dashed border-slate-300">No notifications yet.</div>
                        ) : (
                            notifications.map((n) => (
                                <div key={n.id} className={`p-5 rounded-xl border flex gap-4 transition-all ${n.is_read ? "bg-white border-slate-200" : "bg-blue-50 border-blue-200"}`}>
                                    <div className="p-3 bg-blue-100 text-blue-600 rounded-full h-fit"><BellRing size={20} /></div>
                                    <div className="flex-1">
                                        <h4 className="font-bold text-slate-800">{n.title}</h4>
                                        <p className="text-slate-600 text-sm mt-1">{n.message}</p>
                                        <span className="text-xs text-slate-400 mt-2 block">{new Date(n.created_at).toLocaleString()}</span>
                                    </div>
                                    <button onClick={async () => { await axios.delete(`${API_BASE_URL}/notifications/${n.id}`, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } }); fetchNotifications(); }} className="text-slate-300 hover:text-red-500 h-fit"><Trash2 size={18} /></button>
                                </div>
                            ))
                        )}
                    </div>
                )}

                {/* HOME TAB */}
                {activeTab === "home" && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="flex flex-col gap-8">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            <StatCard icon={BookOpen} label="Courses Enrolled" value={enrolledCourses.length} />
                            <StatCard icon={Award} label="Certificates Earned" value={enrolledCourses.filter((course) => course.has_certificate).length} />
                            <StatCard icon={Trophy} label="Challenges Attended" value={codeTests.filter(t => t.completed).length} />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 mb-4">Continue Learning</h3>
                            {enrolledCourses.length > 0 ? (
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                    {enrolledCourses.slice(0, 2).map((course) => { // Show max 2 here
                                        const prog = progressMap[course.id] || { percent: 0, completed: 0, total: 0 };
                                        return (
                                            <div key={course.id} className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-6 items-center">
                                                <div className="w-full md:w-1/3 h-32 bg-slate-100 rounded-xl overflow-hidden relative">
                                                    {course.image_url ? <img src={resolveMediaUrl(course.image_url)} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-slate-300"><BookOpen /></div>}
                                                    {!course.is_trial_expired && <CourseProgressRing percent={prog.percent} />}
                                                </div>
                                                <div className="flex-1 w-full">
                                                    <h4 className="font-bold text-lg text-slate-800 mb-2">{course.title}</h4>
                                                    <CourseProgressVisual progress={prog} />
                                                    <div className="flex gap-2">
                                                        <button onClick={() => navigate(`/course/${course.id}`)} className="flex-1 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg font-bold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2">
                                                            <LayoutDashboard size={16} /> Dashboard
                                                        </button>
                                                        <button onClick={() => navigate(`/course/${course.id}/player`)} className="flex-1 py-2 bg-[#005EB8] text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                                                            Resume <ChevronRight size={16} />
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                <div className="bg-white p-10 rounded-2xl border border-dashed border-slate-300 text-center text-slate-400">You haven't enrolled in any courses yet.</div>
                            )}
                        </div>
                    </motion.div>
                )}

                {/* LEARNING TAB */}
                {activeTab === "learning" && (
                    <div>
                        {/* ✅ NEW: Sub-navigation to separate Standard vs Coding courses */}
                        <div className="flex gap-4 mb-6 border-b border-slate-200 pb-2">
                            <button
                                onClick={() => setLearningSubTab("standard")}
                                className={`pb-2 text-sm font-bold transition-all ${learningSubTab === "standard"
                                    ? "text-[#005EB8] border-b-2 border-[#005EB8]"
                                    : "text-slate-500 hover:text-slate-800"
                                    }`}
                            >
                                Standard Courses
                            </button>
                            <button
                                onClick={() => setLearningSubTab("coding")}
                                className={`pb-2 text-sm font-bold transition-all ${learningSubTab === "coding"
                                    ? "text-[#005EB8] border-b-2 border-[#005EB8]"
                                    : "text-slate-500 hover:text-slate-800"
                                    }`}
                            >
                                Coding Courses
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* ✅ Logic: Filter courses based on the selected sub-tab */}
                            {enrolledCourses
                                .filter(c => {
                                    if (learningSubTab === "standard") return c.course_type !== "coding";
                                    if (learningSubTab === "coding") return c.course_type === "coding";
                                    return true;
                                })
                                .map(c => (
                                    <CourseCard
                                        key={c.id}
                                        course={c}
                                        type="enrolled"
                                        navigate={navigate}
                                        progress={progressMap[c.id]}
                                        handleDownloadSyllabus={handleDownloadSyllabus}
                                        onPayClick={(course: Course) => {
                                            // Reuse modal logic for payment
                                            setSelectedCourse(course);
                                            setShowModal(true);
                                        }}
                                    />
                                ))
                            }
                            {enrolledCourses.length === 0 && <div className="col-span-full text-center py-20 text-slate-400">No active courses.</div>}
                        </div>
                    </div>
                )}

                {/* EXPLORE TAB */}
                {activeTab === "explore" && (
                    <div className="space-y-8">
                        <div>
                            <p className="text-slate-500 text-sm mb-4">Browse by category to find the right course faster.</p>
                            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-thin">
                                <button
                                    onClick={() => setExploreCategory("all")}
                                    className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-all ${exploreCategory === "all"
                                        ? "bg-[#005EB8] text-white border-[#005EB8] shadow-sm"
                                        : "bg-white text-slate-600 border-slate-200 hover:border-[#005EB8] hover:text-[#005EB8]"
                                        }`}
                                >
                                    All ({availableCourses.length})
                                </button>
                                {exploreGroups.map((group) => (
                                    <button
                                        key={group.id}
                                        onClick={() => setExploreCategory(group.id)}
                                        className={`shrink-0 px-4 py-2 rounded-full text-sm font-bold border transition-all ${exploreCategory === group.id
                                            ? "bg-[#005EB8] text-white border-[#005EB8] shadow-sm"
                                            : "bg-white text-slate-600 border-slate-200 hover:border-[#005EB8] hover:text-[#005EB8]"
                                            }`}
                                    >
                                        {group.label} ({group.courses.length})
                                    </button>
                                ))}
                            </div>
                        </div>

                        {availableCourses.length === 0 ? (
                            <div className="bg-white p-10 rounded-2xl border border-dashed border-slate-300 text-center text-slate-400">
                                No courses available to explore yet.
                            </div>
                        ) : visibleExploreGroups.length === 0 ? (
                            <div className="bg-white p-10 rounded-2xl border border-dashed border-slate-300 text-center text-slate-400">
                                No courses in this category.
                            </div>
                        ) : (
                            visibleExploreGroups.map((group) => (
                                <section key={group.id}>
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-lg font-extrabold text-slate-800">{group.label}</h3>
                                        <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">{group.courses.length} course{group.courses.length === 1 ? "" : "s"}</span>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                        {group.courses.map((c) => (
                                            <CourseCard key={c.id} course={c} type="available" handleFreeEnroll={handleFreeEnroll} openEnrollModal={openEnrollModal} />
                                        ))}
                                    </div>
                                </section>
                            ))
                        )}
                    </div>
                )}

                {/* TEST TAB */}
                {activeTab === "test" && (
                    <div className="grid gap-5">
                        {codeTests.map(test => (
                            <div key={test.id} className="bg-white p-6 rounded-xl border border-slate-200 flex justify-between items-center shadow-sm hover:shadow-md transition-all">
                                <div><h3 className="text-lg font-bold text-slate-800">{test.title}</h3><p className="text-slate-500 text-sm">Duration: {test.time_limit} Mins</p></div>
                                <button onClick={() => setShowPassKeyModal(test.id)} className="bg-[#005EB8] text-white px-6 py-2 rounded-lg font-bold hover:bg-blue-700 transition-colors">Start Test</button>
                            </div>
                        ))}
                    </div>
                )}

                {/* CERTIFICATES TAB */}
                {activeTab === "certificates" && (
                    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {enrolledCourses.map(course => (
                                <div key={course.id} className="bg-white p-6 rounded-xl border border-slate-200 hover:shadow-md transition-all flex items-center justify-between">
                                    <div className="flex items-center gap-4">
                                        <div className={`h-12 w-12 rounded-lg flex items-center justify-center ${course.has_certificate ? "bg-green-100 text-green-600" : "bg-red-100 text-red-500"}`}>
                                            {course.has_certificate ? <Award size={24} /> : <Lock size={24} />}
                                        </div>
                                        <div>
                                            <h4 className="font-bold text-slate-800">{course.title}</h4>
                                            {course.has_certificate ? (
                                                <span className="text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded mt-1 inline-block">COMPLETED</span>
                                            ) : (
                                                <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded mt-1 inline-block">INCOMPLETE</span>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-1">
                                    {course.certificate_id && (
                                        <button
                                            onClick={() => navigate(certificateVerifyPath(course.certificate_id!))}
                                            className="p-2 rounded-lg text-[#005EB8] hover:bg-blue-50"
                                            title="Verify certificate"
                                        >
                                            <ExternalLink size={18} />
                                        </button>
                                    )}
                                    <button
                                        onClick={() => course.has_certificate ? handleDownloadCertificate(course.id, course.title) : triggerToast("Complete the course first!", "error")}
                                        disabled={!course.has_certificate}
                                        className={`p-2 rounded-lg transition-colors ${course.has_certificate ? "text-[#005EB8] hover:bg-blue-50 cursor-pointer" : "text-slate-300 cursor-not-allowed"}`}
                                        title={course.has_certificate ? "Download Certificate" : "Locked: Complete Course First"}
                                    >
                                        <Download size={20} />
                                    </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}

                {/* SETTINGS TAB */}
                {activeTab === "settings" && (
                    <div className="max-w-xl mx-auto bg-white p-8 rounded-2xl shadow-sm border border-slate-200">
                        <h3 className="text-xl font-bold text-slate-800 mb-6 flex items-center gap-2"><Lock size={20} className="text-slate-400" /> Change Password</h3>
                        <div className="space-y-4">
                            <div><label className="block text-xs font-bold text-slate-500 uppercase mb-2">New Password</label><input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 focus:ring-[#005EB8]" /></div>
                            <button onClick={handleUpdatePassword} className="w-full py-3 bg-[#005EB8] hover:bg-blue-700 text-white rounded-xl font-bold transition-all">Update Password</button>
                        </div>
                    </div>
                )}

            </main>


            {/* 🔵 ENROLLMENT MODAL (Correctly Placed Outside Main Loop) */}
            <Modal open={showModal && !!selectedCourse} onClose={() => setShowModal(false)} overlayStyle={{ background: "rgba(15, 23, 42, 0.7)", backdropFilter: "blur(6px)" }}>
                    {selectedCourse && (
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-xl shadow-2xl max-w-sm w-full relative overflow-hidden" onClick={(e) => e.stopPropagation()}>
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#005EB8] to-[#87C232]"></div>
                        <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>

                        <div className="p-6 pb-0">
                            <h3 className="text-xl font-extrabold text-slate-800 mb-1">Unlock Course</h3>
                            <p className="text-slate-500 text-xs">You are about to unlock <strong>{selectedCourse.title}</strong>.</p>
                        </div>

                        <div className="p-6">
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 flex items-center justify-between">
                                <div><span className="block text-[10px] font-bold text-slate-400 uppercase">Price</span><span className="text-2xl font-extrabold text-[#005EB8]">{formatStudentCourseAmount(selectedCourse.price) ?? "—"}</span></div>
                                <div className="text-right"><span className="block text-[10px] font-bold text-slate-400 uppercase">Access</span><span className="text-sm font-bold text-slate-700">Lifetime</span></div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button onClick={() => handleEnrollStrategy("paid")} disabled={processing} className="w-full py-3 rounded-lg bg-[#005EB8] hover:bg-blue-700 text-white font-bold shadow-lg shadow-blue-500/30 transition-all flex items-center justify-center gap-2">
                                    {processing ? "Processing..." : <><Lock size={16} /> Pay & Unlock Now</>}
                                </button>
                                {RAZORPAY_PAYLINK_URL && (
                                    <button
                                        onClick={() => handleEnrollStrategy("paid")}
                                        className="w-full py-3 rounded-lg bg-white border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 transition-all text-sm"
                                    >
                                        Pay via Razorpay Link
                                    </button>
                                )}

                                {/* ✅ FIX: Hide trial button if user is already on a trial */}
                                {selectedCourse.enrollment_type !== "trial" && (
                                    <button onClick={() => handleEnrollStrategy("trial")} disabled={processing} className="w-full py-3 rounded-lg bg-white border border-slate-300 text-slate-600 font-bold hover:bg-slate-50 transition-all text-sm">
                                        Start 7-Day Free Trial
                                    </button>
                                )}
                            </div>
                        </div>
                    </motion.div>
                    )}
            </Modal>

            <Modal open={showPassKeyModal !== null} onClose={() => setShowPassKeyModal(null)} overlayStyle={{ background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)" }}>
                    <div style={{ background: "var(--surface)", color: "var(--foreground)", padding: "30px", borderRadius: "16px", width: "400px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)", border: "1px solid var(--border)" }} onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center mb-4"><div className="bg-blue-50 p-3 rounded-full"><Lock className="text-[#005EB8]" size={32} /></div></div>
                        <h3 style={{ margin: "0 0 10px 0", fontSize: "20px", fontWeight: "800", color: brand.textMain, textAlign: "center" }}>Enter Access Key</h3>
                        <p className="text-center text-slate-500 text-sm mb-2">This challenge is protected. Enter the pass key provided by your instructor.</p>
                        <p className="text-center text-slate-500 text-xs mb-6 leading-relaxed">When you start, your browser will ask for <strong>camera</strong> access first, then <strong>full screen</strong>, before the test opens. The camera turns off automatically when you finish or leave the test.</p>
                        <input type="text" placeholder="e.g. SECRET123" value={passKeyInput} onChange={(e) => setPassKeyInput(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg outline-none focus:border-[#005EB8] text-center font-bold text-lg tracking-widest mb-6" />
                        <div style={{ display: "flex", gap: "10px" }}><button onClick={() => setShowPassKeyModal(null)} style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${brand.border}`, borderRadius: "8px", fontWeight: "bold", color: brand.textLight, cursor: "pointer" }}>Cancel</button><button onClick={handleStartTest} style={{ flex: 1, padding: "12px", background: "var(--gradient-neon)", border: "none", borderRadius: "8px", fontWeight: "bold", color: "#071018", cursor: "pointer" }}>Start Test</button></div>
                    </div>
            </Modal>

            <CvToast
                show={toast.show}
                type={toast.type}
                message={toast.message}
                title={toast.type === "success" ? "Success" : "Alert"}
                successColor={brand.cloudGreen}
                onClose={() => setToast({ ...toast, show: false })}
            />
        </div>
    );
};

export default StudentDashboard;