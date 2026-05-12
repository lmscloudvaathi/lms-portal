"""
Code execution for /api/v1/execute.

- Python (71): runs on the same machine as FastAPI via subprocess + a small driver
  that calls the learner's `solve()` against each test case.
- C++ (54) / Java (62): try local g++/javac when present; otherwise use Judge0 CE
  (default https://ce.judge0.com — no API key for the public instance; fair-use / rate limits apply).

Set JUDGE0_API_URL if you self-host Judge0 or use another endpoint.
"""

from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import tempfile
import uuid
from typing import Any, Dict, List, Optional, Tuple

import requests

JUDGE0_API_URL = (os.getenv("JUDGE0_API_URL") or "https://ce.judge0.com").rstrip("/")

# Per-case timeouts (seconds)
PY_DRIVER_TIMEOUT = 12
NATIVE_RUN_TIMEOUT = 3
JUDGE0_REQUEST_TIMEOUT = 35


def _work_dir() -> str:
    d = os.path.join(tempfile.gettempdir(), f"lms_code_{uuid.uuid4().hex}")
    os.makedirs(d, exist_ok=True)
    return d


def _response_error(msg: str) -> Dict[str, Any]:
    return {"error": msg, "stats": {"passed": 0, "total": 0}, "results": []}


def _normalize_exe_path(work: str, base: str) -> str:
    if os.name == "nt":
        p = os.path.join(work, f"{base}.exe")
        if os.path.isfile(p):
            return p
    return os.path.join(work, base)


def run_python_local(source_code: str, test_cases: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Execute Python with embedded driver; returns dict with stats/results or error."""
    if not source_code.strip():
        return _response_error("No source code provided")

    work = _work_dir()
    try:
        script_path = os.path.join(work, "runner.py")
        driver_code = f"""
import json

# -------- USER CODE START --------
{source_code}
# -------- USER CODE END ----------

def main():
    cases = {json.dumps(test_cases)}

    solve_fn = globals().get("solve")
    if not callable(solve_fn):
        print(json.dumps({{"error": "Function solve() not found"}}))
        return

    if not cases:
        try:
            solve_fn(None)
        except Exception as e:
            print(json.dumps({{"error": str(e)}}))
        return

    results = []
    passed = 0

    for i, c in enumerate(cases):
        try:
            inp = c.get("input")
            expected = str(c.get("output", "")).strip()

            arg = inp
            if isinstance(inp, str):
                if inp.isdigit():
                    arg = int(inp)
                elif inp.replace(".", "", 1).isdigit():
                    arg = float(inp)

            actual = str(solve_fn(arg)).strip()
            status = "Passed" if actual == expected else "Failed"
            if status == "Passed":
                passed += 1

            results.append({{
                "id": i,
                "input": str(inp),
                "expected": expected,
                "actual": actual,
                "status": status
            }})

        except Exception as e:
            results.append({{
                "id": i,
                "status": "Runtime Error",
                "error": str(e)
            }})

    print(json.dumps({{
        "stats": {{"passed": passed, "total": len(cases)}},
        "results": results
    }}))

if __name__ == "__main__":
    main()
"""
        with open(script_path, "w", encoding="utf-8") as f:
            f.write(driver_code)

        cmd = [sys.executable, script_path]
        proc = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=PY_DRIVER_TIMEOUT,
            cwd=work,
        )
        raw = (proc.stdout or "") + (proc.stderr or "")
        raw = raw.strip()
        if not raw:
            return _response_error("Python runner produced no output")

        # Driver prints JSON on last line; tolerate extra logs before it
        try:
            data = json.loads(raw)
        except json.JSONDecodeError:
            for line in reversed(raw.splitlines()):
                line = line.strip()
                if line.startswith("{") and line.endswith("}"):
                    try:
                        data = json.loads(line)
                        break
                    except json.JSONDecodeError:
                        continue
            else:
                return _response_error("Python runner output is not valid JSON:\n" + raw[:800])

        if isinstance(data, dict) and data.get("error"):
            return _response_error(str(data["error"]))

        if not isinstance(data, dict) or "results" not in data:
            return _response_error("Unexpected Python runner JSON shape")

        return data
    except subprocess.TimeoutExpired:
        return _response_error("Time Limit Exceeded (Python)")
    except Exception as e:
        return _response_error(f"Python execution error: {e}")
    finally:
        try:
            for name in os.listdir(work):
                try:
                    os.remove(os.path.join(work, name))
                except OSError:
                    pass
            os.rmdir(work)
        except OSError:
            pass


def _judge0_headers() -> Dict[str, str]:
    h: Dict[str, str] = {"Content-Type": "application/json"}
    rapid = (os.getenv("JUDGE0_RAPIDAPI_KEY") or "").strip()
    if rapid:
        h["X-RapidAPI-Key"] = rapid
        h["X-RapidAPI-Host"] = (os.getenv("JUDGE0_RAPIDAPI_HOST") or "judge0-ce.p.rapidapi.com").strip()
    return h


def _judge0_base_for_requests() -> str:
    """RapidAPI Judge0 uses a different path prefix; public CE uses /submissions on host root."""
    if (os.getenv("JUDGE0_RAPIDAPI_KEY") or "").strip():
        host = (os.getenv("JUDGE0_RAPIDAPI_HOST") or "judge0-ce.p.rapidapi.com").strip()
        return f"https://{host}"
    return JUDGE0_API_URL


def judge0_run_once(
    source_code: str,
    language_id: int,
    stdin: str = "",
    cpu_time_limit: int = 2,
) -> Tuple[bool, Dict[str, Any]]:
    """
    Returns (ok, payload) where payload is either Judge0 JSON or {"compile_output":..., "stderr":...}.
    """
    base = _judge0_base_for_requests()
    url = f"{base}/submissions"
    params = {"base64_encoded": "false", "wait": "true"}
    body: Dict[str, Any] = {
        "source_code": source_code,
        "language_id": language_id,
        "cpu_time_limit": cpu_time_limit,
    }
    if stdin is not None:
        body["stdin"] = stdin

    try:
        r = requests.post(
            url,
            params=params,
            json=body,
            headers=_judge0_headers(),
            timeout=JUDGE0_REQUEST_TIMEOUT,
        )
        if r.status_code != 200:
            return False, {"message": r.text[:500], "status_code": r.status_code}
        return True, r.json()
    except requests.RequestException as e:
        return False, {"message": str(e)}


def _stdout_from_judge0(data: Dict[str, Any]) -> str:
    out = data.get("stdout")
    if out is None:
        return ""
    return str(out).strip()


def run_native_cpp_java_loop(
    language_id: int, source_code: str, test_cases: List[Dict[str, Any]], stdin_fallback: str
) -> Optional[Dict[str, Any]]:
    """
    Try g++/javac + subprocess loop. Returns None if compilers are missing or compile fails.
    """
    work = _work_dir()
    try:
        run_cmd: List[str] = []

        if language_id == 54:
            if not shutil.which("g++"):
                return None
            src_path = os.path.join(work, "main.cpp")
            exe_path = _normalize_exe_path(work, "main")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)
            compile_res = subprocess.run(
                ["g++", src_path, "-O2", "-o", exe_path],
                capture_output=True,
                text=True,
                cwd=work,
            )
            if compile_res.returncode != 0:
                return {
                    "error": "Compilation Error:\n" + (compile_res.stderr or compile_res.stdout or ""),
                    "stats": {"passed": 0, "total": len(test_cases)},
                    "results": [],
                }
            run_cmd = [exe_path]

        elif language_id == 62:
            if not shutil.which("javac") or not shutil.which("java"):
                return None
            src_path = os.path.join(work, "Main.java")
            with open(src_path, "w", encoding="utf-8") as f:
                f.write(source_code)
            compile_res = subprocess.run(
                ["javac", src_path],
                capture_output=True,
                text=True,
                cwd=work,
            )
            if compile_res.returncode != 0:
                return {
                    "error": "Compilation Error:\n" + (compile_res.stderr or compile_res.stdout or ""),
                    "stats": {"passed": 0, "total": len(test_cases)},
                    "results": [],
                }
            run_cmd = ["java", "-cp", work, "Main"]
        else:
            return None

        if not test_cases:
            proc = subprocess.run(
                run_cmd,
                input=(stdin_fallback or "").encode(),
                capture_output=True,
                timeout=NATIVE_RUN_TIMEOUT,
            )
            out = proc.stdout.decode(errors="replace").strip() + proc.stderr.decode(errors="replace").strip()
            return {"stats": {"passed": 0, "total": 0, "runtime_ms": 0}, "results": [], "output": out}

        results: List[Dict[str, Any]] = []
        passed_count = 0
        for i, case in enumerate(test_cases):
            inp_str = str(case.get("input", ""))
            expected = str(case.get("output", "")).strip()
            try:
                proc = subprocess.run(
                    run_cmd,
                    input=inp_str.encode(),
                    capture_output=True,
                    timeout=NATIVE_RUN_TIMEOUT,
                )
                actual = proc.stdout.decode(errors="replace").strip()
                err = proc.stderr.decode(errors="replace").strip()
                if proc.returncode != 0:
                    results.append({"id": i, "status": "Runtime Error", "error": err or "Crash"})
                    continue
                status = "Passed" if actual == expected else "Failed"
                if status == "Passed":
                    passed_count += 1
                results.append(
                    {
                        "id": i,
                        "input": inp_str,
                        "expected": expected,
                        "actual": actual,
                        "status": status,
                    }
                )
            except subprocess.TimeoutExpired:
                results.append({"id": i, "status": "Time Limit Exceeded", "error": "Timeout"})
            except Exception as e:
                results.append({"id": i, "status": "System Error", "error": str(e)})

        return {"stats": {"passed": passed_count, "total": len(test_cases)}, "results": results}
    finally:
        try:
            for name in os.listdir(work):
                p = os.path.join(work, name)
                try:
                    if os.path.isfile(p):
                        os.remove(p)
                except OSError:
                    pass
            os.rmdir(work)
        except OSError:
            pass


def run_judge0_test_loop(
    language_id: int, source_code: str, test_cases: List[Dict[str, Any]], stdin_fallback: str
) -> Dict[str, Any]:
    """Run each test case as a separate Judge0 submission (same stdin model as native)."""
    if not source_code.strip():
        return _response_error("No source code provided")

    if not test_cases:
        ok, data = judge0_run_once(source_code, language_id, stdin_fallback or "")
        if not ok:
            return _response_error(data.get("message", "Judge0 request failed"))
        if data.get("status", {}).get("id") not in (1, 2, 3):
            err = data.get("stderr") or data.get("compile_output") or data.get("message") or "Run failed"
            return _response_error(str(err))
        return {
            "stats": {"passed": 0, "total": 0, "runtime_ms": 0},
            "results": [],
            "output": _stdout_from_judge0(data),
        }

    results: List[Dict[str, Any]] = []
    passed_count = 0
    for i, case in enumerate(test_cases):
        inp_str = str(case.get("input", ""))
        expected = str(case.get("output", "")).strip()
        ok, data = judge0_run_once(source_code, language_id, inp_str)
        if not ok:
            results.append(
                {
                    "id": i,
                    "status": "System Error",
                    "error": str(data.get("message", "Judge0 request failed")),
                }
            )
            continue

        st = data.get("status") or {}
        sid = st.get("id")
        if sid not in (1, 2, 3):
            err = data.get("stderr") or data.get("compile_output") or st.get("description") or "Run failed"
            results.append({"id": i, "status": "Runtime Error", "error": str(err)})
            continue

        actual = _stdout_from_judge0(data)
        status = "Passed" if actual == expected else "Failed"
        if status == "Passed":
            passed_count += 1
        results.append(
            {
                "id": i,
                "input": inp_str,
                "expected": expected,
                "actual": actual,
                "status": status,
            }
        )

    return {"stats": {"passed": passed_count, "total": len(test_cases)}, "results": results}


def run_execution_local(
    source_code: str,
    language_id: int,
    test_cases: List[Dict[str, Any]],
    stdin_fallback: str = "",
) -> Dict[str, Any]:
    """
    Main entry: returns dict compatible with main.execute_code expectations
    (before _judge_outputs_equal re-grading): keys stats, results, optional error.
    """
    if language_id == 71:
        return run_python_local(source_code, test_cases)

    if language_id in (54, 62):
        native = run_native_cpp_java_loop(language_id, source_code, test_cases, stdin_fallback)
        if native is not None:
            return native
        return run_judge0_test_loop(language_id, source_code, test_cases, stdin_fallback)

    if language_id == 63:
        return run_judge0_test_loop(63, source_code, test_cases, stdin_fallback)

    return _response_error(f"Unsupported language_id={language_id} for local execution")
