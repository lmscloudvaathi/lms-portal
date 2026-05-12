import { useState, useEffect } from "react";
import axios from "axios";
import API_BASE_URL from './config';
import {
    Plus, Code, X, Sparkles, Check, Trash2,
    Download, Users, CheckCircle, AlertTriangle, Pencil
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CodeArena = () => {
    const [showModal, setShowModal] = useState(false);
    const [tests, setTests] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [deletingId, setDeletingId] = useState<number | null>(null);
    const [editingTestId, setEditingTestId] = useState<number | null>(null);
    const [detailLoadingId, setDetailLoadingId] = useState<number | null>(null);

    // --- RESULTS STATE ---
    const [showResultsModal, setShowResultsModal] = useState(false);
    const [resultsLoading, setResultsLoading] = useState(false);
    const [selectedTestResults, setSelectedTestResults] = useState<any[]>([]);
    const [selectedTestTitle, setSelectedTestTitle] = useState("");
    const [resultsTestId, setResultsTestId] = useState<number | null>(null);

    // --- CHALLENGE SETTINGS (Global) ---
    const [challengeTitle, setChallengeTitle] = useState("");
    const [passKey, setPassKey] = useState("");
    const [timeLimit, setTimeLimit] = useState(60);

    // --- CURRENT PROBLEM STATE ---
    const [probTitle, setProbTitle] = useState("");
    const [probDesc, setProbDesc] = useState("");
    const [difficulty] = useState("Easy");
    const [testCases, setTestCases] = useState([{ input: "", output: "", hidden: false }]);
    const [aiLoading, setAiLoading] = useState(false);

    // --- PROBLEM LIST (Shopping Cart) ---
    const [addedProblems, setAddedProblems] = useState<any[]>([]);

    // ✅ NEW: Toast State
    const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({
        show: false, message: "", type: "success"
    });

    // ✅ NEW: Toast Helper
    const triggerToast = (message: string, type: "success" | "error" = "success") => {
        setToast({ show: true, message, type });
        setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
    };

    useEffect(() => {
        fetchTests();
    }, []);

    const fetchTests = async () => {
        const token = localStorage.getItem("token");
        try {
            const res = await axios.get(`${API_BASE_URL}/code-tests`, { headers: { Authorization: `Bearer ${token}` } });
            setTests(res.data);
        } catch (err) { console.error(err); }
    };

    const resetChallengeForm = () => {
        setEditingTestId(null);
        setChallengeTitle("");
        setPassKey("");
        setTimeLimit(60);
        setAddedProblems([]);
        setProbTitle("");
        setProbDesc("");
        setTestCases([{ input: "", output: "", hidden: false }]);
    };

    const closeModal = () => {
        setShowModal(false);
        resetChallengeForm();
    };

    const openCreateModal = () => {
        resetChallengeForm();
        setShowModal(true);
    };

    const caseCountLabel = (raw: string) => {
        try {
            const arr = JSON.parse(raw);
            return Array.isArray(arr) ? arr.length : 0;
        } catch {
            return "?";
        }
    };

    const handleEditChallenge = async (test: { id: number }) => {
        const token = localStorage.getItem("token");
        setDetailLoadingId(test.id);
        try {
            const res = await axios.get(`${API_BASE_URL}/code-tests/${test.id}/manage`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setEditingTestId(test.id);
            setChallengeTitle(res.data.title);
            setPassKey(res.data.pass_key);
            setTimeLimit(res.data.time_limit);
            setAddedProblems(
                (res.data.problems || []).map((p: any) => ({
                    title: p.title,
                    description: p.description,
                    difficulty: p.difficulty || "Easy",
                    test_cases:
                        typeof p.test_cases === "string" ? p.test_cases : JSON.stringify(p.test_cases ?? []),
                }))
            );
            setProbTitle("");
            setProbDesc("");
            setTestCases([{ input: "", output: "", hidden: false }]);
            setShowModal(true);
        } catch (err) {
            console.error(err);
            triggerToast("Could not load challenge for editing.", "error");
        } finally {
            setDetailLoadingId(null);
        }
    };

    const handleDeleteChallenge = async (testId: number, title: string) => {
        if (!window.confirm(`Delete "${title}"? All problems and student results for this challenge will be removed.`)) return;
        const token = localStorage.getItem("token");
        setDeletingId(testId);
        try {
            await axios.delete(`${API_BASE_URL}/code-tests/${testId}`, { headers: { Authorization: `Bearer ${token}` } });
            setTests((prev) => prev.filter((t) => t.id !== testId));
            if (showResultsModal && resultsTestId === testId) {
                setShowResultsModal(false);
                setResultsTestId(null);
            }
            triggerToast("Challenge deleted.", "success");
        } catch (err) {
            console.error(err);
            triggerToast("Could not delete challenge.", "error");
        } finally {
            setDeletingId(null);
        }
    };

    const handleViewResults = async (testId: number, title: string) => {
        setSelectedTestTitle(title);
        setResultsTestId(testId);
        setShowResultsModal(true);
        setResultsLoading(true);

        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_BASE_URL}/code-tests/${testId}/results`, {
                headers: { Authorization: `Bearer ${token}` }
            });

            const uniqueResults = Array.from(new Map(res.data.map((item: any) => [item.student_name, item])).values());
            setSelectedTestResults(uniqueResults);
        } catch (err) {
            console.error("Failed to fetch results", err);
            triggerToast("Failed to load results", "error");
        } finally {
            setResultsLoading(false);
        }
    };

    const handleDownloadResults = () => {
        if (selectedTestResults.length === 0) {
            triggerToast("No results to download.", "error"); // ✅ Replaced Alert
            return;
        }

        const headers = "Student Name,Email,Problems Solved,Total Problems,Score %,Time Taken,Submitted At\n";
        const rows = selectedTestResults.map(r =>
            `${r.student_name},${r.email ?? ""},${r.problems_solved},${r.total_problems ?? ""},${r.completion_percent ?? r.score},${r.time_taken},${r.submitted_at ?? ""}`
        ).join("\n");

        const csvContent = "data:text/csv;charset=utf-8," + headers + rows;
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        link.setAttribute("download", `${selectedTestTitle.replace(/\s+/g, "_")}_Results.csv`);
        document.body.appendChild(link);
        link.click();
        link.remove();
        triggerToast("Results downloaded successfully!", "success"); // ✅ Added Success Toast
    };

    const handleAIGenerate = async () => {
        if (!probTitle) {
            triggerToast("Please enter a problem title first!", "error"); // ✅ Replaced Alert
            return;
        }
        setAiLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.post(`${API_BASE_URL}/ai/generate-challenge`, { title: probTitle }, { headers: { Authorization: `Bearer ${token}` } });

            setProbDesc(res.data.description);
            const parsed = typeof res.data.test_cases === "string" ? JSON.parse(res.data.test_cases) : res.data.test_cases;
            setTestCases(Array.isArray(parsed) ? parsed : [{ input: "", output: "", hidden: false }]);
            triggerToast("AI Generated Content Successfully!", "success"); // ✅ Added Success Toast
        } catch (err) {
            console.error(err);
            triggerToast("AI Generation failed.", "error"); // ✅ Replaced Alert
        } finally {
            setAiLoading(false);
        }
    };

    const handleAddTestCase = () => setTestCases([...testCases, { input: "", output: "", hidden: false }]);

    const handleTestCaseChange = (index: number, field: string, value: any) => {
        const newCases = [...testCases];
        // @ts-ignore
        newCases[index][field] = value;
        setTestCases(newCases);
    };

    const handleRemoveTestCase = (index: number) => setTestCases(testCases.filter((_, i) => i !== index));

    const addProblemToChallenge = () => {
        if (!probTitle || !probDesc) {
            triggerToast("Please fill problem details", "error"); // ✅ Replaced Alert
            return;
        }

        const newProblem = {
            title: probTitle,
            description: probDesc,
            difficulty,
            test_cases: JSON.stringify(testCases)
        };

        setAddedProblems([...addedProblems, newProblem]);
        setProbTitle(""); setProbDesc(""); setTestCases([{ input: "", output: "", hidden: false }]);
        triggerToast("Problem Added to List", "success"); // ✅ Added Success Toast
    };

    const removeProblem = (idx: number) => {
        setAddedProblems(addedProblems.filter((_, i) => i !== idx));
    };

    const handleSaveChallenge = async () => {
        if (!challengeTitle.trim() || !passKey.trim()) {
            triggerToast("Please set challenge title and pass key.", "error");
            return;
        }
        if (addedProblems.length === 0) {
            triggerToast("Please add at least one problem!", "error"); // ✅ Replaced Alert
            return;
        }
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const payload = {
                title: challengeTitle,
                pass_key: passKey,
                time_limit: timeLimit,
                problems: addedProblems
            };
            if (editingTestId) {
                await axios.patch(`${API_BASE_URL}/code-tests/${editingTestId}`, payload, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                triggerToast("Challenge updated successfully!", "success");
            } else {
                await axios.post(`${API_BASE_URL}/code-tests`, payload, { headers: { Authorization: `Bearer ${token}` } });
                triggerToast("Challenge Created Successfully!", "success");
            }
            closeModal();
            fetchTests();
        } catch (err) {
            console.error(err);
            triggerToast(editingTestId ? "Failed to update challenge" : "Failed to create challenge", "error");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col gap-6 font-sans relative">
            {/* ... (Header and List UI remains mostly the same) ... */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-extrabold text-[#1e293b]">Code Arena</h1>
                    <p className="text-sm md:text-base text-[#64748b]">Create and manage coding challenges.</p>
                </div>
                <button type="button" onClick={openCreateModal} className="w-full md:w-auto bg-[#005EB8] hover:bg-[#004a94] text-white px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-blue-200">
                    <Plus size={20} /> Create Challenge
                </button>
            </div>

            <div className="grid grid-cols-1 gap-4">
                {tests.length === 0 ? (
                    <div className="bg-[#F8FAFC] p-12 rounded-2xl text-center border-2 border-dashed border-[#cbd5e1] text-[#94a3b8]">
                        <Code size={48} className="mx-auto mb-4 opacity-20" />
                        <p>No challenges created yet.</p>
                    </div>
                ) : (
                    tests.map((test) => (
                        <div key={test.id} className="bg-[#F8FAFC] p-4 md:p-6 rounded-2xl border border-[#cbd5e1] flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:shadow-lg hover:-translate-y-1 transition-all duration-300">
                            <div className="flex items-center gap-4 md:gap-5 w-full md:w-auto">
                                <div className="w-12 h-12 md:w-14 md:h-14 bg-blue-50 rounded-2xl flex items-center justify-center text-[#005EB8] border border-blue-100 shrink-0">
                                    <Code size={24} className="md:w-7 md:h-7" />
                                </div>
                                <div className="overflow-hidden">
                                    <h3 className="font-bold text-[#1e293b] text-base md:text-lg truncate">{test.title}</h3>
                                    <div className="flex flex-wrap gap-2 md:gap-4 text-sm text-[#64748b] mt-1 font-medium">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 bg-[#87C232] rounded-full"></span> {test.time_limit} mins</span>
                                        <span className="bg-[#E2E8F0] px-2 py-0.5 rounded text-xs font-mono text-[#475569] border border-[#cbd5e1] truncate max-w-[150px]">Key: {test.pass_key}</span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex flex-col sm:flex-row w-full md:w-auto gap-2 shrink-0">
                                <button
                                    type="button"
                                    onClick={() => handleViewResults(test.id, test.title)}
                                    className="w-full sm:w-auto px-4 py-2 bg-white border border-[#cbd5e1] rounded-lg text-[#005EB8] font-bold text-sm hover:bg-[#005EB8] hover:text-white transition-all flex items-center justify-center gap-2 shadow-sm"
                                >
                                    <Users size={16} /> View Results
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleEditChallenge(test)}
                                    disabled={detailLoadingId === test.id}
                                    className="w-full sm:w-auto px-4 py-2 bg-white border border-[#cbd5e1] rounded-lg text-slate-700 font-bold text-sm hover:bg-slate-50 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
                                >
                                    <Pencil size={16} /> {detailLoadingId === test.id ? "Loading…" : "Edit"}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => handleDeleteChallenge(test.id, test.title)}
                                    disabled={deletingId === test.id}
                                    className="w-full sm:w-auto px-4 py-2 bg-white border border-red-200 rounded-lg text-red-600 font-bold text-sm hover:bg-red-50 transition-all flex items-center justify-center gap-2 shadow-sm disabled:opacity-60"
                                >
                                    <Trash2 size={16} /> {deletingId === test.id ? "Deleting…" : "Delete"}
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>

            <AnimatePresence>
                {showModal && (
                    <div className="fixed inset-0 bg-[#0f172a]/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#F8FAFC] rounded-2xl shadow-2xl w-full max-w-5xl max-h-[95vh] overflow-y-auto flex flex-col border border-[#cbd5e1]">

                            {/* Header */}
                            <div className="p-6 border-b border-[#cbd5e1] flex justify-between items-center sticky top-0 bg-[#F8FAFC]/95 backdrop-blur-md z-10">
                                <div>
                                    <h2 className="text-xl font-bold text-[#1e293b]">{editingTestId ? "Edit Challenge" : "Define New Challenge"}</h2>
                                    <p className="text-xs text-[#64748b] mt-1">
                                        {editingTestId ? "Update settings and problems, then save. Existing problem IDs will change." : "Configure test details and add coding problems."}
                                    </p>
                                </div>
                                <button type="button" onClick={closeModal} className="bg-white border border-[#cbd5e1] p-2 rounded-full hover:bg-red-50 hover:border-red-200 hover:text-red-500 transition-colors"><X size={20} /></button>
                            </div>

                            <div className="p-8 space-y-8">
                                {/* 1. Challenge Settings */}
                                <div className="bg-white p-4 md:p-6 rounded-xl border border-[#cbd5e1] shadow-sm">
                                    <h3 className="text-xs font-extrabold text-[#94a3b8] uppercase tracking-widest mb-4">Challenge Settings</h3>
                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                                        <div className="col-span-1">
                                            <label className="block text-xs font-bold text-[#475569] mb-1.5 uppercase">Title</label>
                                            <input type="text" value={challengeTitle} onChange={(e) => setChallengeTitle(e.target.value)} className="w-full p-3 bg-[#F8FAFC] border border-[#cbd5e1] rounded-lg outline-none focus:border-[#005EB8] transition-all font-semibold text-[#1e293b]" placeholder="e.g. Mid-Term Coding Exam" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[#475569] mb-1.5 uppercase">Pass Key</label>
                                            <input type="text" value={passKey} onChange={(e) => setPassKey(e.target.value)} className="w-full p-3 bg-[#F8FAFC] border border-[#cbd5e1] rounded-lg outline-none focus:border-[#005EB8] transition-all font-mono text-[#64748b]" placeholder="Secret123" />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[#475569] mb-1.5 uppercase">Time Limit (Mins)</label>
                                            <input type="number" value={timeLimit} onChange={(e) => setTimeLimit(parseInt(e.target.value))} className="w-full p-3 bg-[#F8FAFC] border border-[#cbd5e1] rounded-lg outline-none focus:border-[#005EB8] transition-all font-semibold text-[#1e293b]" />
                                        </div>
                                    </div>
                                </div>

                                <div className="flex flex-col lg:flex-row gap-8">
                                    {/* 2. Add Problem Form (Left Side) */}
                                    <div className="flex-1 space-y-5">
                                        <div className="flex justify-between items-center">
                                            <h3 className="text-xs font-extrabold text-[#94a3b8] uppercase tracking-widest">Add Problem ({addedProblems.length} added)</h3>
                                        </div>

                                        <div>
                                            <label className="block text-sm font-bold text-[#1e293b] mb-2">Problem Title</label>
                                            <input type="text" value={probTitle} onChange={(e) => setProbTitle(e.target.value)} className="w-full p-3 border border-[#cbd5e1] rounded-lg outline-none focus:border-[#005EB8] bg-white" placeholder="e.g. Fibonacci Series" />
                                        </div>

                                        {/* AI Magic Section */}
                                        <div className="flex items-start gap-3">
                                            <div className="flex-1">
                                                <label className="block text-sm font-bold text-[#1e293b] mb-2">Description</label>
                                                <textarea value={probDesc} onChange={(e) => setProbDesc(e.target.value)} rows={4} className="w-full p-3 border border-[#cbd5e1] rounded-lg outline-none focus:border-[#005EB8] text-sm leading-relaxed bg-white" placeholder="Detailed problem statement..." />
                                            </div>
                                            <button
                                                onClick={handleAIGenerate}
                                                disabled={aiLoading}
                                                className="mt-7 w-[80px] md:w-[120px] h-[110px] bg-gradient-to-br from-[#005EB8] to-[#004080] text-white rounded-xl font-bold flex flex-col items-center justify-center gap-2 hover:shadow-lg transition-all active:scale-95 border border-transparent shrink-0"
                                            >
                                                {aiLoading ? <span className="animate-spin text-2xl">⚡</span> : <Sparkles size={24} className="md:w-7 md:h-7" />}
                                                <span className="text-[9px] md:text-[10px] uppercase tracking-wider text-center">{aiLoading ? "Thinking..." : "AI Auto-Fill"}</span>
                                            </button>
                                        </div>

                                        {/* Test Cases */}
                                        <div className="bg-white p-4 rounded-xl border border-[#cbd5e1]">
                                            <div className="flex justify-between items-center mb-3">
                                                <label className="text-xs font-bold text-[#94a3b8] uppercase">Test Cases</label>
                                                <button onClick={handleAddTestCase} className="text-xs font-bold text-[#005EB8] hover:bg-blue-50 px-2 py-1 rounded transition-colors">+ Add Case</button>
                                            </div>
                                            <div className="space-y-2 max-h-[150px] overflow-y-auto pr-2 custom-scrollbar">
                                                {testCases.map((tc, idx) => (
                                                    <div key={idx} className="flex gap-2 items-center">
                                                        <span className="text-[10px] font-bold text-[#cbd5e1] w-4">#{idx + 1}</span>
                                                        <input type="text" placeholder="Input" value={tc.input} onChange={(e) => handleTestCaseChange(idx, 'input', e.target.value)} className="flex-1 p-2 text-xs border border-[#cbd5e1] rounded focus:border-[#005EB8] outline-none bg-[#F8FAFC]" />
                                                        <input type="text" placeholder="Output" value={tc.output} onChange={(e) => handleTestCaseChange(idx, 'output', e.target.value)} className="flex-1 p-2 text-xs border border-[#cbd5e1] rounded focus:border-[#005EB8] outline-none bg-[#F8FAFC]" />
                                                        <label className="flex items-center gap-1.5 cursor-pointer bg-[#F8FAFC] px-2 py-1.5 rounded border border-[#cbd5e1] hover:border-slate-300">
                                                            <input type="checkbox" checked={tc.hidden} onChange={(e) => handleTestCaseChange(idx, 'hidden', e.target.checked)} className="accent-[#005EB8]" />
                                                            <span className="text-[10px] font-bold text-[#64748b] uppercase">Hide</span>
                                                        </label>
                                                        {testCases.length > 1 && (
                                                            <button onClick={() => handleRemoveTestCase(idx)} className="p-1.5 text-[#94a3b8] hover:text-red-500 hover:bg-red-50 rounded transition-colors"><Trash2 size={14} /></button>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>

                                        <button onClick={addProblemToChallenge} className="w-full py-3 bg-[#1e293b] text-white rounded-xl font-bold hover:bg-[#0f172a] transition-all flex items-center justify-center gap-2 shadow-md">
                                            <Plus size={18} /> Add Problem to Challenge
                                        </button>
                                    </div>

                                    {/* 3. Problem List Review (Right Side) */}
                                    <div className="w-full lg:w-[300px] border-t lg:border-t-0 lg:border-l border-[#cbd5e1] pt-6 lg:pt-0 lg:pl-8">
                                        <h3 className="text-xs font-extrabold text-[#94a3b8] uppercase tracking-widest mb-4">Added Problems</h3>
                                        <div className="space-y-3">
                                            {addedProblems.length === 0 ? (
                                                <div className="text-sm text-[#94a3b8] italic text-center py-10 bg-white rounded-xl border border-dashed border-[#cbd5e1]">
                                                    No problems added yet.
                                                </div>
                                            ) : (
                                                addedProblems.map((p, i) => (
                                                    <div key={i} className="p-3 bg-white border border-[#cbd5e1] rounded-lg shadow-sm group hover:border-[#005EB8] transition-colors">
                                                        <div className="flex justify-between items-start">
                                                            <h4 className="font-bold text-[#1e293b] text-sm line-clamp-1">{p.title}</h4>
                                                            <button onClick={() => removeProblem(i)} className="text-[#cbd5e1] hover:text-red-500"><X size={14} /></button>
                                                        </div>
                                                        <p className="text-xs text-[#64748b] mt-1 line-clamp-2">{p.description}</p>
                                                        <div className="mt-2 flex gap-2">
                                                            <span className="text-[10px] bg-[#F8FAFC] px-1.5 py-0.5 rounded text-[#64748b] font-mono border border-[#cbd5e1]">{caseCountLabel(p.test_cases)} Cases</span>
                                                        </div>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="p-6 border-t border-[#cbd5e1] flex justify-end gap-3 sticky bottom-0 bg-[#F8FAFC] rounded-b-2xl">
                                <button type="button" onClick={closeModal} className="px-6 py-3 rounded-xl font-bold text-[#64748b] hover:bg-white border border-transparent hover:border-[#cbd5e1] transition-all">Cancel</button>
                                <button type="button" onClick={handleSaveChallenge} disabled={loading} className="px-8 py-3 bg-[#87C232] text-white rounded-xl font-bold hover:bg-[#76a82b] flex items-center gap-2 shadow-lg shadow-green-100 transition-all active:scale-95 disabled:opacity-70">
                                    {loading ? "Saving..." : <><Check size={18} /> {editingTestId ? "Save Changes" : "Save Complete Challenge"}</>}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* Results Modal */}
            <AnimatePresence>
                {showResultsModal && (
                    <div className="fixed inset-0 bg-[#0f172a]/60 z-50 flex items-center justify-center backdrop-blur-sm p-4">
                        <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#F8FAFC] rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col border border-[#cbd5e1] overflow-hidden">

                            <div className="p-6 border-b border-[#cbd5e1] bg-white flex justify-between items-center">
                                <div>
                                    <h2 className="text-xl font-bold text-[#1e293b]">Challenge Results</h2>
                                    <p className="text-sm text-[#64748b]">{selectedTestTitle}</p>
                                </div>
                                <div className="flex gap-3">
                                    <button onClick={handleDownloadResults} className="px-4 py-2 bg-[#005EB8] text-white rounded-lg font-bold text-sm flex items-center gap-2 hover:bg-[#004a94] transition-colors">
                                        <Download size={16} /> Download CSV
                                    </button>
                                    <button type="button" onClick={() => { setShowResultsModal(false); setResultsTestId(null); }} className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors"><X size={20} className="text-[#64748b]" /></button>
                                </div>
                            </div>

                            <div className="p-6 overflow-y-auto max-h-[70vh]">
                                {resultsLoading ? (
                                    <div className="py-20 text-center text-[#64748b]">Loading results data...</div>
                                ) : selectedTestResults.length === 0 ? (
                                    <div className="py-20 text-center text-[#94a3b8] bg-white border border-dashed border-[#cbd5e1] rounded-xl">No submissions found for this challenge yet.</div>
                                ) : (
                                    <div className="overflow-x-auto">
                                        <table className="w-full text-left border-collapse min-w-[600px]">
                                            <thead>
                                                <tr className="border-b border-[#cbd5e1] text-[#475569] text-xs uppercase tracking-wider">
                                                    <th className="p-4 font-extrabold whitespace-nowrap">Student Name</th>
                                                    <th className="p-4 font-extrabold text-center whitespace-nowrap">Completion</th>
                                                    <th className="p-4 font-extrabold text-center whitespace-nowrap">Score</th>
                                                    <th className="p-4 font-extrabold text-center whitespace-nowrap">Time Taken</th>
                                                    <th className="p-4 font-extrabold text-center whitespace-nowrap">Submitted</th>
                                                </tr>
                                            </thead>
                                            <tbody className="text-sm text-[#1e293b]">
                                                {selectedTestResults.map((result, idx) => (
                                                    <tr key={idx} className="border-b border-[#e2e8f0] hover:bg-white transition-colors">
                                                        <td className="p-4 font-semibold flex items-center gap-3 whitespace-nowrap">
                                                            <div className="w-8 h-8 rounded-full bg-[#005EB8] text-white flex items-center justify-center text-xs font-bold">{result.student_name.charAt(0)}</div>
                                                            <div className="flex flex-col">
                                                                <span>{result.student_name}</span>
                                                                {result.email && <span className="text-[11px] font-normal text-slate-500">{result.email}</span>}
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-center whitespace-nowrap">
                                                            <span className="bg-green-100 text-green-700 px-2 py-1 rounded font-bold text-xs">
                                                                {result.completion_label ?? `${result.problems_solved}/${result.total_problems ?? "?"}`}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-center font-bold text-slate-700">{result.completion_percent ?? result.score}%</td>
                                                        <td className="p-4 text-center font-mono text-[#64748b] whitespace-nowrap">{result.time_taken}</td>
                                                        <td className="p-4 text-center text-[#64748b] text-xs whitespace-nowrap">{result.submitted_at}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>

            {/* ✅ NEW: TOAST NOTIFICATION COMPONENT */}
            {toast.show && (
                <div style={{
                    position: "fixed", top: "20px", right: "20px",
                    background: "white", padding: "16px 24px", borderRadius: "12px",
                    boxShadow: "0 10px 30px -5px rgba(0,0,0,0.15)",
                    borderLeft: `6px solid ${toast.type === "success" ? "#87C232" : "#ef4444"}`,
                    display: "flex", alignItems: "center", gap: "12px", zIndex: 9999,
                    animation: "slideIn 0.3s ease-out"
                }}>
                    {toast.type === "success" ? <CheckCircle size={24} color="#87C232" /> : <AlertTriangle size={24} color="#ef4444" />}
                    <div>
                        <h4 style={{ margin: "0", fontSize: "14px", fontWeight: "700", color: "#1e293b" }}>
                            {toast.type === "success" ? "Success" : "Error"}
                        </h4>
                        <p style={{ margin: 0, fontSize: "13px", color: "#64748b" }}>{toast.message}</p>
                    </div>
                    <button onClick={() => setToast(prev => ({ ...prev, show: false }))} style={{ background: "none", border: "none", cursor: "pointer", marginLeft: "10px", color: "#94a3b8" }}>
                        <X size={16} />
                    </button>
                </div>
            )}
        </div>
    );
};

export default CodeArena;