import type { CaseResults, RunInput, ExecutionResult } from "./execution-types.ts";
import { record, RequestError } from "./request-body.ts";

export const severities = ["critical", "high", "medium", "low"] as const;
export type Severity = typeof severities[number];
export type Finding = {
  title: string;
  severity: Severity;
  startLine: number | null;
  endLine: number | null;
  snippet: string | null;
  what: string;
  why: string;
  impact: string;
  hint: string;
};
export type AnalysisReport = {
  id: string;
  language: "C++";
  findings: Finding[];
  counts: Record<Severity, number>;
  executions: { input: string; expectedOutput: string | null; result: ExecutionResult }[];
};

function shortText(value: unknown, name: string, limit = 500) {
  if (typeof value !== "string" || !value.trim() || value.length > limit) {
    throw new RequestError(`Gemini returned an invalid ${name}. Please try again.`, 502);
  }
  return value.trim();
}

export function validateReport(raw: unknown, id: string, input: RunInput, evidence?: CaseResults): AnalysisReport {
  const model = record(raw);
  if (!Array.isArray(model.findings) || model.findings.length > 30) {
    throw new RequestError("Gemini returned an invalid findings list.", 502);
  }
  const source = input.code.split(/\r?\n/);
  const findings: Finding[] = model.findings.map((item) => {
    const finding = record(item);
    if (!severities.includes(finding.severity as Severity)) {
      throw new RequestError("Gemini returned an invalid severity.", 502);
    }
    const start = finding.startLine;
    const end = finding.endLine;
    const validRange = typeof start === "number" && typeof end === "number" &&
      Number.isInteger(start) && Number.isInteger(end) && start >= 1 && end >= start &&
      end <= source.length && end - start <= 12;
    const snippet = validRange ? source.slice(start - 1, end).join("\n") : null;
    const supported = snippet !== null && typeof finding.codeQuote === "string" &&
      finding.codeQuote.trim() === snippet.trim();
    return {
      title: shortText(finding.title, "title", 120),
      severity: finding.severity as Severity,
      startLine: supported ? start as number : null,
      endLine: supported ? end as number : null,
      snippet: supported ? snippet : null,
      what: shortText(finding.what, "explanation"),
      why: shortText(finding.why, "cause"),
      impact: shortText(finding.impact, "impact"),
      hint: shortText(finding.hint, "hint"),
    };
  }).sort((a, b) => severities.indexOf(a.severity) - severities.indexOf(b.severity));
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const finding of findings) counts[finding.severity]++;
  const executions = (evidence ?? []).flatMap((result, index) => result ? [{
    input: input.testCases[index]?.input ?? "",
    expectedOutput: input.testCases[index]?.expectedOutput ?? null,
    result,
  }] : []);
  return { id, language: "C++", findings, counts, executions };
}

export function analysisMarkdown(report: AnalysisReport) {
  return [
    "# C++ bug analysis",
    `${report.findings.length} findings. Execution observations: ${report.executions.length}.`,
    ...report.findings.map((finding, index) => [
      `## ${index + 1}. ${finding.title} (${finding.severity})`,
      finding.startLine ? `main.cpp, lines ${finding.startLine}–${finding.endLine}` : "Source location not verified.",
      "What: " + finding.what, "Why: " + finding.why, "Impact: " + finding.impact, "Hint: " + finding.hint,
    ].join("\n\n")),
  ].join("\n\n");
}
