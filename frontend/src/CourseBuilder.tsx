import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import API_BASE_URL from './config';
import {
    Plus, ArrowLeft, Video, HelpCircle, Zap, FileText,
    Edit3, Layout, X, Link, Clock, Radio, BookOpen, Search, ChevronDown,
    AlertCircle, Trash2, CheckCircle, Code, Edit, Sparkles
} from "lucide-react";

interface Module {
    id: number;
    title: string;
    order: number;
}

// ✅ NEW: Structure for Multiple Problems
interface CodeProblem {
    title: string;
    description: string;
    difficulty: string;
    testCases: { input: string; output: string }[];
}

interface ResourceLink {
    title: string;
    link: string;
}

interface LibraryItem {
    id: number;
    title: string;
    type: string;
    url?: string;
    course_title: string;
    module_title: string;
    instructor_name: string;
}

interface LibraryCourse {
    id: number;
    title: string;
}

interface LibraryModule {
    id: number;
    title: string;
    lesson_count: number;
}

const CourseBuilder = () => {
    const { courseId } = useParams();
    const navigate = useNavigate();

    // --- CORE STATE ---
    const [modules, setModules] = useState<Module[]>([]);
    const [newModuleTitle, setNewModuleTitle] = useState("");
    const [showAddModule, setShowAddModule] = useState(false);
    const [isPublishing, setIsPublishing] = useState(false);
    const [selectedModuleId, setSelectedModuleId] = useState<number | null>(null);

    // ✅ FIX 1: Add Loading State (Prevents Header Moving/Jumping)
    const [isLoading, setIsLoading] = useState(true);

    // ✅ NEW: Course Details State (For Hybrid Check)
    const [courseDetails, setCourseDetails] = useState<any>(null);

    // --- MODAL STATE ---
    const [activeModal, setActiveModal] = useState<string | null>(null);
    const [itemTitle, setItemTitle] = useState("");
    const [itemUrl, setItemUrl] = useState("");
    const [resourceLinks, setResourceLinks] = useState<ResourceLink[]>([{ title: "", link: "" }]);
    const [itemInstructions, setItemInstructions] = useState("");
    const [duration, setDuration] = useState("");
    const [isMandatory, setIsMandatory] = useState(false);
    const [startTime, setStartTime] = useState("");
    const [endTime, setEndTime] = useState("");
    // ✅ FIX: State for Array of Problems (Up to 3)
    const [problems, setProblems] = useState<CodeProblem[]>([
        { title: "", description: "", difficulty: "Easy", testCases: [{ input: "", output: "" }] }
    ]);
    const [activeProblemIndex, setActiveProblemIndex] = useState(0);
    const [showLibraryModal, setShowLibraryModal] = useState(false);
    const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
    const [libraryLoading, setLibraryLoading] = useState(false);
    const [libraryAdding, setLibraryAdding] = useState(false);
    const [libraryQuery, setLibraryQuery] = useState("");
    const [libraryType, setLibraryType] = useState("all");
    const [libraryCourseId, setLibraryCourseId] = useState("all");
    const [libraryCourses, setLibraryCourses] = useState<LibraryCourse[]>([]);
    const [selectedLibraryIds, setSelectedLibraryIds] = useState<number[]>([]);
    const [libraryMode, setLibraryMode] = useState<"items" | "modules">("items");
    const [sourceCourseId, setSourceCourseId] = useState("all");
    const [sourceModules, setSourceModules] = useState<LibraryModule[]>([]);
    const [selectedSourceModuleIds, setSelectedSourceModuleIds] = useState<number[]>([]);
    const [modulesLoading, setModulesLoading] = useState(false);
    const [modulesImporting, setModulesImporting] = useState(false);
    const [isTypeDropdownOpen, setIsTypeDropdownOpen] = useState(false);
    const [isCourseDropdownOpen, setIsCourseDropdownOpen] = useState(false);
    const [isSourceCourseDropdownOpen, setIsSourceCourseDropdownOpen] = useState(false);
    const typeDropdownRef = useRef<HTMLDivElement | null>(null);
    const courseDropdownRef = useRef<HTMLDivElement | null>(null);
    const sourceCourseDropdownRef = useRef<HTMLDivElement | null>(null);

    const [toast, setToast] = useState({ show: false, message: "", type: "success" });

    const [isEditingCourse, setIsEditingCourse] = useState(false);
    const [editCourseForm, setEditCourseForm] = useState({
        title: "", description: "", price: 0, image_url: "", language: ""
    });

    // Open the modal and fill it with existing data
    const handleEditCourseClick = () => {
        if (!courseDetails) return;
        setEditCourseForm({
            title: courseDetails.title || "",
            description: courseDetails.description || "",
            price: courseDetails.price || 0,
            image_url: courseDetails.image_url || "",
            language: courseDetails.language || ""
        });
        setIsEditingCourse(true);
    };

    // Save changes to backend
    const handleSaveCourseDetails = async () => {
        try {
            const token = localStorage.getItem("token");
            // Re-using the endpoint we created in the previous step
            await axios.patch(`${API_BASE_URL}/courses/${courseId}/details`, editCourseForm, {
                headers: { Authorization: `Bearer ${token}` }
            });

            // Update local state immediately so the UI reflects changes
            setCourseDetails({ ...courseDetails, ...editCourseForm });

            triggerToast("Course details updated!", "success");
            setIsEditingCourse(false);
        } catch (err) {
            console.error(err);
            triggerToast("Failed to update course details.", "error");
        }
    };

    const brand = {
        blue: "#005EB8", green: "#87C232", bg: "#E2E8F0",
        cardBg: "#F8FAFC", border: "#cbd5e1", textMain: "#1e293b", textLight: "#64748b"
    };

    const triggerToast = (message: string, type: "success" | "error" = "success") => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast({ ...toast, show: false }), 3000);
    };

    useEffect(() => { fetchModules(); }, [courseId]);

    useEffect(() => {
        const handleOutsideClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (typeDropdownRef.current && !typeDropdownRef.current.contains(target)) {
                setIsTypeDropdownOpen(false);
            }
            if (courseDropdownRef.current && !courseDropdownRef.current.contains(target)) {
                setIsCourseDropdownOpen(false);
            }
            if (sourceCourseDropdownRef.current && !sourceCourseDropdownRef.current.contains(target)) {
                setIsSourceCourseDropdownOpen(false);
            }
        };

        if (showLibraryModal) {
            document.addEventListener("mousedown", handleOutsideClick);
        }

        return () => {
            document.removeEventListener("mousedown", handleOutsideClick);
        };
    }, [showLibraryModal]);

    const fetchModules = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/courses/${courseId}/modules`, { headers: { Authorization: `Bearer ${token}` } });
            setModules(res.data);
            if (res.data.length > 0 && !selectedModuleId) setSelectedModuleId(res.data[0].id);

            // ✅ NEW: FETCH COURSE DETAILS TO CHECK TYPE
            const courseRes = await axios.get(`${API_BASE_URL}/courses/${courseId}`, { headers: { Authorization: `Bearer ${token}` } });
            setCourseDetails(courseRes.data);

        } catch (err) {
            console.error("Failed to load modules", err);
        } finally {
            // ✅ Stop loading only after data is ready (Stops Layout Shift)
            setIsLoading(false);
        }
    };

    const fetchLibraryItems = async (search = libraryQuery, type = libraryType, selectedCourseId = libraryCourseId) => {
        setLibraryLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/library/items`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    q: search || undefined,
                    content_type: type !== "all" ? type : undefined,
                    course_id: selectedCourseId !== "all" ? Number(selectedCourseId) : undefined,
                }
            });
            setLibraryItems(res.data || []);
        } catch (err: any) {
            console.error("Failed to load library items", err);
            const errorDetail = err?.response?.data?.detail;
            const statusCode = err?.response?.status;
            if (statusCode === 404) {
                triggerToast("Library API not available on backend. Restart backend and try again.", "error");
            } else if (statusCode === 401) {
                triggerToast("Session expired. Please login again.", "error");
            } else if (statusCode === 403) {
                triggerToast(errorDetail || "Only instructors can access library.", "error");
            } else {
                triggerToast(errorDetail || "Failed to load library items", "error");
            }
        } finally {
            setLibraryLoading(false);
        }
    };

    const libraryTypeOptions = [
        { value: "all", label: "All Types" },
        { value: "video", label: "Video" },
        { value: "note", label: "Note" },
        { value: "quiz", label: "Quiz" },
        { value: "code_test", label: "Code Test" },
        { value: "assignment", label: "Assignment" },
        { value: "live_class", label: "Live Class" },
        { value: "live_test", label: "Live Test" },
    ];

    const selectedTypeLabel = libraryTypeOptions.find((option) => option.value === libraryType)?.label || "All Types";
    const selectedCourseLabel =
        libraryCourseId === "all"
            ? "All Courses"
            : (libraryCourses.find((course) => String(course.id) === libraryCourseId)?.title || "All Courses");
    const selectedSourceCourseLabel =
        sourceCourseId === "all"
            ? "Select Source Course"
            : (libraryCourses.find((course) => String(course.id) === sourceCourseId)?.title || "Select Source Course");

    const fetchLibraryCourses = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/library/courses`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setLibraryCourses(res.data || []);
        } catch (err) {
            console.error("Failed to load library courses", err);
        }
    };

    const fetchSourceModules = async (selectedCourseId = sourceCourseId) => {
        if (selectedCourseId === "all") {
            setSourceModules([]);
            return;
        }
        setModulesLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/library/course-modules`, {
                headers: { Authorization: `Bearer ${token}` },
                params: { course_id: Number(selectedCourseId) }
            });
            setSourceModules(res.data || []);
        } catch (err: any) {
            triggerToast(err?.response?.data?.detail || "Failed to load source modules", "error");
            setSourceModules([]);
        } finally {
            setModulesLoading(false);
        }
    };

    const toggleSourceModuleSelection = (moduleId: number) => {
        setSelectedSourceModuleIds((prev) =>
            prev.includes(moduleId) ? prev.filter((id) => id !== moduleId) : [...prev, moduleId]
        );
    };

    const importSelectedModules = async () => {
        if (!courseId) {
            triggerToast("Target course is not available", "error");
            return;
        }
        if (selectedSourceModuleIds.length === 0) {
            triggerToast("Select at least one module to import", "error");
            return;
        }
        setModulesImporting(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(
                `${API_BASE_URL}/library/import-modules`,
                {
                    target_course_id: Number(courseId),
                    module_ids: selectedSourceModuleIds
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            triggerToast(`Imported ${selectedSourceModuleIds.length} module(s)`, "success");
            setSelectedSourceModuleIds([]);
            setShowLibraryModal(false);
            fetchModules();
        } catch (err: any) {
            triggerToast(err?.response?.data?.detail || "Failed to import modules", "error");
        } finally {
            setModulesImporting(false);
        }
    };

    const handleDeleteModule = async (moduleId: number) => {
        if (!window.confirm("Delete this module and all its items?")) return;
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_BASE_URL}/modules/${moduleId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const remaining = modules.filter((m) => m.id !== moduleId);
            setModules(remaining);

            if (selectedModuleId === moduleId) {
                setSelectedModuleId(remaining.length ? remaining[0].id : null);
            }

            triggerToast("Module deleted", "success");
        } catch (err: any) {
            triggerToast(err?.response?.data?.detail || "Failed to delete module", "error");
        }
    };

    const openLibraryModal = async () => {
        setSelectedLibraryIds([]);
        setSelectedSourceModuleIds([]);
        setLibraryMode(selectedModuleId ? "items" : "modules");
        setIsTypeDropdownOpen(false);
        setIsCourseDropdownOpen(false);
        setIsSourceCourseDropdownOpen(false);
        setSourceCourseId("all");
        setSourceModules([]);
        setShowLibraryModal(true);
        await fetchLibraryCourses();
        await fetchLibraryItems();
    };

    const toggleLibrarySelection = (itemId: number) => {
        setSelectedLibraryIds((prev) =>
            prev.includes(itemId) ? prev.filter((id) => id !== itemId) : [...prev, itemId]
        );
    };

    const addSelectedFromLibrary = async () => {
        if (!selectedModuleId) {
            triggerToast("Select a target module first", "error");
            return;
        }
        if (selectedLibraryIds.length === 0) {
            triggerToast("Select at least one library item", "error");
            return;
        }
        setLibraryAdding(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(
                `${API_BASE_URL}/library/add-to-module`,
                { module_id: selectedModuleId, item_ids: selectedLibraryIds },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            triggerToast(`${selectedLibraryIds.length} item(s) added from library`, "success");
            setShowLibraryModal(false);
            setSelectedLibraryIds([]);
        } catch (err: any) {
            triggerToast(err?.response?.data?.detail || "Failed to add library items", "error");
        } finally {
            setLibraryAdding(false);
        }
    };

    const handleAddModule = async () => {
        if (!newModuleTitle.trim()) return;
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_BASE_URL}/courses/${courseId}/modules`, { title: newModuleTitle, order: modules.length + 1 }, { headers: { Authorization: `Bearer ${token}` } });
            setNewModuleTitle(""); setShowAddModule(false); fetchModules();
            triggerToast("Module added successfully!", "success");
        } catch (err) { triggerToast("Error adding module", "error"); }
    };

    const handlePublish = async () => {
        setIsPublishing(true);
        try {
            const token = localStorage.getItem("token");
            await axios.patch(`${API_BASE_URL}/courses/${courseId}/publish`, {}, { headers: { Authorization: `Bearer ${token}` } });
            triggerToast("🎉 Course Published! It is now live.", "success");
            setTimeout(() => navigate("/dashboard/courses"), 2000);
        } catch (err) { triggerToast("Error publishing course.", "error"); } finally { setIsPublishing(false); }
    };

    // --- PROBLEM MANAGEMENT LOGIC ---
    const updateActiveProblem = (field: keyof CodeProblem, value: any) => {
        const updatedProblems = [...problems];
        // @ts-ignore
        updatedProblems[activeProblemIndex] = { ...updatedProblems[activeProblemIndex], [field]: value };
        setProblems(updatedProblems);
    };

    const addProblem = () => {
        if (problems.length >= 3) {
            triggerToast("Maximum 3 problems allowed per test.", "error");
            return;
        }
        setProblems([...problems, { title: "", description: "", difficulty: "Easy", testCases: [{ input: "", output: "" }] }]);
        setActiveProblemIndex(problems.length);
    };

    const removeProblem = (index: number) => {
        if (problems.length === 1) return triggerToast("At least one problem is required.", "error");
        const updated = problems.filter((_, i) => i !== index);
        setProblems(updated);
        setActiveProblemIndex(0);
    };

    // --- TEST CASE LOGIC ---
    const addTestCase = () => {
        const updatedProblems = [...problems];
        updatedProblems[activeProblemIndex].testCases.push({ input: "", output: "" });
        setProblems(updatedProblems);
    };

    const updateTestCase = (tcIndex: number, field: "input" | "output", val: string) => {
        const updatedProblems = [...problems];
        updatedProblems[activeProblemIndex].testCases[tcIndex][field] = val;
        setProblems(updatedProblems);
    };

    const removeTestCase = (tcIndex: number) => {
        const updatedProblems = [...problems];
        updatedProblems[activeProblemIndex].testCases = updatedProblems[activeProblemIndex].testCases.filter((_, i) => i !== tcIndex);
        setProblems(updatedProblems);
    };

    const updateResourceLink = (index: number, field: "title" | "link", value: string) => {
        setResourceLinks((prev) => prev.map((resource, i) => (i === index ? { ...resource, [field]: value } : resource)));
    };

    const addResourceLink = () => {
        setResourceLinks((prev) => [...prev, { title: "", link: "" }]);
    };

    const removeResourceLink = (index: number) => {
        setResourceLinks((prev) => {
            const next = prev.filter((_, i) => i !== index);
            return next.length ? next : [{ title: "", link: "" }];
        });
    };

    // ✅ MAIN SAVE LOGIC
    const saveContentItem = async () => {
        if (!selectedModuleId) return triggerToast("Select a module from the sidebar first!", "error");
        if (!itemTitle.trim()) return triggerToast("Please enter a title for this item.", "error");

        const token = localStorage.getItem("token");
        const typeKey = activeModal?.toLowerCase().replace(" ", "_") || "video";

        // 🔴 SPECIAL LOGIC FOR LIVE CLASS
        if (activeModal === "Live Class") {
            try {
                // 1. Activate Global Live Session
                await axios.post(`${API_BASE_URL}/live/start`, {
                    youtube_url: itemUrl,
                    topic: itemTitle
                }, { headers: { Authorization: `Bearer ${token}` } });

                // 2. Save as Lesson in Course Curriculum
                const payload = {
                    title: itemTitle,
                    type: "live_class", // Matches backend type
                    data_url: itemUrl,
                    module_id: selectedModuleId
                };
                await axios.post(`${API_BASE_URL}/content`, payload, { headers: { Authorization: `Bearer ${token}` } });

                triggerToast("🔴 Live Class Started & Added to Curriculum!", "success");
                setActiveModal(null); resetForm();
                return;
            } catch (err) {
                triggerToast("Failed to start Live Class", "error");
                return;
            }
        }

        // --- REGULAR ITEM LOGIC ---
        const payload: any = {
            title: itemTitle,
            type: typeKey, // "live_test"
            data_url: itemUrl,
            duration: duration ? parseInt(duration) : null,
            is_mandatory: isMandatory,
            instructions: itemInstructions,
            module_id: selectedModuleId,
            // ✅ ADD THESE: Send times only if they exist
            start_time: startTime || null,
            end_time: endTime || null
        };

        if (activeModal === "Video") {
            const cleanedLinks = resourceLinks
                .map((resource) => ({ title: resource.title.trim(), link: resource.link.trim() }))
                .filter((resource) => resource.title && resource.link);
            payload.resource_links = cleanedLinks;
        }

        // ✅ FIX: Package multiple problems into one JSON string
        if (activeModal === "Code Test") {
            for (let i = 0; i < problems.length; i++) {
                if (!problems[i].title.trim()) return triggerToast(`Problem ${i + 1} is missing a title!`, "error");
                if (!problems[i].description.trim()) return triggerToast(`Problem ${i + 1} is missing a description!`, "error");
            }
            const config = { problems: problems };
            payload.test_config = JSON.stringify(config);
        }

        try {
            await axios.post(`${API_BASE_URL}/content`, payload, { headers: { Authorization: `Bearer ${token}` } });
            triggerToast(`✅ ${activeModal} added successfully!`, "success");
            setActiveModal(null); resetForm();
        } catch (err) { triggerToast("Failed to save.", "error"); }
    };

    const resetForm = () => {
        setItemTitle(""); setItemUrl(""); setItemInstructions("");
        setDuration(""); setIsMandatory(false);
        setResourceLinks([{ title: "", link: "" }]);

        // ✅ ADD THESE:
        setStartTime(""); setEndTime("");

        setProblems([{ title: "", description: "", difficulty: "Easy", testCases: [{ input: "", output: "" }] }]);
        setActiveProblemIndex(0);
    };

    // Inside CourseBuilder.tsx, find the CodingCourseBuilder component and replace it with this:

    const CodingCourseBuilder = () => {
        const [activeTab, setActiveTab] = useState("Easy"); // Easy, Medium, Hard
        const [challenges, setChallenges] = useState<any[]>([]);

        // Form State
        const [cTitle, setCTitle] = useState("");
        const [cDesc, setCDesc] = useState("");
        const [cTests, setCTests] = useState([{ input: "", output: "", hidden: false }]);
        const [loadingAI, setLoadingAI] = useState(false);

        // ✅ NEW: Track which ID is being edited (null = creating new)
        const [editingId, setEditingId] = useState<number | null>(null);

        const token = localStorage.getItem("token");

        useEffect(() => { loadChallenges(); }, [courseId]);

        const loadChallenges = async () => {
            try {
                const res = await axios.get(`${API_BASE_URL}/courses/${courseId}/challenges`, { headers: { Authorization: `Bearer ${token}` } });
                setChallenges(res.data);
            } catch (e) { console.error(e); }
        };

        // ✅ NEW: Populate form when a problem is clicked
        const handleEditChallenge = (challenge: any) => {
            setEditingId(challenge.id);
            setCTitle(challenge.title);
            setCDesc(challenge.description);
            setActiveTab(challenge.difficulty); // Auto-switch tab to match problem

            try {
                // Parse existing test cases
                const parsedTests = typeof challenge.test_cases === 'string'
                    ? JSON.parse(challenge.test_cases)
                    : challenge.test_cases;
                setCTests(parsedTests);
            } catch (e) {
                setCTests([{ input: "", output: "", hidden: false }]);
            }
            // Scroll to top to see form
            window.scrollTo({ top: 0, behavior: 'smooth' });
        };

        // ✅ NEW: Delete Logic
        const handleDeleteChallenge = async (id: number, e: React.MouseEvent) => {
            e.stopPropagation(); // Prevent triggering the "Edit" click on parent div
            if (!window.confirm("Are you sure you want to delete this problem?")) return;

            try {
                await axios.delete(`${API_BASE_URL}/challenges/${id}`, { headers: { Authorization: `Bearer ${token}` } });
                triggerToast("Problem deleted successfully", "success");
                loadChallenges();
                if (editingId === id) resetForm(); // Clear form if we deleted the active one
            } catch (err) {
                triggerToast("Failed to delete problem", "error");
            }
        };

        const resetForm = () => {
            setCTitle("");
            setCDesc("");
            setCTests([{ input: "", output: "", hidden: false }]);
            setEditingId(null);
        };

        const handleAutoFill = async () => {
            if (!cTitle) return triggerToast("Enter a title first", "error");
            setLoadingAI(true);
            try {
                const res = await axios.post(`${API_BASE_URL}/ai/generate-challenge`, { title: cTitle });
                setCDesc(res.data.description);
                const parsedTests = typeof res.data.test_cases === 'string' ? JSON.parse(res.data.test_cases) : res.data.test_cases;
                setCTests(parsedTests);
                triggerToast("AI Content Generated!", "success");
            } catch (err) {
                triggerToast("AI Generation Failed. Try again.", "error");
            }
            setLoadingAI(false);
        };

        const saveChallenge = async () => {
            if (!cTitle || !cDesc) return triggerToast("Title and Description required", "error");

            try {
                // Smart Formatting for numbers/arrays
                const formattedTests = cTests.map(t => {
                    let cleanInput: any = t.input;
                    try { cleanInput = JSON.parse(t.input); }
                    catch {
                        if (t.input.includes(" ") || !isNaN(Number(t.input))) {
                            const parts = t.input.split(" ").map(p => {
                                const num = Number(p);
                                return isNaN(num) ? p : num;
                            });
                            cleanInput = parts.length === 1 ? parts[0] : parts;
                        }
                    }
                    return { ...t, input: cleanInput };
                });

                const testCasesString = JSON.stringify(formattedTests);
                const payload = {
                    title: cTitle,
                    description: cDesc,
                    difficulty: activeTab,
                    test_cases: testCasesString
                };

                if (editingId) {
                    // ✅ PATCH: Update existing
                    await axios.patch(`${API_BASE_URL}/challenges/${editingId}`, payload, { headers: { Authorization: `Bearer ${token}` } });
                    triggerToast("Problem Updated Successfully!", "success");
                } else {
                    // ✅ POST: Create new
                    await axios.post(`${API_BASE_URL}/courses/${courseId}/challenges`, payload, { headers: { Authorization: `Bearer ${token}` } });
                    triggerToast("Problem Added Successfully!", "success");
                }

                loadChallenges();
                resetForm();
            } catch (err: any) {
                triggerToast(err.response?.data?.detail || "Error saving problem", "error");
            }
        };

        const updateTestCase = (index: number, field: string, value: any) => {
            const newTests = [...cTests];
            // @ts-ignore
            newTests[index][field] = value;
            setCTests(newTests);
        };

        return (
            <div className="max-w-[1400px] mx-auto bg-slate-200 min-h-screen flex flex-col overflow-x-hidden">

                {/* ✅ HEADER: Matches Standard Builder Style */}
                <header className="flex justify-between items-center bg-white px-4 py-4 md:px-10 border-b border-slate-200 z-50 sticky top-0">
                    <div className="flex items-center gap-3 md:gap-5">
                        <button onClick={() => navigate("/dashboard/courses")} className="bg-slate-200 border-none p-2.5 rounded-full cursor-pointer hover:bg-slate-300 transition-colors">
                            <ArrowLeft size={20} color={brand.textMain} />
                        </button>

                        {/* Title & Edit Icon */}
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className="flex flex-col">
                                <h2 className="text-lg md:text-xl font-extrabold text-[#0f172a] m-0 line-clamp-1">
                                    {courseDetails?.title || "Coding Course Builder"}
                                </h2>
                                <span className="text-[10px] md:text-xs text-[#005EB8] bg-blue-100 px-2 py-0.5 rounded-md font-bold uppercase whitespace-nowrap">
                                    {courseDetails?.language}
                                </span>
                            </div>
                            <button
                                onClick={handleEditCourseClick} // ✅ Triggers the Edit Modal
                                className="bg-none border-none cursor-pointer p-1 flex items-center hover:bg-slate-100 rounded-full transition-colors"
                                title="Edit Course Details"
                            >
                                <Edit size={18} color={brand.textLight} />
                            </button>
                        </div>
                    </div>

                    <div className="flex items-center gap-2 md:gap-3 text-xs md:text-sm">
                        {/* ✅ Preview Button now works */}
                        <button onClick={() => navigate(`/dashboard/course/${courseId}/preview`)} className="px-3 py-2 md:px-5 md:py-2.5 bg-white text-[#005EB8] border border-[#005EB8] rounded-lg font-bold hover:bg-blue-50 transition-colors whitespace-nowrap">
                            Preview
                        </button>
                        <button onClick={handlePublish} disabled={isPublishing} className="px-3 py-2 md:px-6 md:py-2.5 rounded-lg border-none bg-[#87C232] text-white font-extrabold shadow-md hover:bg-[#76a928] transition-all disabled:opacity-50 whitespace-nowrap">
                            {isPublishing ? "..." : "Publish"}
                        </button>
                    </div>
                </header>

                {/* CONTENT AREA */}
                <div className="p-4 md:p-10 flex-1 overflow-y-auto">

                    {/* TABS */}
                    <div className="flex flex-wrap gap-2 md:gap-4 mb-8 justify-center">
                        {["Easy", "Medium", "Hard"].map(tab => (
                            <button key={tab} onClick={() => { setActiveTab(tab); resetForm(); }}
                                style={{ padding: "12px 40px", borderRadius: "30px", background: activeTab === tab ? brand.green : "white", color: activeTab === tab ? "white" : "#64748b", fontWeight: "800", border: activeTab === tab ? "none" : "1px solid #cbd5e1", cursor: "pointer", transition: "all 0.2s", boxShadow: "0 4px 6px rgba(0,0,0,0.05)" }}>
                                {tab} Level
                            </button>
                        ))}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_400px] gap-6 md:gap-10 max-w-6xl mx-auto">
                        {/* LEFT: FORM */}
                        <div className="bg-white p-5 md:p-8 rounded-2xl border border-slate-300 shadow-sm">
                            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "20px", alignItems: "center" }}>
                                <h3 style={{ fontSize: "18px", fontWeight: "800", color: brand.textMain }}>
                                    {editingId ? "Edit Problem" : "Add New Problem"}
                                </h3>
                                {editingId && <button onClick={resetForm} style={{ fontSize: "12px", color: brand.textLight, background: "#f1f5f9", padding: "5px 10px", borderRadius: "6px", border: "none", cursor: "pointer" }}>Cancel Edit</button>}
                            </div>

                            <div style={{ display: "flex", gap: "10px", marginBottom: "15px" }}>
                                <input value={cTitle} onChange={e => setCTitle(e.target.value)} placeholder="Problem Title (e.g. Fibonacci)" style={{ ...inputStyle, flex: 1 }} />
                                <button
                                    onClick={handleAutoFill}
                                    disabled={loadingAI}
                                    style={{
                                        padding: "0 20px",
                                        background: loadingAI ? "#cbd5e1" : "#0f172a", // ✅ Black
                                        color: "white",
                                        border: "none",
                                        borderRadius: "10px", // Slightly more rounded
                                        fontWeight: "700",
                                        fontSize: "13px",
                                        cursor: loadingAI ? "wait" : "pointer",
                                        transition: "all 0.2s",
                                        display: "flex", alignItems: "center", gap: "8px" // Flex for icon
                                    }}
                                >
                                    {loadingAI ? "Generating..." : <><Sparkles size={14} /> AI Auto Fill</>} {/* ✅ Icon instead of Emoji */}
                                </button>
                            </div>
                            <textarea rows={5} value={cDesc} onChange={e => setCDesc(e.target.value)} placeholder="Problem Description..." style={{ ...inputStyle, marginBottom: "20px", resize: "vertical" }} />

                            {/* Test Cases UI */}
                            <div style={{ background: "#f8fafc", padding: "15px", borderRadius: "12px", marginBottom: "20px", border: "1px solid #e2e8f0" }}>
                                <label style={labelStyle}>Test Cases</label>
                                {cTests.map((tc, i) => (
                                    <div key={i} style={{ display: "flex", gap: "10px", marginBottom: "10px", alignItems: "center" }}>
                                        <input placeholder="Input" value={tc.input} onChange={e => updateTestCase(i, "input", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                                        <input placeholder="Output" value={tc.output} onChange={e => updateTestCase(i, "output", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                                        <label style={{ fontSize: "12px", display: "flex", alignItems: "center", gap: "5px", cursor: "pointer", fontWeight: "600", color: brand.textLight }}>
                                            <input type="checkbox" checked={tc.hidden} onChange={e => updateTestCase(i, "hidden", e.target.checked)} /> Hidden
                                        </label>
                                        {cTests.length > 1 && <X size={16} color="#ef4444" cursor="pointer" onClick={() => { const n = cTests.filter((_, idx) => idx !== i); setCTests(n); }} />}
                                    </div>
                                ))}
                                <button onClick={() => setCTests([...cTests, { input: "", output: "", hidden: false }])} style={{ fontSize: "13px", color: brand.blue, background: "none", border: "none", cursor: "pointer", marginTop: "5px", fontWeight: "700" }}>+ Add Test Case</button>
                            </div>

                            <button
                                onClick={saveChallenge}
                                style={{
                                    width: "100%",
                                    padding: "16px",
                                    background: editingId ? "#d97706" : "#0f172a", // ✅ Black (Amber for Edit)
                                    color: "white",
                                    fontWeight: "800",
                                    borderRadius: "12px",
                                    border: "none",
                                    cursor: "pointer",
                                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
                                    marginTop: "10px",
                                    fontSize: "15px"
                                }}
                            >
                                {editingId ? "Update Problem" : `Save Problem to ${activeTab}`}
                            </button>
                        </div>

                        {/* RIGHT: LIST (With Edit/Delete Features) */}
                        <div style={{ background: "#f8fafc", padding: "20px", borderRadius: "16px", border: "1px solid #cbd5e1", height: "fit-content", maxHeight: "80vh", overflowY: "auto" }}>
                            <h3 style={{ fontSize: "16px", fontWeight: "800", marginBottom: "15px", color: brand.textMain }}>Problems in {activeTab}</h3>
                            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                {challenges.filter(c => c.difficulty === activeTab).map(c => (
                                    <div
                                        key={c.id}
                                        onClick={() => handleEditChallenge(c)} // ✅ Click to Edit
                                        style={{
                                            padding: "14px", background: "white", borderRadius: "10px", border: editingId === c.id ? `2px solid ${brand.blue}` : "1px solid #cbd5e1",
                                            fontSize: "14px", fontWeight: "600", color: brand.textMain, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", transition: "all 0.2s"
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                            <Code size={16} color={brand.blue} /> {c.title}
                                        </div>
                                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                            {/* Edit Indicator */}
                                            {editingId === c.id && <span style={{ fontSize: "10px", color: brand.blue, fontWeight: "800", background: "#dbeafe", padding: "2px 6px", borderRadius: "4px" }}>EDITING</span>}

                                            <Trash2
                                                size={16}
                                                color="#cbd5e1"
                                                style={{ cursor: "pointer", transition: "color 0.2s" }}
                                                onMouseEnter={(e) => (e.currentTarget.style.color = "#ef4444")}
                                                onMouseLeave={(e) => (e.currentTarget.style.color = "#cbd5e1")}
                                                onClick={(e) => handleDeleteChallenge(c.id, e)} // ✅ Click to Delete
                                            />
                                        </div>
                                    </div>
                                ))}
                                {challenges.filter(c => c.difficulty === activeTab).length === 0 && (
                                    <div style={{ textAlign: "center", padding: "20px", color: brand.textLight, fontSize: "13px" }}>No problems yet.</div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ✅ EDIT COURSE MODAL (Included inside CodingBuilder so it works) */}
                {isEditingCourse && (
                    <div style={modalOverlay}>
                        <div style={modalContent}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingBottom: "15px", borderBottom: `1px solid ${brand.border}` }}>
                                <h3 style={{ fontSize: "20px", fontWeight: "800", margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                                    <Edit size={20} color={brand.blue} /> Edit Course Details
                                </h3>
                                <X onClick={() => setIsEditingCourse(false)} style={{ cursor: "pointer", color: brand.textLight }} />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxHeight: "60vh", overflowY: "auto", paddingRight: "5px" }}>
                                <div>
                                    <label style={labelStyle}>Course Title</label>
                                    <input value={editCourseForm.title} onChange={(e) => setEditCourseForm({ ...editCourseForm, title: e.target.value })} style={inputStyle} />
                                </div>
                                <div>
                                    <label style={labelStyle}>Syllabus / Description PDF Link</label>
                                    <input value={editCourseForm.description} onChange={(e) => setEditCourseForm({ ...editCourseForm, description: e.target.value })} style={inputStyle} placeholder="Paste Google Drive Link..." />
                                </div>
                                <div style={{ display: "flex", gap: "20px" }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Price (INR)</label>
                                        <input type="number" value={editCourseForm.price} onChange={(e) => setEditCourseForm({ ...editCourseForm, price: parseInt(e.target.value) })} style={inputStyle} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Language</label>
                                        <select value={editCourseForm.language} onChange={(e) => setEditCourseForm({ ...editCourseForm, language: e.target.value })} style={inputStyle}>
                                            <option value="python">Python</option>
                                            <option value="java">Java</option>
                                            <option value="cpp">C++</option>
                                            <option value="javascript">JavaScript</option>
                                        </select>
                                    </div>
                                </div>
                                <div>
                                    <label style={labelStyle}>Thumbnail URL</label>
                                    <div style={{ position: "relative" }}>
                                        <Link size={18} style={{ position: "absolute", left: "14px", top: "14px", color: brand.textLight }} />
                                        <input value={editCourseForm.image_url} onChange={(e) => setEditCourseForm({ ...editCourseForm, image_url: e.target.value })} style={{ ...inputStyle, paddingLeft: "45px" }} />
                                    </div>
                                </div>
                            </div>
                            <button onClick={handleSaveCourseDetails} style={saveButton}>Save Changes</button>
                        </div>
                    </div>
                )}
                {/* End Modal */}
            </div>
        );
    };

    // ✅ LOADING SCREEN: Prevents Layout Shift / Moving Header
    if (isLoading) {
        return (
            <div style={{ height: "100vh", display: "flex", justifyContent: "center", alignItems: "center", background: brand.bg }}>
                <div style={{ textAlign: "center" }}>
                    <div style={{ width: "40px", height: "40px", border: `4px solid ${brand.border}`, borderTop: `4px solid ${brand.blue}`, borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto 15px" }}></div>
                    <style>{`@keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`}</style>
                    <p style={{ color: brand.textLight, fontWeight: "600" }}>Loading Builder...</p>
                </div>
            </div>
        );
    }

    // ✅ CONDITIONAL RENDER: SWITCH TO CODING BUILDER IF TYPE IS CODING
    if (courseDetails?.course_type === "coding") {
        return <CodingCourseBuilder />;
    }

    // --- STANDARD COURSE RENDER (FIXED DASHBOARD LAYOUT) ---
    return (
        <div className="max-w-[1400px] mx-auto bg-slate-200 min-h-screen flex flex-col overflow-x-hidden">
            {/* Header stays fixed at the top naturally because of flex column */}
            <header className="flex justify-between rounded-2xl items-center bg-white px-4 py-4 md:px-10 border-b border-slate-200 z-50 sticky top-0">
                <div className="flex items-center gap-3 md:gap-5">
                    <button onClick={() => navigate("/dashboard/courses")} className="bg-slate-200 border-none p-2.5 rounded-full cursor-pointer hover:bg-slate-300 transition-colors">
                        <ArrowLeft size={20} color={brand.textMain} />
                    </button>

                    {/* ✅ UPDATED: Dynamic Title & Edit Button */}
                    <div className="flex items-center gap-2 md:gap-3">
                        <h2 className="text-lg md:text-xl font-extrabold text-[#0f172a] m-0 line-clamp-1">
                            {courseDetails?.title || "Course Builder"}
                        </h2>
                        <button
                            onClick={handleEditCourseClick}
                            className="bg-none border-none cursor-pointer p-1 flex items-center hover:bg-slate-100 rounded-full transition-colors"
                            title="Edit Course Details"
                        >
                            <Edit size={18} color={brand.textLight} style={{ transition: "color 0.2s" }} />
                        </button>
                    </div>
                </div>

                <div className="flex items-center gap-2 md:gap-3">
                    <button
                        onClick={() => navigate(`/dashboard/course/${courseId}/CoursePreview`)}
                        className="px-3 py-2 md:px-5 md:py-2.5 bg-white text-[#005EB8] border border-[#005EB8] rounded-lg font-bold hover:bg-blue-50 transition-colors whitespace-nowrap text-xs md:text-sm"
                    >
                        Preview
                    </button>
                    <button
                        onClick={handlePublish}
                        disabled={isPublishing}
                        className="px-3 py-2 md:px-6 md:py-2.5 rounded-lg border-none bg-[#87C232] text-white font-extrabold shadow-md hover:bg-[#76a928] transition-all disabled:opacity-50 whitespace-nowrap text-xs md:text-sm"
                    >
                        {isPublishing ? "Publishing..." : "Publish Course"}
                    </button>
                </div>
            </header>

            {/* Content Area: Fills remaining height, sidebar and main sit side-by-side */}
            < div className="grid grid-cols-1 lg:grid-cols-[350px_1fr] gap-10 p-5 lg:p-10 flex-1 overflow-hidden" >
                {/* SIDEBAR: Scrolls internally */}
                < aside style={{
                    background: brand.cardBg,
                    borderRadius: "16px",
                    border: `1px solid ${brand.border}`,
                    padding: "24px",
                    height: "100%", // Fill the grid cell
                    overflowY: "auto" // Scrollbar appears HERE if list is long
                }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                        <h3 style={{ fontSize: "16px", fontWeight: "800" }}>Curriculum</h3>
                        <button onClick={() => setActiveModal("Heading")} style={{ color: brand.blue, background: "none", border: "none", fontSize: "12px", fontWeight: "700", cursor: "pointer" }}>+ New Heading</button>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                        {modules.map((m) => (
                            <div key={m.id} onClick={() => setSelectedModuleId(m.id)} style={{ display: "flex", alignItems: "center", gap: "12px", padding: "14px", background: selectedModuleId === m.id ? "#E2E8F0" : "white", borderRadius: "12px", border: selectedModuleId === m.id ? `1.5px solid ${brand.blue}` : `1px solid ${brand.border}`, cursor: "pointer", transition: "all 0.2s ease" }}>
                                <Layout size={18} color={selectedModuleId === m.id ? brand.blue : brand.textLight} />
                                <span style={{ fontSize: "14px", fontWeight: "600", color: brand.textMain, flex: 1 }}>{m.title}</span>
                                <button
                                    type="button"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteModule(m.id);
                                    }}
                                    style={{
                                        border: "none",
                                        background: "transparent",
                                        color: "#ef4444",
                                        cursor: "pointer",
                                        display: "flex",
                                        alignItems: "center",
                                        padding: "4px"
                                    }}
                                    title="Delete module"
                                >
                                    <Trash2 size={16} />
                                </button>
                            </div>
                        ))}
                        {showAddModule ? (
                            <div style={{ marginTop: "10px", padding: "15px", background: "#f1f5f9", borderRadius: "12px" }}>
                                <input autoFocus placeholder="Module Name..." value={newModuleTitle} onChange={(e) => setNewModuleTitle(e.target.value)} style={{ width: "100%", padding: "10px", borderRadius: "8px", border: `1px solid ${brand.border}`, marginBottom: "10px", outline: "none" }} />
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <button onClick={handleAddModule} style={{ flex: 1, background: brand.blue, color: "white", border: "none", padding: "10px", borderRadius: "8px", fontWeight: "700" }}>Add</button>
                                    <button onClick={() => setShowAddModule(false)} style={{ flex: 1, background: "white", border: `1px solid ${brand.border}`, padding: "10px", borderRadius: "8px" }}>Cancel</button>
                                </div>
                            </div>
                        ) : (
                            <button onClick={() => setShowAddModule(true)} style={{ width: "100%", padding: "14px", borderRadius: "12px", border: `2px dashed ${brand.border}`, color: brand.textLight, background: "none", fontWeight: "700", cursor: "pointer", marginTop: "10px" }}>+ Add Module</button>
                        )}
                    </div>
                </aside >

                {/* MAIN PANEL: Fixed in place, scrolls internally */}
                <main
                    className="p-6 lg:p-14 text-center h-full overflow-y-auto"
                    style={{
                        background: brand.cardBg,
                        borderRadius: "20px",
                        border: `1px solid ${brand.border}`,
                    }}
                >
                    <Layout size={48} color={brand.border} style={{ marginBottom: "20px" }} />
                    <h2 style={{ fontSize: "28px", fontWeight: "800", color: brand.textMain, marginBottom: "8px" }}>Create new learning item</h2>
                    <p style={{ color: brand.textLight, marginBottom: "48px" }}>Items will be added to: <span style={{ color: brand.blue, fontWeight: "700" }}>{modules.find(m => m.id === selectedModuleId)?.title || "Select a module"}</span></p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-[850px] mx-auto">
                        {[
                            { type: "Add from Library", icon: <BookOpen size={28} color={brand.blue} />, desc: "Reuse existing items" },
                            { type: "Note", icon: <Edit3 size={28} color={brand.blue} />, desc: "Drive PDF Links" },
                            { type: "Video", icon: <Video size={28} color={brand.blue} />, desc: "YouTube lessons" },
                            { type: "Quiz", icon: <HelpCircle size={28} color={brand.blue} />, desc: "Google Form Links" },
                            { type: "Code Test", icon: <Code size={28} color="#7c3aed" />, desc: "Compiler Challenges" },
                            { type: "Assignment", icon: <FileText size={28} color={brand.blue} />, desc: "PDF projects (Drive)" },
                            { type: "Live Class", icon: <Radio size={28} color="#ef4444" />, desc: "YouTube Live Link" },
                            { type: "Live Test", icon: <Zap size={28} color="#EAB308" />, desc: "Timed assessment" },
                        ].map(item => (
                            <div key={item.type} onClick={() => item.type === "Add from Library" ? openLibraryModal() : setActiveModal(item.type)} style={selectorCard}>
                                {item.icon}
                                <div style={{ textAlign: "left" }}><div style={cardTitle}>{item.type}</div><div style={cardDesc}>{item.desc}</div></div>
                            </div>
                        ))}
                    </div>
                </main >
            </div >

            {showLibraryModal && (
                <div style={modalOverlay}>
                    <div style={{ ...modalContent, maxWidth: "900px", maxHeight: "85vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
                            <h3 style={{ fontSize: "22px", fontWeight: "800", margin: 0 }}>Add from Library</h3>
                            <X onClick={() => setShowLibraryModal(false)} style={{ cursor: "pointer", color: brand.textLight }} />
                        </div>

                        <div style={{ display: "flex", gap: "10px", marginBottom: "12px" }}>
                            <button
                                type="button"
                                onClick={() => {
                                    if (!selectedModuleId) {
                                        triggerToast("Select a module first to use Items Library", "error");
                                        return;
                                    }
                                    setLibraryMode("items");
                                    setIsSourceCourseDropdownOpen(false);
                                }}
                                style={{ border: "none", background: libraryMode === "items" ? brand.blue : "#e2e8f0", color: libraryMode === "items" ? "white" : brand.textMain, padding: "10px 14px", borderRadius: "10px", fontWeight: 700, cursor: selectedModuleId ? "pointer" : "not-allowed", opacity: selectedModuleId ? 1 : 0.6 }}
                            >
                                Items Library
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    setLibraryMode("modules");
                                    setIsTypeDropdownOpen(false);
                                    setIsCourseDropdownOpen(false);
                                }}
                                style={{ border: "none", background: libraryMode === "modules" ? brand.blue : "#e2e8f0", color: libraryMode === "modules" ? "white" : brand.textMain, padding: "10px 14px", borderRadius: "10px", fontWeight: 700, cursor: "pointer" }}
                            >
                                Import Modules
                            </button>
                        </div>

                        {libraryMode === "items" ? (
                            <>
                                <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr auto", gap: "10px", marginBottom: "14px", alignItems: "end", padding: "10px", background: "#f1f5f9", border: `1px solid ${brand.border}`, borderRadius: "12px" }}>
                                    <div style={{ flex: 1 }}>
                                        <label style={{ ...labelStyle, marginBottom: "6px" }}>Search</label>
                                        <div style={{ position: "relative" }}>
                                            <Search size={16} style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: brand.textLight, pointerEvents: "none" }} />
                                            <input
                                                value={libraryQuery}
                                                onChange={(e) => setLibraryQuery(e.target.value)}
                                                placeholder="Search by title, course, module, instructor..."
                                                style={{ ...inputStyle, paddingLeft: "36px", background: "#ffffff", borderColor: "#94a3b8" }}
                                            />
                                        </div>
                                    </div>
                                    <div ref={typeDropdownRef} style={{ position: "relative" }}>
                                        <label style={{ ...labelStyle, marginBottom: "6px" }}>Type</label>
                                        <div style={{ position: "relative" }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsTypeDropdownOpen((prev) => !prev);
                                                    setIsCourseDropdownOpen(false);
                                                }}
                                                style={{
                                                    ...inputStyle,
                                                    width: "100%",
                                                    paddingRight: "36px",
                                                    background: "#ffffff",
                                                    borderColor: "#94a3b8",
                                                    fontWeight: 600,
                                                    textAlign: "left",
                                                    cursor: "pointer"
                                                }}
                                            >
                                                {selectedTypeLabel}
                                            </button>
                                            <ChevronDown size={16} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: brand.textLight, pointerEvents: "none" }} />
                                            {isTypeDropdownOpen && (
                                                <div
                                                    style={{
                                                        position: "absolute",
                                                        top: "calc(100% + 6px)",
                                                        left: 0,
                                                        right: 0,
                                                        zIndex: 1200,
                                                        background: "white",
                                                        border: `1px solid ${brand.border}`,
                                                        borderRadius: "10px",
                                                        boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
                                                        maxHeight: "240px",
                                                        overflowY: "auto",
                                                        padding: "6px"
                                                    }}
                                                >
                                                    {libraryTypeOptions.map((option) => (
                                                        <button
                                                            key={option.value}
                                                            type="button"
                                                            onClick={() => {
                                                                setLibraryType(option.value);
                                                                setIsTypeDropdownOpen(false);
                                                            }}
                                                            style={{
                                                                width: "100%",
                                                                textAlign: "left",
                                                                border: "none",
                                                                background: libraryType === option.value ? "#eff6ff" : "transparent",
                                                                color: libraryType === option.value ? "#1d4ed8" : brand.textMain,
                                                                padding: "10px 12px",
                                                                borderRadius: "8px",
                                                                cursor: "pointer",
                                                                fontWeight: libraryType === option.value ? 700 : 500,
                                                                fontSize: "14px"
                                                            }}
                                                        >
                                                            {option.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div ref={courseDropdownRef} style={{ position: "relative" }}>
                                        <label style={{ ...labelStyle, marginBottom: "6px" }}>Course</label>
                                        <div style={{ position: "relative" }}>
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setIsCourseDropdownOpen((prev) => !prev);
                                                    setIsTypeDropdownOpen(false);
                                                }}
                                                style={{
                                                    ...inputStyle,
                                                    width: "100%",
                                                    paddingRight: "36px",
                                                    background: "#ffffff",
                                                    borderColor: "#94a3b8",
                                                    fontWeight: 600,
                                                    textAlign: "left",
                                                    cursor: "pointer",
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis"
                                                }}
                                            >
                                                {selectedCourseLabel}
                                            </button>
                                            <ChevronDown size={16} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: brand.textLight, pointerEvents: "none" }} />
                                            {isCourseDropdownOpen && (
                                                <div
                                                    style={{
                                                        position: "absolute",
                                                        top: "calc(100% + 6px)",
                                                        left: 0,
                                                        right: 0,
                                                        zIndex: 1200,
                                                        background: "white",
                                                        border: `1px solid ${brand.border}`,
                                                        borderRadius: "10px",
                                                        boxShadow: "0 12px 30px rgba(15,23,42,0.12)",
                                                        maxHeight: "240px",
                                                        overflowY: "auto",
                                                        padding: "6px"
                                                    }}
                                                >
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setLibraryCourseId("all");
                                                            setIsCourseDropdownOpen(false);
                                                        }}
                                                        style={{
                                                            width: "100%",
                                                            textAlign: "left",
                                                            border: "none",
                                                            background: libraryCourseId === "all" ? "#eff6ff" : "transparent",
                                                            color: libraryCourseId === "all" ? "#1d4ed8" : brand.textMain,
                                                            padding: "10px 12px",
                                                            borderRadius: "8px",
                                                            cursor: "pointer",
                                                            fontWeight: libraryCourseId === "all" ? 700 : 500,
                                                            fontSize: "14px"
                                                        }}
                                                    >
                                                        All Courses
                                                    </button>
                                                    {libraryCourses.map((course) => (
                                                        <button
                                                            key={course.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setLibraryCourseId(String(course.id));
                                                                setIsCourseDropdownOpen(false);
                                                            }}
                                                            style={{
                                                                width: "100%",
                                                                textAlign: "left",
                                                                border: "none",
                                                                background: libraryCourseId === String(course.id) ? "#eff6ff" : "transparent",
                                                                color: libraryCourseId === String(course.id) ? "#1d4ed8" : brand.textMain,
                                                                padding: "10px 12px",
                                                                borderRadius: "8px",
                                                                cursor: "pointer",
                                                                fontWeight: libraryCourseId === String(course.id) ? 700 : 500,
                                                                fontSize: "14px"
                                                            }}
                                                            title={course.title}
                                                        >
                                                            {course.title}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setIsTypeDropdownOpen(false);
                                            setIsCourseDropdownOpen(false);
                                            fetchLibraryItems();
                                        }}
                                        style={{ padding: "0 20px", height: "48px", borderRadius: "10px", border: "none", background: brand.blue, color: "white", fontWeight: 700, cursor: "pointer", boxShadow: "0 6px 16px rgba(0,94,184,0.25)" }}
                                    >
                                        Search
                                    </button>
                                </div>

                                <div style={{ fontSize: "12px", color: brand.textLight, marginBottom: "10px" }}>
                                    Target Module: <span style={{ color: brand.blue, fontWeight: 700 }}>{modules.find((m) => m.id === selectedModuleId)?.title || "Not selected"}</span>
                                </div>

                                <div style={{ overflowY: "auto", border: `1px solid ${brand.border}`, borderRadius: "12px", background: "white", flex: 1, minHeight: 0 }}>
                                    {libraryLoading ? (
                                        <div style={{ padding: "30px", textAlign: "center", color: brand.textLight }}>Loading library...</div>
                                    ) : libraryItems.length === 0 ? (
                                        <div style={{ padding: "30px", textAlign: "center", color: brand.textLight }}>No library items found.</div>
                                    ) : (
                                        libraryItems.map((item) => (
                                            <label
                                                key={item.id}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "flex-start",
                                                    gap: "12px",
                                                    padding: "14px 16px",
                                                    borderBottom: `1px solid ${brand.border}`,
                                                    cursor: "pointer",
                                                    background: selectedLibraryIds.includes(item.id) ? "#eff6ff" : "white"
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedLibraryIds.includes(item.id)}
                                                    onChange={() => toggleLibrarySelection(item.id)}
                                                    style={{ marginTop: "3px" }}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 700, color: brand.textMain, marginBottom: "3px" }}>{item.title}</div>
                                                    <div style={{ fontSize: "11px", color: brand.textLight, display: "flex", gap: "10px", flexWrap: "wrap" }}>
                                                        <span style={{ fontWeight: 700, textTransform: "uppercase", color: "#334155" }}>{item.type}</span>
                                                        <span>Course: {item.course_title}</span>
                                                        <span>Module: {item.module_title}</span>
                                                        <span>Instructor: {item.instructor_name}</span>
                                                    </div>
                                                </div>
                                            </label>
                                        ))
                                    )}
                                </div>

                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", paddingTop: "12px", borderTop: `1px solid ${brand.border}` }}>
                                    <div style={{ fontSize: "13px", color: brand.textLight }}>
                                        Selected: <span style={{ color: brand.textMain, fontWeight: 700 }}>{selectedLibraryIds.length}</span>
                                    </div>
                                    <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowLibraryModal(false)}
                                            style={{ padding: "10px 16px", borderRadius: "10px", border: `1px solid ${brand.border}`, background: "white", color: brand.textMain, fontWeight: 700, cursor: "pointer" }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={addSelectedFromLibrary}
                                            disabled={libraryAdding}
                                            style={{ padding: "10px 16px", borderRadius: "10px", border: "none", background: brand.green, color: "white", fontWeight: 800, cursor: "pointer", opacity: libraryAdding ? 0.7 : 1 }}
                                        >
                                            {libraryAdding ? "Adding..." : "Add Selected to Module"}
                                        </button>
                                    </div>
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "10px", marginBottom: "14px", alignItems: "end", padding: "10px", background: "#f1f5f9", border: `1px solid ${brand.border}`, borderRadius: "12px" }}>
                                    <div ref={sourceCourseDropdownRef} style={{ position: "relative" }}>
                                        <label style={{ ...labelStyle, marginBottom: "6px" }}>Source Course</label>
                                        <div style={{ position: "relative" }}>
                                            <button
                                                type="button"
                                                onClick={() => setIsSourceCourseDropdownOpen((prev) => !prev)}
                                                style={{
                                                    ...inputStyle,
                                                    width: "100%",
                                                    paddingRight: "36px",
                                                    background: "#ffffff",
                                                    borderColor: "#94a3b8",
                                                    fontWeight: 600,
                                                    textAlign: "left",
                                                    cursor: "pointer",
                                                    whiteSpace: "nowrap",
                                                    overflow: "hidden",
                                                    textOverflow: "ellipsis"
                                                }}
                                            >
                                                {selectedSourceCourseLabel}
                                            </button>
                                            <ChevronDown size={16} style={{ position: "absolute", right: "12px", top: "50%", transform: "translateY(-50%)", color: brand.textLight, pointerEvents: "none" }} />
                                            {isSourceCourseDropdownOpen && (
                                                <div style={{ position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 1200, background: "white", border: `1px solid ${brand.border}`, borderRadius: "10px", boxShadow: "0 12px 30px rgba(15,23,42,0.12)", maxHeight: "240px", overflowY: "auto", padding: "6px" }}>
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            setSourceCourseId("all");
                                                            setIsSourceCourseDropdownOpen(false);
                                                            setSourceModules([]);
                                                        }}
                                                        style={{ width: "100%", textAlign: "left", border: "none", background: sourceCourseId === "all" ? "#eff6ff" : "transparent", color: sourceCourseId === "all" ? "#1d4ed8" : brand.textMain, padding: "10px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: sourceCourseId === "all" ? 700 : 500, fontSize: "14px" }}
                                                    >
                                                        Select Source Course
                                                    </button>
                                                    {libraryCourses.map((course) => (
                                                        <button
                                                            key={course.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setSourceCourseId(String(course.id));
                                                                setIsSourceCourseDropdownOpen(false);
                                                            }}
                                                            style={{ width: "100%", textAlign: "left", border: "none", background: sourceCourseId === String(course.id) ? "#eff6ff" : "transparent", color: sourceCourseId === String(course.id) ? "#1d4ed8" : brand.textMain, padding: "10px 12px", borderRadius: "8px", cursor: "pointer", fontWeight: sourceCourseId === String(course.id) ? 700 : 500, fontSize: "14px" }}
                                                        >
                                                            {course.title}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => fetchSourceModules()}
                                        disabled={sourceCourseId === "all"}
                                        style={{ padding: "0 20px", height: "48px", borderRadius: "10px", border: "none", background: brand.blue, color: "white", fontWeight: 700, cursor: sourceCourseId === "all" ? "not-allowed" : "pointer", opacity: sourceCourseId === "all" ? 0.6 : 1 }}
                                    >
                                        Load Modules
                                    </button>
                                </div>

                                <div style={{ fontSize: "12px", color: brand.textLight, marginBottom: "10px" }}>
                                    Target Course: <span style={{ color: brand.blue, fontWeight: 700 }}>{courseDetails?.title || `Course ${courseId}`}</span>
                                </div>

                                <div style={{ overflowY: "auto", border: `1px solid ${brand.border}`, borderRadius: "12px", background: "white", flex: 1, minHeight: 0 }}>
                                    {modulesLoading ? (
                                        <div style={{ padding: "30px", textAlign: "center", color: brand.textLight }}>Loading modules...</div>
                                    ) : sourceModules.length === 0 ? (
                                        <div style={{ padding: "30px", textAlign: "center", color: brand.textLight }}>No modules loaded. Select a source course and click "Load Modules".</div>
                                    ) : (
                                        sourceModules.map((module) => (
                                            <label
                                                key={module.id}
                                                style={{
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "12px",
                                                    padding: "14px 16px",
                                                    borderBottom: `1px solid ${brand.border}`,
                                                    cursor: "pointer",
                                                    background: selectedSourceModuleIds.includes(module.id) ? "#eff6ff" : "white"
                                                }}
                                            >
                                                <input
                                                    type="checkbox"
                                                    checked={selectedSourceModuleIds.includes(module.id)}
                                                    onChange={() => toggleSourceModuleSelection(module.id)}
                                                />
                                                <div style={{ flex: 1 }}>
                                                    <div style={{ fontWeight: 700, color: brand.textMain }}>{module.title}</div>
                                                    <div style={{ fontSize: "12px", color: brand.textLight }}>{module.lesson_count} item(s)</div>
                                                </div>
                                            </label>
                                        ))
                                    )}
                                </div>

                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: "14px", paddingTop: "12px", borderTop: `1px solid ${brand.border}` }}>
                                    <div style={{ fontSize: "13px", color: brand.textLight }}>
                                        Selected Modules: <span style={{ color: brand.textMain, fontWeight: 700 }}>{selectedSourceModuleIds.length}</span>
                                    </div>
                                    <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                                        <button
                                            type="button"
                                            onClick={() => setShowLibraryModal(false)}
                                            style={{ padding: "10px 16px", borderRadius: "10px", border: `1px solid ${brand.border}`, background: "white", color: brand.textMain, fontWeight: 700, cursor: "pointer" }}
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            type="button"
                                            onClick={importSelectedModules}
                                            disabled={modulesImporting}
                                            style={{ padding: "10px 16px", borderRadius: "10px", border: "none", background: brand.green, color: "white", fontWeight: 800, cursor: "pointer", opacity: modulesImporting ? 0.7 : 1 }}
                                        >
                                            {modulesImporting ? "Importing..." : "Import Selected Modules"}
                                        </button>
                                    </div>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {activeModal && (
                <div style={modalOverlay}>
                    <div style={modalContent}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
                            <h3 style={{ fontSize: "22px", fontWeight: "800", margin: 0 }}>Add {activeModal}</h3>
                            <X onClick={() => setActiveModal(null)} style={{ cursor: "pointer", color: brand.textLight }} />
                        </div>

                        {activeModal === "Code Test" ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxHeight: "60vh", overflowY: "auto", paddingRight: "10px" }}>
                                <div><label style={labelStyle}>Overall Test Title</label><input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="e.g. Data Structures Final Exam" style={inputStyle} /></div>

                                {/* ✅ TABS FOR PROBLEMS */}
                                <div style={{ display: "flex", gap: "10px", borderBottom: `1px solid ${brand.border}`, paddingBottom: "10px" }}>
                                    {problems.map((_, idx) => (
                                        <div key={idx} onClick={() => setActiveProblemIndex(idx)} style={{ padding: "8px 16px", borderRadius: "8px", background: activeProblemIndex === idx ? brand.blue : "#f1f5f9", color: activeProblemIndex === idx ? "white" : brand.textLight, cursor: "pointer", fontWeight: "700", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px" }}>
                                            Problem {idx + 1}
                                            {problems.length > 1 && (<X size={12} onClick={(e) => { e.stopPropagation(); removeProblem(idx); }} />)}
                                        </div>
                                    ))}
                                    {problems.length < 3 && (<button onClick={addProblem} style={{ background: "none", border: `1px dashed ${brand.blue}`, color: brand.blue, borderRadius: "8px", padding: "4px 12px", cursor: "pointer" }}><Plus size={16} /></button>)}
                                </div>

                                <div style={{ padding: "10px", background: "#f8fafc", borderRadius: "12px", border: `1px solid ${brand.border}` }}>
                                    <div style={{ marginBottom: "15px" }}><label style={labelStyle}>Problem Title</label><input value={problems[activeProblemIndex].title} onChange={(e) => updateActiveProblem("title", e.target.value)} placeholder="e.g. Reverse a String" style={inputStyle} /></div>
                                    <div style={{ marginBottom: "15px" }}><label style={labelStyle}>Difficulty</label><select value={problems[activeProblemIndex].difficulty} onChange={(e) => updateActiveProblem("difficulty", e.target.value)} style={inputStyle}><option>Easy</option><option>Medium</option><option>Hard</option></select></div>
                                    <div style={{ marginBottom: "15px" }}><label style={labelStyle}>Problem Description</label><textarea rows={4} value={problems[activeProblemIndex].description} onChange={(e) => updateActiveProblem("description", e.target.value)} placeholder="Explain the logic required..." style={{ ...inputStyle, resize: "vertical" }} /></div>
                                    <div>
                                        <label style={labelStyle}>Test Cases</label>
                                        {problems[activeProblemIndex].testCases.map((tc, idx) => (
                                            <div key={idx} style={{ background: "white", padding: "10px", borderRadius: "8px", border: `1px solid ${brand.border}`, marginBottom: "8px" }}>
                                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "5px" }}>
                                                    <span style={{ fontSize: "11px", fontWeight: "700", color: brand.textLight }}>CASE {idx + 1}</span>
                                                    {problems[activeProblemIndex].testCases.length > 1 && <Trash2 size={14} color="#ef4444" cursor="pointer" onClick={() => removeTestCase(idx)} />}
                                                </div>
                                                <div style={{ display: "flex", gap: "10px" }}>
                                                    <input placeholder="Input" value={tc.input} onChange={(e) => updateTestCase(idx, "input", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                                                    <input placeholder="Output" value={tc.output} onChange={(e) => updateTestCase(idx, "output", e.target.value)} style={{ ...inputStyle, flex: 1 }} />
                                                </div>
                                            </div>
                                        ))}
                                        <button onClick={addTestCase} style={{ fontSize: "13px", color: brand.blue, background: "none", border: "none", cursor: "pointer", fontWeight: "700", display: "flex", alignItems: "center", gap: "5px", marginTop: "5px" }}>+ Add Test Case</button>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
                                <div><label style={labelStyle}>{activeModal === "Heading" ? "Heading Name" : "Item Title"}</label><input value={itemTitle} onChange={(e) => setItemTitle(e.target.value)} placeholder="e.g. Phase 1: Basics" style={inputStyle} /></div>
                                {activeModal === "Assignment" && (<div><label style={labelStyle}>Description (Optional)</label><textarea rows={3} value={itemInstructions} onChange={(e) => setItemInstructions(e.target.value)} placeholder="Explain what students need to do..." style={{ ...inputStyle, resize: "vertical" }} /></div>)}
                                {activeModal !== "Heading" && (
                                    <>
                                        <div>
                                            <label style={labelStyle}>
                                                {activeModal === "Assignment" ? "Submission Drive Link (Google Form/Folder)"
                                                    : activeModal === "Note" ? "Google Drive PDF Link"
                                                        : "YouTube / Google Form / App Script Link"}
                                            </label><div style={{ position: "relative" }}><Link size={18} style={{ position: "absolute", left: "14px", top: "14px", color: brand.textLight }} /><input value={itemUrl} onChange={(e) => setItemUrl(e.target.value)} placeholder="https://..." style={{ ...inputStyle, paddingLeft: "45px" }} /></div></div>
                                        {activeModal === "Video" && (
                                            <div>
                                                <label style={labelStyle}>Resource Links (Optional)</label>
                                                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                                    {resourceLinks.map((resourceLink, idx) => (
                                                        <div key={idx} style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                                                            <input
                                                                value={resourceLink.title}
                                                                onChange={(e) => updateResourceLink(idx, "title", e.target.value)}
                                                                placeholder="Resource title (e.g. Worksheet PDF)"
                                                                style={{ ...inputStyle, flex: 1 }}
                                                            />
                                                            <input
                                                                value={resourceLink.link}
                                                                onChange={(e) => updateResourceLink(idx, "link", e.target.value)}
                                                                placeholder="https://resource-link..."
                                                                style={{ ...inputStyle, flex: 1 }}
                                                            />
                                                            {resourceLinks.length > 1 && (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => removeResourceLink(idx)}
                                                                    style={{
                                                                        border: "none",
                                                                        background: "#fee2e2",
                                                                        color: "#dc2626",
                                                                        borderRadius: "8px",
                                                                        padding: "10px 12px",
                                                                        cursor: "pointer",
                                                                        fontWeight: 700
                                                                    }}
                                                                >
                                                                    Remove
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={addResourceLink}
                                                    style={{
                                                        marginTop: "10px",
                                                        border: "none",
                                                        background: "none",
                                                        color: brand.blue,
                                                        cursor: "pointer",
                                                        fontWeight: 700
                                                    }}
                                                >
                                                    + Add Another Resource Link
                                                </button>
                                            </div>
                                        )}
                                        {activeModal === "Assignment" && (<div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "5px" }}><input type="checkbox" id="mandatoryCheck" checked={isMandatory} onChange={(e) => setIsMandatory(e.target.checked)} style={{ width: "18px", height: "18px", cursor: "pointer" }} /><label htmlFor="mandatoryCheck" style={{ fontSize: "14px", color: "#475569", fontWeight: "600", cursor: "pointer" }}>Mark as Mandatory</label></div>)}
                                        {activeModal === "Live Test" && (
                                            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                                {/* ❌ DELETED DUPLICATE TITLE INPUT */}
                                                {/* ❌ DELETED DUPLICATE URL INPUT */}

                                                {/* ✅ ONLY KEEP THE TIME INPUTS */}
                                                <div style={{ display: 'flex', gap: '15px' }}>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={labelStyle}>Start Time</label>
                                                        <div style={{ position: "relative" }}>
                                                            <Clock size={18} style={{ position: "absolute", left: "14px", top: "14px", color: brand.textLight }} />
                                                            <input
                                                                type="datetime-local"
                                                                value={startTime}
                                                                onChange={(e) => setStartTime(e.target.value)}
                                                                style={{ ...inputStyle, paddingLeft: "45px" }}
                                                            />
                                                        </div>
                                                    </div>
                                                    <div style={{ flex: 1 }}>
                                                        <label style={labelStyle}>End Time</label>
                                                        <div style={{ position: "relative" }}>
                                                            <Clock size={18} style={{ position: "absolute", left: "14px", top: "14px", color: brand.textLight }} />
                                                            <input
                                                                type="datetime-local"
                                                                value={endTime}
                                                                onChange={(e) => setEndTime(e.target.value)}
                                                                style={{ ...inputStyle, paddingLeft: "45px" }}
                                                            />
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                        <button onClick={saveContentItem} style={saveButton}>Save {activeModal === "Code Test" ? "Test" : activeModal === "Heading" ? "Section Heading" : "Learning Item"}</button>
                    </div>
                </div>
            )}
            {/* ✅ NEW: EDIT COURSE DETAILS MODAL */}
            {
                isEditingCourse && (
                    <div style={modalOverlay}>
                        <div style={modalContent}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px", paddingBottom: "15px", borderBottom: `1px solid ${brand.border}` }}>
                                <h3 style={{ fontSize: "20px", fontWeight: "800", margin: 0, display: "flex", alignItems: "center", gap: "10px" }}>
                                    <Edit size={20} color={brand.blue} /> Edit Course Details
                                </h3>
                                <X onClick={() => setIsEditingCourse(false)} style={{ cursor: "pointer", color: brand.textLight }} />
                            </div>

                            <div style={{ display: "flex", flexDirection: "column", gap: "20px", maxHeight: "60vh", overflowY: "auto", paddingRight: "5px" }}>
                                {/* Title */}
                                <div>
                                    <label style={labelStyle}>Course Title</label>
                                    <input
                                        value={editCourseForm.title}
                                        onChange={(e) => setEditCourseForm({ ...editCourseForm, title: e.target.value })}
                                        style={inputStyle}
                                    />
                                </div>

                                {/* Description */}
                                <div>
                                    <label style={labelStyle}>Description</label>
                                    <textarea
                                        rows={3}
                                        value={editCourseForm.description}
                                        onChange={(e) => setEditCourseForm({ ...editCourseForm, description: e.target.value })}
                                        style={{ ...inputStyle, resize: "vertical" }}
                                    />
                                </div>

                                <div style={{ display: "flex", gap: "20px" }}>
                                    {/* Price */}
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Price (INR)</label>
                                        <input
                                            type="number"
                                            value={editCourseForm.price}
                                            onChange={(e) => setEditCourseForm({ ...editCourseForm, price: parseInt(e.target.value) })}
                                            style={inputStyle}
                                        />
                                    </div>
                                    {/* Language */}
                                    <div style={{ flex: 1 }}>
                                        <label style={labelStyle}>Language</label>
                                        <select
                                            value={editCourseForm.language}
                                            onChange={(e) => setEditCourseForm({ ...editCourseForm, language: e.target.value })}
                                            style={inputStyle}
                                        >
                                            <option value="python">Python</option>
                                            <option value="java">Java</option>
                                            <option value="cpp">C++</option>
                                            <option value="javascript">JavaScript</option>
                                        </select>
                                    </div>
                                </div>

                                {/* Thumbnail */}
                                <div>
                                    <label style={labelStyle}>Thumbnail URL</label>
                                    <div style={{ position: "relative" }}>
                                        <Link size={18} style={{ position: "absolute", left: "14px", top: "14px", color: brand.textLight }} />
                                        <input
                                            value={editCourseForm.image_url}
                                            onChange={(e) => setEditCourseForm({ ...editCourseForm, image_url: e.target.value })}
                                            style={{ ...inputStyle, paddingLeft: "45px" }}
                                        />
                                    </div>
                                </div>
                            </div>

                            <button onClick={handleSaveCourseDetails} style={saveButton}>Save Changes</button>
                        </div>
                    </div>
                )
            }
            {toast.show && (<div style={{ position: "fixed", top: "20px", right: "20px", zIndex: 9999, background: "white", padding: "16px 24px", borderRadius: "12px", boxShadow: "0 10px 30px -5px rgba(0,0,0,0.15)", borderLeft: `6px solid ${toast.type === "success" ? brand.green : "#ef4444"}`, display: "flex", alignItems: "center", gap: "12px", animation: "slideIn 0.3s ease-out" }}>{toast.type === "success" ? <CheckCircle size={24} color={brand.green} /> : <AlertCircle size={24} color="#ef4444" />}<div><h4 style={{ margin: "0 0 4px 0", fontSize: "14px", fontWeight: "700", color: brand.textMain }}>{toast.type === "success" ? "Success" : "Error"}</h4><p style={{ margin: 0, fontSize: "13px", color: brand.textLight }}>{toast.message}</p></div><button onClick={() => setToast({ ...toast, show: false })} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: "10px" }}><X size={16} color="#94a3b8" /></button><style>{`@keyframes slideIn { from { opacity: 0; transform: translateX(20px); } to { opacity: 1; transform: translateX(0); } }`}</style></div>)}
        </div >
    );
};

const selectorCard = { display: "flex", alignItems: "center", gap: "20px", padding: "24px", background: "white", borderRadius: "16px", border: "1.5px solid #cbd5e1", cursor: "pointer", transition: "all 0.2s ease", boxShadow: "0 2px 4px rgba(0,0,0,0.02)" };
const cardTitle = { fontSize: "16px", fontWeight: "800", color: "#1e293b", marginBottom: "4px" };
const cardDesc = { fontSize: "12px", color: "#64748b" };
const modalOverlay = { position: "fixed" as const, top: 0, left: 0, right: 0, bottom: 0, background: "rgba(15, 23, 42, 0.7)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: "20px" };
const modalContent = { background: "#F8FAFC", width: "100%", maxWidth: "600px", padding: "40px", borderRadius: "24px", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" };
const labelStyle = { display: "block", marginBottom: "8px", fontSize: "12px", fontWeight: "800", color: "#1e293b", textTransform: "uppercase" as const, letterSpacing: "0.5px" };
const inputStyle = { width: "100%", padding: "14px", borderRadius: "12px", border: "1.5px solid #cbd5e1", fontSize: "15px", outline: "none", boxSizing: "border-box" as const, background: "white" };
const saveButton = { width: "100%", padding: "16px", marginTop: "32px", background: "#005EB8", color: "white", border: "none", borderRadius: "14px", fontSize: "16px", fontWeight: "800", cursor: "pointer", boxShadow: "0 10px 15px -3px rgba(0, 94, 184, 0.3)" };

export default CourseBuilder;