import { useState, useEffect, useRef, useMemo } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import API_BASE_URL from './config';
import { runTestCasesLocally } from './utils/pyodideEnv';
import {
    LayoutDashboard, BookOpen, Compass, Award, LogOut,
    CheckCircle, AlertTriangle, X,
    Code, Play, Monitor, ChevronRight, Cloud, Flag,
    Menu, Sparkles, Zap, User, PlayCircle, Trophy, Lock, BellRing, Trash2, Settings, Download, Clock
} from "lucide-react";
import { motion } from "framer-motion";

// ✅ AI IMPORTS 
import * as tf from "@tensorflow/tfjs";
import * as blazeface from "@tensorflow-models/blazeface";

import "@tensorflow/tfjs-backend-webgl";
import BrandLogo from "./components/BrandLogo";
import { CODE_TEMPLATES } from './utils/codeTemplates';
import { clearSession, getValidSession } from "./utils/session";

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
    enrollment_type?: "paid" | "trial";
    days_left?: number;
    is_trial_expired?: boolean;
    has_certificate?: boolean;
}

interface CodeTest { id: number; title: string; time_limit: number; problems: any[]; completed?: boolean; }

// --- RAZORPAY SCRIPT LOADER ---
const loadRazorpayScript = () => {
    return new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = "https://checkout.razorpay.com/v1/checkout.js";
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.body.appendChild(script);
    });
};

// --- 🟢 HELPER COMPONENTS ---

const NavItem = ({ icon, label, active, onClick }: any) => (
    <button
        onClick={onClick}
        className={`flex items-center gap-2 px-4 py-2 rounded-full transition-all text-sm font-bold ${active
            ? "bg-blue-50 text-[#005EB8]"
            : "text-slate-500 hover:text-slate-800 hover:bg-slate-100"
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

const CourseCard = ({ course, type, navigate, handleFreeEnroll, openEnrollModal, handleDownloadSyllabus, onPayClick }: any) => {
    const getImageUrl = (url: string) => {
        if (!url) return "";
        return url.startsWith('http') ? url : `${API_BASE_URL.replace('/api/v1', '')}/${url}`;
    };

    return (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden hover:-translate-y-1 hover:shadow-lg transition-all relative group">

            {/* ✅ 1. COMPLETED RIBBON */}
            {course.has_certificate && (
                <div className="absolute top-4 -right-12 bg-yellow-400 text-yellow-900 text-[10px] font-extrabold px-12 py-1 rotate-45 z-20 shadow-md">
                    COMPLETED
                </div>
            )}

            <div className="h-40 bg-slate-200 relative flex items-center justify-center">
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
            </div>

            <div className="p-5">
                <h4 className="font-bold text-slate-800 mb-4 truncate" title={course.title}>{course.title}</h4>

                <div className="flex justify-between items-center">
                    {/* ✅ 2. DYNAMIC PRICE / STATUS DISPLAY */}
                    {type === "enrolled" ? (
                        <div className="flex items-center gap-2">
                            {course.enrollment_type === "trial" ? (
                                <button
                                    onClick={(e) => { e.stopPropagation(); onPayClick(course); }}
                                    className="bg-green-100 text-green-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-green-200 transition-colors border border-green-200 animate-pulse"
                                >
                                    Pay ₹{course.price}
                                </button>
                            ) : (
                                <span className="text-sm font-bold text-slate-400">Lifetime Access</span>
                            )}
                        </div>
                    ) : (
                        <span className={`text-lg font-extrabold ${course.price === 0 ? "text-[#87C232]" : "text-[#005EB8]"}`}>
                            {course.price === 0 ? "Free" : `₹${course.price}`}
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
                                onClick={() => navigate(`/course/${course.id}/player`)}
                                disabled={course.is_trial_expired} // 🚫 Disable if trial expired
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

    // ✅ NEW: Sub-tab for My Learning (Standard vs Coding)
    const [learningSubTab, setLearningSubTab] = useState("standard");

    const [availableCourses, setAvailableCourses] = useState<Course[]>([]);
    const [enrolledCourses, setEnrolledCourses] = useState<Course[]>([]);
    const [loading, setLoading] = useState(true);
    const [progressMap, setProgressMap] = useState<{ [key: number]: { percent: number, completed: number, total: number } }>({});
    const [collapsed, setCollapsed] = useState(false);
    const [showProfileMenu, setShowProfileMenu] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [studentProfile, setStudentProfile] = useState({ name: "Loading...", email: "..." });
    const [newPassword, setNewPassword] = useState("");
    // ✅ MOVED: Mobile Menu State (Must be before conditional returns)
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

    // 🎨 PROFESSIONAL THEME PALETTE
    const brand = {
        cloudBlue: "#005EB8", cloudGreen: "#87C232", mainBg: "#E2E8F0", cardBg: "#F8FAFC", border: "#cbd5e1", textMain: "#1e293b", textLight: "#64748b"
    };

    const languages = [
        { id: 71, name: "Python (3.8.1)", value: "python" },
        { id: 62, name: "Java (OpenJDK 13)", value: "java" },
        { id: 54, name: "C++ (GCC 9.2.0)", value: "cpp" },
        { id: 63, name: "JavaScript (Node.js)", value: "javascript" },
    ];

    activeTestRef.current = activeTest;
    timeLeftRef.current = timeLeft;

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
            if (err.response?.status === 401) { clearSession(); navigate("/login"); }
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
        if (!session) { navigate("/login"); return; }
        if (session.role === "instructor") { navigate("/dashboard"); return; }
        fetchData();
        fetchCodeTests();
        fetchProfile();
    }, []);

    useEffect(() => {
        if (enrolledCourses.length > 0) {
            enrolledCourses.forEach(course => {
                fetchCourseProgress(course.id);
            });
        }
    }, [enrolledCourses]);

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
        } catch (err) { console.error("Failed to fetch progress", err); }
    };

    // 🛡️ MILITARY GRADE PROCTORING LOGIC
    useEffect(() => {
        let aiInterval: any;
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
                    await tf.setBackend('webgl');
                    const loadedModel = await blazeface.load();
                    if (navigator.mediaDevices.getUserMedia) {
                        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
                        if (videoRef.current) {
                            videoRef.current.srcObject = stream;
                            videoRef.current.onloadeddata = () => {
                                aiInterval = setInterval(async () => {
                                    if (videoRef.current && videoRef.current.readyState === 4) {
                                        const predictions = await loadedModel.estimateFaces(videoRef.current, false);
                                        if (predictions.length === 0) setFaceStatus("missing");
                                        else if (predictions.length > 1) setFaceStatus("multiple");
                                        else setFaceStatus("ok");
                                    }
                                }, 1000);
                            };
                        }
                    }
                } catch (err) { }
            };
            setupAI();

            return () => {
                clearInterval(timer); clearInterval(aiInterval);
                document.removeEventListener("fullscreenchange", handleFullScreenChange);
                document.removeEventListener("visibilitychange", handleVisibilityChange);
                if (videoRef.current?.srcObject) (videoRef.current.srcObject as MediaStream).getTracks().forEach(t => t.stop());
            };
        }
    }, [activeTest]);

    const handleStartTest = async () => {
        const token = localStorage.getItem("token");
        try {
            if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen().catch(() => { });
            const formData = new FormData(); formData.append("pass_key", passKeyInput);
            const res = await axios.post(`${API_BASE_URL}/code-tests/${showPassKeyModal}/start`, formData, { headers: { Authorization: `Bearer ${token}` } });
            const prevWarns = localStorage.getItem(`warns_${res.data.id}`);
            if (prevWarns && parseInt(prevWarns) > 2) {
                if (document.fullscreenElement) document.exitFullscreen();
                triggerToast("Test Terminated Previously", "error"); return;
            }
            setActiveTest(res.data);
            setTimeLeft(res.data.time_limit * 60);
            setCurrentProblemIndex(0);
            setPassedProblems({});
            passedProblemsRef.current = {};
            setShowPassKeyModal(null);
            setWarnings(prevWarns ? parseInt(prevWarns) : 0);
        } catch (err) {
            if (document.fullscreenElement) document.exitFullscreen();
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
            setActiveTest(null);
            localStorage.removeItem(`sols_${at.id}`);
            localStorage.removeItem(`passed_${at.id}`);
            passedProblemsRef.current = {};
            setPassedProblems({});
            if (document.fullscreenElement) document.exitFullscreen();
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
            const response = await axios.get(`${API_BASE_URL}/generate-pdf/${courseId}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
                responseType: 'blob',
            });

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `${courseTitle.replace(/\s+/g, '_')}_Certificate.pdf`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
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

                {toast.show && <div className={`fixed top-5 right-5 z-[10000] px-6 py-3 rounded-lg shadow-xl text-white font-bold flex items-center gap-3 animate-bounce ${toast.type === "success" ? "bg-green-500" : "bg-red-500"}`}>{toast.type === "success" ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}{toast.message}</div>}
            </div>
        );
    }

    // ✅ LOADING SPINNER UI
    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#E2E8F0]">
                <div className="flex flex-col items-center gap-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#005EB8]"></div>
                    <p className="text-slate-600 font-bold animate-pulse">Loading Cloud Vaathi Dashboard...</p>
                </div>
            </div>
        );
    }



    // --- DASHBOARD UI ---
    return (
        <div className="min-h-screen bg-[#F8FAFC] font-sans">

            {/* 1. HEADER BAR */}
            <header className="bg-white border-b border-slate-200 px-4 lg:px-8 py-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">

                {/* Left: Logo & Mobile Toggle */}
                <div className="flex items-center gap-4">
                    <button onClick={() => setIsMobileMenuOpen(true)} className="lg:hidden text-slate-600 hover:text-[#005EB8]">
                        <Menu size={24} />
                    </button>
                    <BrandLogo size="md" showTagline />
                </div>

                {/* Center: Desktop Navigation Menu */}
                <nav className="hidden lg:flex items-center gap-2">
                    <NavItem icon={<LayoutDashboard size={18} />} label="Home" active={activeTab === "home"} onClick={() => setActiveTab("home")} />
                    <NavItem icon={<BookOpen size={18} />} label="My Learning" active={activeTab === "learning"} onClick={() => setActiveTab("learning")} />
                    <NavItem icon={<Code size={18} />} label="Code Test" active={activeTab === "test"} onClick={() => setActiveTab("test")} />
                    <NavItem icon={<Compass size={18} />} label="Explore" active={activeTab === "explore"} onClick={() => setActiveTab("explore")} />
                    <NavItem icon={<Award size={18} />} label="Certificates" active={activeTab === "certificates"} onClick={() => setActiveTab("certificates")} />
                </nav>

                {/* Right: Actions (Notification & Profile) */}
                <div className="flex items-center gap-2 lg:gap-4">

                    {/* Notification Bell */}
                    <button
                        onClick={() => {
                            setActiveTab("notifications");
                            setUnreadCount(0);
                            axios.patch(`${API_BASE_URL}/notifications/read`, {}, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
                        }}
                        className="relative p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors text-slate-600"
                    >
                        <BellRing size={20} />
                        {unreadCount > 0 && <span className="absolute top-0 right-0 w-2.5 h-2.5 bg-red-500 rounded-full border-2 border-white"></span>}
                    </button>

                    {/* Profile Dropdown */}
                    <div className="relative">
                        <button onClick={() => setShowProfileMenu(!showProfileMenu)} className="w-9 h-9 lg:w-10 lg:h-10 rounded-full bg-[#005EB8] text-white flex items-center justify-center font-bold shadow-md hover:scale-105 transition-transform">
                            <User size={18} className="lg:w-5 lg:h-5" />
                        </button>

                        {showProfileMenu && (
                            <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-xl border border-slate-200 p-4 z-50 animate-fade-in">
                                <div className="mb-3 border-b border-slate-100 pb-3">
                                    <p className="font-bold text-slate-800 truncate">{studentProfile.name}</p>
                                    <p className="text-xs text-slate-500 truncate">{studentProfile.email}</p>
                                </div>
                                <button onClick={() => { setActiveTab("settings"); setShowProfileMenu(false); }} className="flex items-center gap-3 w-full p-2 rounded-lg text-slate-600 hover:bg-slate-50 hover:text-[#005EB8] text-sm font-bold mb-1 transition-colors">
                                    <Settings size={16} /> Settings
                                </button>
                                <button onClick={handleLogout} className="flex items-center gap-3 w-full p-2 rounded-lg text-red-500 hover:bg-red-50 text-sm font-bold transition-colors">
                                    <LogOut size={16} /> Logout
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Mobile Menu Toggle (Visible on small screens) */}
                    <button className="md:hidden p-2 text-slate-600" onClick={() => setCollapsed(!collapsed)}>
                        <Menu size={24} />
                    </button>
                </div>
            </header>

            {/* 2. MOBILE MENU OVERLAY */}
            {isMobileMenuOpen && (
                <div className="fixed inset-0 z-[60] lg:hidden">
                    {/* Backdrop */}
                    <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>

                    {/* Sidebar */}
                    <motion.div
                        initial={{ x: -300 }}
                        animate={{ x: 0 }}
                        exit={{ x: -300 }}
                        className="absolute left-0 top-0 h-full w-64 bg-white shadow-2xl p-6 flex flex-col gap-6"
                    >
                        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                            <span className="text-xl font-extrabold text-[#005EB8]">Cloud<span className="text-[#87C232]">Vaathi Pro</span></span>
                            <button onClick={() => setIsMobileMenuOpen(false)} className="text-slate-400 hover:text-slate-600">
                                <X size={24} />
                            </button>
                        </div>

                        <nav className="flex flex-col gap-2">
                            <NavItem icon={<LayoutDashboard size={20} />} label="Home" active={activeTab === "home"} onClick={() => { setActiveTab("home"); setIsMobileMenuOpen(false); }} />
                            <NavItem icon={<BookOpen size={20} />} label="My Learning" active={activeTab === "learning"} onClick={() => { setActiveTab("learning"); setIsMobileMenuOpen(false); }} />
                            <NavItem icon={<Code size={20} />} label="Code Test" active={activeTab === "test"} onClick={() => { setActiveTab("test"); setIsMobileMenuOpen(false); }} />
                            <NavItem icon={<Compass size={20} />} label="Explore" active={activeTab === "explore"} onClick={() => { setActiveTab("explore"); setIsMobileMenuOpen(false); }} />
                            <NavItem icon={<Award size={20} />} label="Certificates" active={activeTab === "certificates"} onClick={() => { setActiveTab("certificates"); setIsMobileMenuOpen(false); }} />
                        </nav>

                        <div className="mt-auto border-t border-slate-100 pt-4">
                            <button onClick={handleLogout} className="flex items-center gap-3 w-full p-2 rounded-lg text-red-500 hover:bg-red-50 text-sm font-bold transition-colors">
                                <LogOut size={20} /> Logout
                            </button>
                        </div>
                    </motion.div>
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
                            <StatCard icon={Award} label="Certificates Earned" value={0} />
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
                                                <div className="w-full md:w-1/3 h-32 bg-slate-100 rounded-xl overflow-hidden">
                                                    {course.image_url ? <img src={course.image_url} className="w-full h-full object-cover" /> : <div className="flex items-center justify-center h-full text-slate-300"><BookOpen /></div>}
                                                </div>
                                                <div className="flex-1 w-full">
                                                    <h4 className="font-bold text-lg text-slate-800 mb-2">{course.title}</h4>
                                                    {/* ✅ USING ZAP HERE */}
                                                    <div className="flex items-center gap-2 mb-2 text-xs font-bold text-[#005EB8] uppercase tracking-wide">
                                                        <Zap size={14} className="text-yellow-500" fill="currentColor" /> In Progress
                                                    </div>
                                                    <div className="w-full bg-slate-100 rounded-full h-2 mb-2"><div className="bg-[#005EB8] h-2 rounded-full" style={{ width: `${prog.percent}%` }}></div></div>
                                                    <div className="flex justify-between text-xs text-slate-500 font-bold mb-4"><span>{prog.percent}% Complete</span><span>{prog.completed}/{prog.total} Lessons</span></div>
                                                    {/* ✅ USING CHEVRONRIGHT HERE */}
                                                    <button onClick={() => navigate(`/course/${course.id}/player`)} className="w-full py-2 bg-[#005EB8] text-white rounded-lg font-bold text-sm hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                                                        Resume <ChevronRight size={16} />
                                                    </button>
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
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {availableCourses.map(c => <CourseCard key={c.id} course={c} type="available" handleFreeEnroll={handleFreeEnroll} openEnrollModal={openEnrollModal} />)}
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

                                    <button
                                        onClick={() => course.has_certificate ? handleDownloadCertificate(course.id, course.title) : triggerToast("Complete the course first!", "error")}
                                        disabled={!course.has_certificate}
                                        className={`p-2 rounded-lg transition-colors ${course.has_certificate ? "text-[#005EB8] hover:bg-blue-50 cursor-pointer" : "text-slate-300 cursor-not-allowed"}`}
                                        title={course.has_certificate ? "Download Certificate" : "Locked: Complete Course First"}
                                    >
                                        <Download size={20} />
                                    </button>
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
            {showModal && selectedCourse && (
                <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(15, 23, 42, 0.7)", backdropFilter: "blur(6px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="bg-white rounded-xl shadow-2xl max-w-sm w-full relative overflow-hidden">
                        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#005EB8] to-[#87C232]"></div>
                        <button onClick={() => setShowModal(false)} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"><X size={20} /></button>

                        <div className="p-6 pb-0">
                            <h3 className="text-xl font-extrabold text-slate-800 mb-1">Unlock Course</h3>
                            <p className="text-slate-500 text-xs">You are about to unlock <strong>{selectedCourse.title}</strong>.</p>
                        </div>

                        <div className="p-6">
                            <div className="bg-slate-50 p-4 rounded-lg border border-slate-200 mb-6 flex items-center justify-between">
                                <div><span className="block text-[10px] font-bold text-slate-400 uppercase">Price</span><span className="text-2xl font-extrabold text-[#005EB8]">₹{selectedCourse.price}</span></div>
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
                </div>
            )}

            {/* 🟢 PROFESSIONAL PASS KEY MODAL */}
            {showPassKeyModal !== null && (
                <div style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100%", background: "rgba(15, 23, 42, 0.6)", backdropFilter: "blur(4px)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
                    <div style={{ background: "white", padding: "30px", borderRadius: "16px", width: "400px", boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)" }}>
                        <div className="flex justify-center mb-4"><div className="bg-blue-50 p-3 rounded-full"><Lock className="text-[#005EB8]" size={32} /></div></div>
                        <h3 style={{ margin: "0 0 10px 0", fontSize: "20px", fontWeight: "800", color: brand.textMain, textAlign: "center" }}>Enter Access Key</h3>
                        <p className="text-center text-slate-500 text-sm mb-6">This challenge is protected. Enter the pass key provided by your instructor.</p>
                        <input type="text" placeholder="e.g. SECRET123" value={passKeyInput} onChange={(e) => setPassKeyInput(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg outline-none focus:border-[#005EB8] text-center font-bold text-lg tracking-widest mb-6" />
                        <div style={{ display: "flex", gap: "10px" }}><button onClick={() => setShowPassKeyModal(null)} style={{ flex: 1, padding: "12px", background: "transparent", border: `1px solid ${brand.border}`, borderRadius: "8px", fontWeight: "bold", color: brand.textLight, cursor: "pointer" }}>Cancel</button><button onClick={handleStartTest} style={{ flex: 1, padding: "12px", background: brand.cloudBlue, border: "none", borderRadius: "8px", fontWeight: "bold", color: "white", cursor: "pointer" }}>Start Test</button></div>
                    </div>
                </div>
            )}

            {/* ✅ PROFESSIONAL TOAST UI */}
            {toast.show && (
                <div style={{ position: "fixed", top: "20px", right: "20px", zIndex: 9999, background: "white", padding: "16px 24px", borderRadius: "12px", boxShadow: "0 10px 30px -5px rgba(0,0,0,0.15)", borderLeft: `6px solid ${toast.type === "success" ? brand.cloudGreen : "#ef4444"}`, display: "flex", alignItems: "center", gap: "12px", animation: "slideIn 0.3s ease-out" }}>
                    {toast.type === "success" ? <CheckCircle size={24} color={brand.cloudGreen} /> : <AlertTriangle size={24} color="#ef4444" />}
                    <div><h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "700", color: brand.textMain }}>{toast.type === "success" ? "Success" : "Alert"}</h4><p style={{ margin: 0, fontSize: "13px", color: brand.textLight }}>{toast.message}</p></div>
                    <button onClick={() => setToast({ ...toast, show: false })} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: "10px" }}><X size={16} color="#94a3b8" /></button>
                    <style>{`@keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }`}</style>
                </div>
            )}
        </div>
    );
};

export default StudentDashboard;