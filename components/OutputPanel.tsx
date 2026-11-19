"use client";

import { useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import ExecutionOutput from "./ExecutionOutput";
import AnalysisReportView from "./AnalysisReport";
import type { AnalysisReport } from "@/lib/analysis-report";
import type { CaseResults, TestCase } from "@/lib/execution-types";

type AnalysisStatus = "idle" | "analyzing" | "complete" | "error";

interface OutputPanelProps {
  displayedText: string;
  status: AnalysisStatus;
  report?: AnalysisReport;
  onSelectLine?: (start: number, end: number) => void;
  onAnalyze: () => void;
  onRun: () => void;
  running: boolean;
  runError: string;
  results?: CaseResults;
  stale: boolean;
  testCases: TestCase[];
  caseIndex: number;
  onSelectCase: (index: number) => void;
}

export default function OutputPanel({
  displayedText,
  status,
  report, onSelectLine, onAnalyze, onRun, running, runError, results, stale, testCases, caseIndex, onSelectCase,
}: OutputPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { status: authStatus } = useSession();
  const router = useRouter();

  /* Auto-scroll to bottom on new text */
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = report ? 0 : scrollRef.current.scrollHeight;
    }
  }, [displayedText, report]);

  const statusLabel: Record<AnalysisStatus, string> = {
    idle: "Ready",
    analyzing: "Analyzing…",
    complete: "Analysis Complete",
    error: "Error",
  };

  return (
    <div className="flex flex-col h-full">
      {/* ── Header ─────────────────────────────── */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 px-3 py-3 sm:px-5 border-b"
        style={{ borderColor: "var(--border-glass)" }}
      >
        <div className="flex items-center gap-3">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "var(--accent-start)" }}
          >
            <path d="M12 20h9" />
            <path d="M16.376 3.622a1 1 0 0 1 3.002 3.002L7.368 18.635a2 2 0 0 1-.855.506l-2.872.838a.5.5 0 0 1-.62-.62l.838-2.872a2 2 0 0 1 .506-.855z" />
          </svg>
          <span
            className="text-sm font-semibold tracking-wide uppercase"
            style={{ color: "var(--text-secondary)" }}
          >
            AI Analysis
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`status-dot ${
              status === "error"
                ? "status-dot--error"
                : `status-dot--${status}`
            }`}
          />
          <span className="text-xs" style={{ color: "var(--text-muted)" }}>
            {statusLabel[status]}
          </span>
        </div>
      </div>

      <ExecutionOutput {...{ running, runError, results, stale, testCases, caseIndex }} />
      {/* ── Scrollable Output ──────────────────── */}
      <div
        ref={scrollRef}
        className="custom-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-4 sm:px-5"
      >
        {report ? <AnalysisReportView report={report} onSelectLine={onSelectLine} /> : displayedText ? (
          <div
            className={`font-mono text-sm leading-relaxed whitespace-pre-wrap break-words ${
              status === "analyzing" ? "streaming-cursor" : ""
            }`}
            style={{
              color:
                status === "error"
                  ? "var(--error)"
                  : "var(--text-primary)",
            }}
          >
            {displayedText}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-4 animate-fade-in">

            <p
              className="text-sm text-center max-w-[240px]"
              style={{ color: "var(--text-muted)" }}
            >
              {status === "analyzing" ? "Reviewing code and validating findings…" : <>Click <strong>Analyze with AI</strong> to review your C++ code.</>}
            </p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 px-5 pt-2 pb-2 text-xs text-gray-300">
        {testCases.length > 1 && (
          <label className="flex items-center gap-2">
            Test to run
            <select value={caseIndex} onChange={(event) => onSelectCase(Number(event.target.value))}
              disabled={running} className="rounded border border-white/20 bg-slate-900 px-2 py-1">
              {testCases.map((_, index) => <option key={index} value={index}>Test {index + 1}</option>)}
            </select>
          </label>
        )}
        <span>One case and one credit per run</span>
      </div>
      {/* ── Footer with Button ─────────────────── */}
      <div
        className="flex shrink-0 flex-wrap gap-2 border-t px-3 py-3 sm:px-5 sm:py-4"
        style={{ borderColor: "var(--border-glass)" }}
      >
        <button
          onClick={() => authStatus === "authenticated" ? onRun() : router.push("/login")}
          disabled={running || authStatus === "loading"}
          className="btn-gradient min-w-0 flex-1 px-3 sm:px-5"
        >
          <span>{running ? "Running…" : "Run Code"}</span>
        </button>
        <button
          id="analyze-bug-btn"
          onClick={() => {
            if (authStatus !== "authenticated") {
              router.push("/login");
            } else {
              onAnalyze();
            }
          }}
          disabled={status === "analyzing" || running || authStatus === "loading"}
          className="btn-gradient min-w-0 flex-1 px-3 sm:px-5"
        >
          {authStatus !== "authenticated" ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
              <span>Sign in to Analyze</span>
            </>
          ) : status === "analyzing" ? (
            <>
              <div className="spinner" />
              <span>Analyzing…</span>
            </>
          ) : (
            <>
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m8 2 1.88 1.88" />
                <path d="M14.12 3.88 16 2" />
                <path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1" />
                <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
                <path d="M12 20v-9" />
                <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
                <path d="M6 13H2" />
                <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
                <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
                <path d="M22 13h-4" />
                <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
              </svg>
              <span>Analyze with AI</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
