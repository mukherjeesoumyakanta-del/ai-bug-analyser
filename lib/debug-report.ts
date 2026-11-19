import type { Activity } from "./activity-types";

function fenced(text: string) {
  const longest = Math.max(2, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  const fence = "`".repeat(longest + 1);
  return fence + "\n" + text + "\n" + fence;
}

export function debugReport(records: Activity[], finalCode: string) {
  const ordered = [...records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const executions = ordered.filter((row) => row.kind === "execution");
  const analyses = ordered.filter((row) => row.kind === "analysis" && row.content);
  const initial = ordered.find((row) => row.kind !== "report")?.code;
  const latestAnalysis = analyses.at(-1);
  const observed = executions.map((row) =>
    `- Run ${row.id}: ${row.status}; program ${row.result?.status ?? "unavailable"}; test ${row.result?.verdict ?? "not checked"}.`
    + (row.result?.output ? "\n" + fenced(row.result.output) : "")
    + (row.error ? "\n" + row.error : "")).join("\n");
  return [
    "# Debugging session report",
    "## Problem summary",
    "C++ debugging session based on the recorded actions below. No spoken conversation was captured.",
    "## Observed failure",
    observed || "No executions were recorded.",
    "## Suspected or verified root cause",
    latestAnalysis ? "AI hypotheses from analysis " + latestAnalysis.id + ":\n\n" + latestAnalysis.content
      : "No AI analysis was recorded. A root cause has not been established.",
    "## Changes made",
    initial === undefined ? "No initial recorded snapshot is available."
      : initial === finalCode ? "The final code matches the first recorded snapshot."
      : "The final code differs from the first recorded snapshot. This does not establish that a bug was fixed.",
    ...(initial === undefined ? [] : ["### First recorded source", fenced(initial)]),
    "### Final source", fenced(finalCode),
    "## Test results before and after",
    executions.length ? "Use the run IDs and attached source snapshots to compare results. Runs may use different tests. A before/after improvement is not assumed."
      : "No test results available.",
    ...executions.map((row) => `### Run ${row.id}\nInput\n${fenced(row.testCases[row.caseIndex]?.input ?? "")}\nExpected\n${row.testCases[row.caseIndex]?.expectedOutput === null || !row.testCases[row.caseIndex] ? "Not supplied." : fenced(row.testCases[row.caseIndex].expectedOutput!)}\nSource\n${fenced(row.code)}`),
    "## Remaining limitations",
    "This report covers up to 50 recent recorded room actions. Earlier edits and unrecorded tests cannot be reconstructed. AI claims are hypotheses unless supported by execution evidence. Output excerpts may be truncated.",
  ].join("\n\n");
}
