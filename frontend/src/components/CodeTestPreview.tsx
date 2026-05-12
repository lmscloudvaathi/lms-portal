import { useState } from "react";
import axios from "axios";
import API_BASE_URL from '../config';
import { runTestCasesLocally } from '../utils/pyodideEnv';
import { CODE_TEMPLATES } from '../utils/codeTemplates';

import {
  Play, CheckCircle, XCircle, AlertTriangle,
  Clock, RefreshCw, Cloud, Code, Terminal, Monitor
} from "lucide-react";

export const CodeTestPreview = ({ lesson }: { lesson: any }) => {
  // Parsing the stored JSON config from the backend
  const config = lesson.test_config ? (typeof lesson.test_config === "string" ? JSON.parse(lesson.test_config) : lesson.test_config) : { difficulty: "Easy", timeLimit: 1000, testCases: [] };

  // State
  const [code, setCode] = useState(CODE_TEMPLATES.python);
  const [consoleOutput, setConsoleOutput] = useState("Output will appear here after running your code...");
  const [activeTab, setActiveTab] = useState<"input" | "expected">("input");

  const [canSubmit, setCanSubmit] = useState(false);
  const [activeCaseIndex] = useState(0);

  const [isRunning, setIsRunning] = useState(false);
  const [testResults, setTestResults] = useState<any[]>([]);

  // Toast State
  const [toast, setToast] = useState<{ show: boolean; message: string; type: "success" | "error" }>({
    show: false, message: "", type: "success"
  });

  // Toast Helper Function
  const triggerToast = (message: string, type: "success" | "error" = "success") => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast(prev => ({ ...prev, show: false })), 3000);
  };


  // 🟢 HANDLE RUN CODE (Run Code / Dry Run)
  const handleRunCode = async () => {
    if (!config.testCases.length) {
      triggerToast("No test cases defined.", "error");
      return;
    }

    setIsRunning(true);
    setConsoleOutput("Initializing...");
    setCanSubmit(false); // 🔒 Lock Submit until success

    // 🟢 1. CLIENT-SIDE CHECK (Pyodide)
    // Run locally first to save server costs on syntax errors
    const isPython = true; // Still defaulting to Python for this component

    if (isPython) {
      setConsoleOutput("🔹 Running Local Test Cases (Pyodide)...");
      // Use the NEW strict test runner
      const localRes = await runTestCasesLocally(code, config.testCases);

      if (!localRes.success) {
        setConsoleOutput(`❌ Execution Failed:\n${localRes.error || localRes.output}`);
        setIsRunning(false);
        triggerToast("Local Tests Failed", "error");
        return;
      }

      // Success!
      setConsoleOutput(localRes.output); // Display detailed pass/fail per case
      setCanSubmit(true); // 🔓 Unlock Submit
      triggerToast("All Local Tests Passed!", "success");
      setIsRunning(false);
      return;
    }

    // 🔵 2. SERVER-SIDE EXECUTION (Java/C++) - DRY RUN
    // If we supported other languages here, we'd do a server dry run of ALL cases.
    try {
      setConsoleOutput("🚀 specific language test on Server...");
      const res = await axios.post(`${API_BASE_URL}/execute`, {
        source_code: code,
        language_id: 71, // Defaulting Python for this preview, but logic handles others if extended
        test_cases: config.testCases
      }, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

      const report = res.data;
      if (report.error) {
        setConsoleOutput(`Server Error: ${report.error}`);
      } else {
        const passed = report.stats?.passed || 0;
        const total = report.stats?.total || 0;

        let outputStr = `Execution Complete.\nPassed: ${passed}/${total}\nRuntime: ${report.stats?.runtime_ms}ms\n\n`;
        (report.results || []).forEach((r: any) => {
          outputStr += `${r.status === "Passed" ? "✅" : "❌"} Case ${r.id + 1}: ${r.status}\n`;
          if (r.status !== "Passed") outputStr += `   Input: ${r.input}\n   Expected: ${r.expected}\n   Actual: ${r.actual}\n\n`;
        });
        setConsoleOutput(outputStr);

        if (total > 0 && passed === total) {
          setCanSubmit(true);
          triggerToast("All tests passed!", "success");
        } else {
          triggerToast("Tests failed.", "error");
        }
      }

    } catch (err: any) {
      setConsoleOutput(`System Error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  // Submit: run all tests on the server
  const handleSubmit = async () => {
    if (!canSubmit) {
      triggerToast("Please run code successfully first.", "error");
      return;
    }

    if (!config.testCases.length) {
      triggerToast("No test cases defined.", "error");
      return;
    }

    setIsRunning(true);
    setConsoleOutput("🚀 Running all test cases on the server...");

    try {
      // Send ALL cases in ONE request
      const res = await axios.post(`${API_BASE_URL}/execute`, {
        source_code: code,
        language_id: 71,
        test_cases: config.testCases
      }, { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });

      const report = res.data;
      if (report.error) {
        setConsoleOutput(`Server Error: ${report.error}`);
        setIsRunning(false);
        return;
      }

      // Map API results back to UI format
      const formattedResults = (report.results || []).map((r: any) => ({
        passed: r.status === "Passed",
        actual: r.actual,
        expected: r.expected,
        input: r.input
      }));

      setTestResults(formattedResults);

      const passed = report.stats?.passed || 0;
      const total = report.stats?.total || 0;
      setConsoleOutput(`Execution Complete.\nPassed: ${passed}/${total}\nRuntime: ${report.stats?.runtime_ms}ms`);

      if (total > 0 && passed === total) triggerToast("All tests passed!", "success");

    } catch (err: any) {
      setConsoleOutput(`Connection Error: ${err.message}`);
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 lg:grid-rows-2 h-full gap-4 p-4 bg-slate-100 font-sans relative overflow-y-auto lg:overflow-hidden">

      {/* 🟦 TOP LEFT: PROBLEM DESCRIPTION */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 overflow-y-auto flex flex-col">
        <div className="flex justify-between items-start mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-800 m-0 mb-2">{lesson.title}</h2>
            <div className="flex gap-2">
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${config.difficulty === "Easy" ? "bg-green-50 text-green-700 border-green-200" :
                config.difficulty === "Medium" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                  "bg-red-50 text-red-700 border-red-200"
                }`}>
                {config.difficulty.toUpperCase()}
              </span>
              <span className="text-[10px] text-slate-500 flex items-center gap-1">
                <Clock size={12} /> {config.timeLimit}ms
              </span>
            </div>
          </div>
        </div>

        <div className="text-sm text-slate-600 leading-relaxed mb-6 whitespace-pre-wrap flex-1">
          {lesson.instructions || "No description provided."}
        </div>

        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 mt-auto">
          <h4 className="text-xs font-bold text-slate-500 uppercase mb-2">TEST CASE {activeCaseIndex + 1}</h4>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => setActiveTab("input")}
              className={`px-3 py-1 rounded text-xs font-bold transition-colors ${activeTab === "input" ? "bg-blue-100 text-[#005EB8]" : "text-slate-500 hover:bg-slate-200"}`}
            >
              Input
            </button>
            <button
              onClick={() => setActiveTab("expected")}
              className={`px-3 py-1 rounded text-xs font-bold transition-colors ${activeTab === "expected" ? "bg-blue-100 text-[#005EB8]" : "text-slate-500 hover:bg-slate-200"}`}
            >
              Expected Output
            </button>
          </div>
          <div className="font-mono text-xs text-slate-700 bg-white p-2 rounded border border-slate-200 min-h-[40px] overflow-x-auto">
            {config.testCases[activeCaseIndex] ? (activeTab === "input" ? config.testCases[activeCaseIndex].input : config.testCases[activeCaseIndex].output) : "No test case"}
          </div>
        </div>
      </div>

      {/* ⬛ TOP RIGHT: OUTPUT CONSOLE */}
      <div className="bg-[#1e1e1e] text-slate-300 rounded-xl shadow-sm border border-slate-800 p-0 flex flex-col overflow-hidden">
        <div className="bg-[#2d2d2d] px-4 py-2 border-b border-black/20 flex items-center justify-between">
          <span className="text-xs font-bold uppercase flex items-center gap-2 text-slate-400">
            <Terminal size={14} /> Terminal Output
          </span>
          {isRunning && <RefreshCw size={14} className="animate-spin text-blue-400" />}
        </div>
        <div className={`flex-1 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap overflow-y-auto ${consoleOutput.includes("Error") || consoleOutput.includes("Failed") ? "text-red-400" : "text-[#4ade80]"
          }`}>
          {consoleOutput}
        </div>
      </div>

      {/* 💻 BOTTOM LEFT: CODE EDITOR */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden p-0">
        <div className="bg-slate-50 px-4 py-2 border-b border-slate-200 flex justify-between items-center">
          <span className="text-xs font-bold text-slate-600 flex items-center gap-2">
            <Code size={14} /> PYTHON (3.8)
          </span>
          <span className="text-[10px] text-slate-400">script.py</span>
        </div>
        <textarea
          value={code}
          onChange={(e) => setCode(e.target.value)}
          spellCheck="false"
          className="flex-1 w-full border-none p-4 bg-[#0f172a] text-slate-200 font-mono text-sm leading-relaxed resize-none focus:outline-none"
        />
      </div>

      {/* 🎛️ BOTTOM RIGHT: TEST CONTROLS */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 flex flex-col">
        <h3 className="text-sm font-bold text-slate-800 mb-4 flex items-center gap-2">
          <Monitor size={16} /> Test Results
        </h3>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2 mb-4 pr-1">
          {testResults.length === 0 ? (
            <div className="text-center text-slate-400 mt-10 text-xs">
              Run tests to see results here
            </div>
          ) : (
            testResults.map((res, idx) => (
              <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border ${res.passed ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200"
                }`}>
                <div className="flex items-center gap-3">
                  {res.passed ? <CheckCircle size={16} className="text-green-600" /> : <XCircle size={16} className="text-red-600" />}
                  <span className={`text-sm font-bold ${res.passed ? "text-green-700" : "text-red-700"}`}>Case {idx + 1}</span>
                </div>
                {!res.passed && <span className="text-[10px] text-red-500 font-mono">Exp: {res.expected?.substring(0, 10)}...</span>}
              </div>
            ))
          )}
        </div>

        <div className="flex gap-3 mt-auto">
          <button
            onClick={handleRunCode}
            disabled={isRunning}
            className="flex-1 py-2.5 rounded-lg border border-slate-300 text-slate-700 font-bold text-sm hover:bg-slate-50 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isRunning ? "..." : <><Play size={16} /> Run Code</>}
          </button>
          <button
            onClick={handleSubmit}
            disabled={isRunning || !canSubmit}
            title={!canSubmit ? "Run code successfully first" : "Submit solution"}
            className={`flex-[1.5] py-2.5 rounded-lg border font-bold text-sm flex items-center justify-center gap-2 shadow-sm transition-all
              ${canSubmit
                ? "bg-[#005EB8] text-white hover:bg-[#004a94] border-transparent"
                : "bg-slate-200 text-slate-400 border-slate-300 cursor-not-allowed"}`}
          >
            {isRunning ? "Running..." : <><Cloud size={16} /> Submit</>}
          </button>
        </div>
      </div>

      {/* ✅ TOAST NOTIFICATION */}
      {toast.show && (
        <div className={`absolute top-5 right-5 z-50 px-5 py-3 rounded-lg shadow-xl flex items-center gap-3 animate-fade-in border-l-4 ${toast.type === "success" ? "bg-white border-green-500 text-slate-800" : "bg-white border-red-500 text-slate-800"
          }`}>
          {toast.type === "success" ? <CheckCircle size={20} className="text-green-500" /> : <AlertTriangle size={20} className="text-red-500" />}
          <div>
            <h4 className="text-sm font-bold">{toast.type === "success" ? "Success" : "Error"}</h4>
            <p className="text-xs text-slate-500">{toast.message}</p>
          </div>
        </div>
      )}
    </div>
  );
};