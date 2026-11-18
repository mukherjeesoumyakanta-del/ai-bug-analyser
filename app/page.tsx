"use client";

import { useState, useRef } from "react";
import dynamic from "next/dynamic";
import { MAX_CASES, type ExecutionResult } from "@/lib/execution-types";
import OutputPanel from "@/components/OutputPanel";
import Navbar from "@/components/Navbar";

/* Dynamically import Monaco — must disable SSR to avoid "window is not defined" */
const CodeEditor = dynamic(() => import("@/components/CodeEditor"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full w-full">
      <div className="flex flex-col items-center gap-3">
        <div className="spinner" />
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
          Loading editor…
        </span>
      </div>
    </div>
  ),
});

/* ── Starter C++ code with intentional bugs for demo ── */
const STARTER_CODE = `#include <iostream>
#include <cstring>

// Utility: allocate a buffer (caller must free)
int* allocateBuffer() {
    int* buf = new int[1024];
    return buf;
}

int main() {
    // Bug 1: Use-after-free
    int* ptr = new int(10);
    delete ptr;
    *ptr = 42;  // ⚠️ dangling pointer write

    // Bug 2: Memory leak
    int* buffer = allocateBuffer();
    std::cout << "Buffer allocated at: " << buffer << std::endl;
    // forgot to delete[] buffer

    // Bug 3: Uninitialized variable
    int result;
    return result;  // ⚠️ uninitialized
}
`;

type TestCase = {
  id: string;
  input: string;
  expectedOutput: string;
  checkOutput: boolean;
};

type AnalysisStatus = "idle" | "analyzing" | "complete" | "error";

export default function Home() {
  const [code, setCode] = useState(STARTER_CODE);
  const [testCases, setTestCases] = useState<TestCase[]>([
    { id: "1", input: "", expectedOutput: "", checkOutput: false },
  ]);
  const [showTestCases, setShowTestCases] = useState(false);
  const [displayedText, setDisplayedText] = useState("");
  const [status, setStatus] = useState<AnalysisStatus>("idle");
  const abortRef = useRef<AbortController | null>(null);
  const runningRef = useRef(false);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [run, setRun] = useState<{ snapshot: string; results: ExecutionResult[]; evidence: string }>();
  const runInput = {
    code,
    testCases: testCases.map(({ input, expectedOutput, checkOutput }) => ({
      input, expectedOutput: checkOutput ? expectedOutput : null,
    })),
  };
  const snapshot = JSON.stringify(runInput);
  const currentRun = run?.snapshot === snapshot ? run : undefined;

  async function handleRun() {
    if (runningRef.current) return;
    runningRef.current = true;
    setRunning(true);
    setRun(undefined);
    setRunError("");
    try {
      const response = await fetch("/api/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: snapshot,
        signal: AbortSignal.timeout(40_000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not run code.");
      setRun({ snapshot, results: data.results, evidence: data.evidence });
    } catch (error) {
      setRunError(error instanceof Error ? error.message : "Could not run code.");
    } finally {
      runningRef.current = false;
      setRunning(false);
    }
  }

  const handleAddTestCase = () => {
    setTestCases((prev) => prev.length >= MAX_CASES ? prev : [
      ...prev,
      { id: crypto.randomUUID(), input: "", expectedOutput: "", checkOutput: false },
    ]);
  };

  const handleRemoveTestCase = (id: string) => {
    setTestCases((prev) => prev.filter((tc) => tc.id !== id));
  };

  const handleTestCaseChange = (id: string, field: "input" | "expectedOutput", value: string) => {
    setTestCases((prev) =>
      prev.map((tc) => (tc.id === id ? { ...tc, [field]: value } : tc))
    );
  };

  /* ── Fetch streaming response from /api/analyze ── */
  async function handleAnalyze() {
    if (status === "analyzing" || abortRef.current) return;

    const controller = new AbortController();
    abortRef.current = controller;

    setDisplayedText("");
    setStatus("analyzing");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...runInput, evidence: currentRun?.evidence }),
        signal: controller.signal,
      });

      /* ── Handle non-OK responses ──────────────── */
      if (!response.ok) {
        let errorMsg = `Server error (${response.status})`;
        try {
          const errBody = await response.json();
          if (errBody.error) errorMsg = errBody.error;
        } catch {
          /* response wasn't JSON, use default message */
        }
        setDisplayedText(errorMsg);
        setStatus("error");
        return;
      }

      /* ── Read the stream ──────────────────────── */
      const reader = response.body?.getReader();
      if (!reader) {
        setDisplayedText("Failed to open response stream.");
        setStatus("error");
        return;
      }

      const decoder = new TextDecoder("utf-8");
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;
        setDisplayedText(accumulated);
      }

      setDisplayedText(accumulated + decoder.decode());
      setStatus("complete");
    } catch (error: unknown) {
      if (error instanceof DOMException && error.name === "AbortError") {
        // Request was intentionally aborted — don't show error
        return;
      }
      const message =
        error instanceof Error ? error.message : "An unexpected error occurred";
      setDisplayedText(message);
      setStatus("error");
    } finally {
      abortRef.current = null;
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      <Navbar />

      {/* ── Main Split Panels ─────────────────── */}
      <main className="flex flex-1 overflow-hidden p-3 gap-3">
        {/* Left Panel — Code Editor */}
        <section
          className="glass-panel glass-panel-glow flex flex-col flex-1 overflow-hidden animate-slide-up-delay-1"
          style={{ minWidth: 0 }}
        >
          {/* Panel header */}
          <div
            className="flex items-center gap-3 px-5 py-3 border-b"
            style={{ borderColor: "var(--border-glass)" }}
          >
            {/* Traffic light dots */}
            <div className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: "#ff5f57" }}
              />
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: "#febc2e" }}
              />
              <div
                className="w-3 h-3 rounded-full"
                style={{ background: "#28c840" }}
              />
            </div>
            <span
              className="text-xs font-medium tracking-wide uppercase"
              style={{ color: "var(--text-secondary)" }}
            >
              main.cpp
            </span>
          </div>
          {/* Editor & Test Cases */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="flex-1 min-h-0 relative">
              <CodeEditor value={code} onChange={setCode} />
            </div>

            {/* Test Cases Collapsible Panel */}
            <div className="border-t shrink-0" style={{ borderColor: "var(--border-glass)", background: "rgba(6, 6, 14, 0.4)" }}>
              <button
                onClick={() => setShowTestCases(!showTestCases)}
                className="w-full flex items-center justify-between px-5 py-2 text-xs font-medium hover:bg-white/5 transition-colors"
                style={{ color: "var(--text-secondary)" }}
              >
                <div className="flex items-center gap-2">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3" />
                  </svg>
                  Test Cases ({testCases.length})
                </div>
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`transform transition-transform ${showTestCases ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>

              {showTestCases && (
                <div className="p-4 max-h-[35vh] overflow-y-auto" style={{ background: "rgba(0,0,0,0.2)" }}>
                  {testCases.map((tc, index) => (
                    <div key={tc.id} className="mb-4 flex flex-col gap-2 p-3 rounded border" style={{ borderColor: "var(--border-glass)", background: "rgba(255,255,255,0.02)" }}>
                      <div className="flex justify-between items-center">
                        <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>Test Case {index + 1}</span>
                        <button onClick={() => handleRemoveTestCase(tc.id)} className="text-[10px] text-red-400 hover:text-red-300 uppercase tracking-wider font-semibold">Remove</button>
                      </div>
                      <div className="flex gap-4">
                        <div className="flex-1 flex flex-col gap-1">
                          <label htmlFor={`input-${tc.id}`} className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Input</label>
                          <textarea
                            id={`input-${tc.id}`}
                            value={tc.input}
                            onChange={(e) => handleTestCaseChange(tc.id, "input", e.target.value)}
                            className="w-full bg-transparent border rounded p-2 text-xs text-white resize-none h-16 focus:outline-none"
                            style={{ borderColor: "var(--border-glass)", outlineColor: "var(--accent-start)" }}
                            placeholder="e.g. 5 10"
                          />
                        </div>
                        <div className="flex-1 flex flex-col gap-1">
                          <label htmlFor={`expected-${tc.id}`} className="text-[10px] uppercase" style={{ color: "var(--text-muted)" }}>Expected Output</label>
                          <textarea
                            id={`expected-${tc.id}`}
                            disabled={!tc.checkOutput}
                            value={tc.expectedOutput}
                            onChange={(e) => handleTestCaseChange(tc.id, "expectedOutput", e.target.value)}
                            className="w-full bg-transparent border rounded p-2 text-xs text-white resize-none h-16 focus:outline-none"
                            style={{ borderColor: "var(--border-glass)", outlineColor: "var(--accent-mid)" }}
                            placeholder="e.g. 15"
                          />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-white">
                        <input type="checkbox" checked={tc.checkOutput} onChange={(e) => {
                          const checked = e.target.checked;
                          setTestCases((prev) => prev.map((item) => item.id === tc.id ? { ...item, checkOutput: checked } : item));
                        }} />
                        Check expected output (blank means no output)
                      </label>
                    </div>
                  ))}
                  <button
                    onClick={handleAddTestCase}
                    disabled={testCases.length >= MAX_CASES}
                    className="text-xs px-3 py-1.5 rounded border hover:bg-white/10 transition-colors w-full border-dashed"
                    style={{ borderColor: "var(--border-glass)", color: "var(--text-primary)" }}
                  >
                    + Add Test Case
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Right Panel — AI Output */}
        <section
          className="glass-panel glass-panel-glow flex flex-col flex-1 overflow-hidden animate-slide-up-delay-2"
          style={{ minWidth: 0 }}
        >
          <OutputPanel
            displayedText={displayedText}
            status={status}
            onAnalyze={handleAnalyze}
            onRun={handleRun}
            running={running}
            runError={runError}
            results={currentRun?.results}
            stale={!!run && !currentRun}
            testCases={runInput.testCases}
          />
        </section>
      </main>
    </div>
  );
}
