
declare global {
    interface Window {
        loadPyodide: any;
    }
}

let pyodideInstance: any = null;

interface PyodideResult {
    success: boolean;
    output: string;
    error?: string;
    results?: any[]; // Passed/Failed details
    stats?: { passed: number; total: number };
}

// 🟢 INITIALIZE PYODIDE
const initPyodide = async () => {
    if (!pyodideInstance) {
        if (!window.loadPyodide) {
            console.warn("Pyodide script not found, waiting...");
            // Optional: You could load script dynamically here if needed
            if (!window.loadPyodide) throw new Error("Pyodide library not found. Please refresh.");
        }
        console.log("Initializing Pyodide...");
        pyodideInstance = await window.loadPyodide();
    }
    return pyodideInstance;
};

// 🔵 RUN PLAIN CODE (No Test Cases)
export const runPythonLocally = async (code: string): Promise<PyodideResult> => {
    try {
        const py = await initPyodide();

        // Redirect stdout
        py.runPython(`
      import sys
      from io import StringIO
      sys.stdout = StringIO()
    `);

        // Execute
        await py.loadPackagesFromImports(code);
        await py.runPythonAsync(code);

        // Fetch stdout
        const stdout = py.runPython("sys.stdout.getvalue()");
        return { success: true, output: stdout };

    } catch (err: any) {
        return { success: false, output: "", error: err.message };
    }
};

// 🟡 RUN CODE WITH TEST CASES (Strict Mode)
export const runTestCasesLocally = async (code: string, testCases: any[]): Promise<PyodideResult> => {
    try {
        const py = await initPyodide();

        // 1. Prepare JSON Test Cases for Python
        const testCasesJson = JSON.stringify(testCases);

        // 2. Python Test Runner Script
        // This script imports the user code (by exec) and runs it against inputs
        const runnerScript = `
import sys
import json
from io import StringIO

# Capture user print output (optional, mostly we care about return value)
sys.stdout = StringIO()

def run_tests(user_code, test_cases_json):
    results = []
    passed_count = 0
    total_count = 0

    try:
        # Define User Code in Local Scope
        exec(user_code, globals())
        
        # Check if 'solve' exists
        if 'solve' not in globals():
            return json.dumps({"error": "Function 'solve(x)' not found. Please define it."})

        test_cases = json.loads(testCasesJson)
        total_count = len(test_cases)

        def _norm(s):
            if s is None:
                return ""
            return str(s).replace("\\r\\n", "\\n").replace("\\r", "\\n").strip()

        def _pick_line(actual, exp):
            a, e = _norm(actual), _norm(exp)
            if not e or "\\n" in e:
                return a
            if "\\n" in a:
                lines = [ln.strip() for ln in a.split("\\n") if ln.strip() != ""]
                if lines:
                    return lines[-1]
            return a

        def _num(s):
            s = str(s).strip()
            if s == "":
                return None
            try:
                return float(s)
            except ValueError:
                return None

        def _judge_ok(raw_a, raw_e):
            e = _norm(raw_e)
            if e == "":
                return False, _norm(raw_a), e
            a = _norm(_pick_line(raw_a, e))
            e = _norm(e)
            if a == e:
                return True, a, e
            if " ".join(a.split()) == " ".join(e.split()):
                return True, a, e
            na, ne = _num(a), _num(e)
            if na is not None and ne is not None and (na == ne or abs(na - ne) < 1e-9):
                return True, a, e
            return False, a, e

        for i, tc in enumerate(test_cases):
            inp = tc.get('input', '')
            exp = tc.get('output', '') # Expected output
            
            try:
                # Run User Function
                # We assume input is string. If user needs int, they cast it inside 'solve'
                actual = solve(inp)
                
                is_passed, disp_a, disp_e = _judge_ok(str(actual), str(exp))
                
                if is_passed:
                    passed_count += 1
                
                results.append({
                    "id": i,
                    "passed": is_passed,
                    "input": inp,
                    "expected": disp_e,
                    "actual": disp_a
                })
            except Exception as e:
                results.append({
                    "id": i,
                    "passed": False,
                    "input": inp,
                    "expected": exp,
                    "actual": f"Error: {str(e)}"
                })

        return json.dumps({
            "stats": {"passed": passed_count, "total": total_count},
            "results": results
        })

    except Exception as e:
        return json.dumps({"error": str(e)})

# EXECUTE RUNNER
output_json = run_tests(userCode, testCasesJson)
output_json
`;

        // 3. Pass variables to Python
        py.globals.set("userCode", code);
        py.globals.set("testCasesJson", testCasesJson);

        // 4. Run Runner
        const rawResult = py.runPython(runnerScript);
        const parsedResult = JSON.parse(rawResult);

        // 5. Cleanup Globals
        py.globals.delete("userCode");
        py.globals.delete("testCasesJson");

        if (parsedResult.error) {
            return { success: false, output: "", error: parsedResult.error };
        }

        // 6. Format Return
        const isSuccess = parsedResult.stats.passed === parsedResult.stats.total && parsedResult.stats.total > 0;

        // Generate a friendly terminal output string
        let terminalOutput = `✨ Test Execution Complete!\nPassed: ${parsedResult.stats.passed}/${parsedResult.stats.total}\n\n`;

        parsedResult.results.forEach((r: any) => {
            terminalOutput += `${r.passed ? "✅ Passed" : "❌ Failed"} (Case ${r.id + 1})\n`;
            if (!r.passed) {
                terminalOutput += `   Input:    ${r.input}\n   Expected: ${r.expected}\n   Actual:   ${r.actual}\n\n`;
            }
        });

        return {
            success: isSuccess,
            output: terminalOutput,
            results: parsedResult.results,
            stats: parsedResult.stats
        };

    } catch (err: any) {
        return { success: false, output: "", error: "System Error: " + err.message };
    }
};
