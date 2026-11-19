import assert from "node:assert/strict";
import { test } from "node:test";
import { validateReport } from "../lib/analysis-report.ts";

const input = { code: "int main() {\n  int value;\n  return value;\n}", testCases: [] };
const finding = {
  title: "Uninitialized result", severity: "high", startLine: 2, endLine: 3,
  codeQuote: "  int value;\n  return value;",
  what: "The return reads an uninitialized value.",
  why: "No value is assigned before the read.",
  impact: "The result may be unpredictable.",
  hint: "Trace where value first receives a value.",
};

test("derives report metadata and snippets from validated source", () => {
  const report = validateReport({ findings: [finding], counts: { critical: 999 }, executions: ["invented"] }, "analysis-1", input);
  assert.equal(report.language, "C++");
  assert.deepEqual(report.counts, { critical: 0, high: 1, medium: 0, low: 0 });
  assert.equal(report.findings[0].snippet, "  int value;\n  return value;");
  assert.equal(report.findings[0].startLine, 2);
  assert.deepEqual(report.executions, []);
});

test("unsupported locations keep the issue but disable line navigation", () => {
  for (const changes of [
    { startLine: 0 }, { endLine: 999 }, { startLine: 2.5 }, { codeQuote: "invented corrected code" },
  ]) {
    const report = validateReport({ findings: [{ ...finding, ...changes }] }, "report", input);
    assert.equal(report.findings[0].startLine, null);
    assert.equal(report.findings[0].snippet, null);
    assert.equal(report.findings.length, 1);
  }
});

test("rejects invalid severity and malformed or excessive model output", () => {
  assert.throws(() => validateReport({ findings: [{ ...finding, severity: "major" }] }, "report", input), /severity/);
  assert.throws(() => validateReport({ findings: [{ ...finding, hint: "" }] }, "report", input), /hint/);
  assert.throws(() => validateReport({ findings: Array(31).fill(finding) }, "report", input), /findings/);
});

test("sorts issues by severity and accepts only server-supplied execution observations", () => {
  const result = { status: "success", output: "", truncated: false, verdict: "passed", time: 0.01, memory: 100 } as const;
  const report = validateReport({ findings: [{ ...finding, severity: "low" }, finding] }, "report",
    { ...input, testCases: [{ input: "", expectedOutput: "" }] }, [result]);
  assert.equal(report.findings[0].severity, "high");
  assert.equal(report.executions[0].result.output, "");
  assert.equal(report.executions[0].expectedOutput, "");
});
