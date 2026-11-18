import type { CaseResults, ExecutionResult, TestCase } from "@/lib/execution-types";

const labels: Record<ExecutionResult["status"], string> = {
  success: "Compiled and ran successfully",
  compile_error: "Compilation failed",
  runtime_error: "Compiled but failed at runtime",
  timeout: "Execution timed out",
  unknown: "Program outcome unavailable",
};

const outputLabels: Record<ExecutionResult["status"], string> = {
  success: "Actual output (may include stderr)",
  compile_error: "Compiler messages",
  runtime_error: "Runtime diagnostics and output",
  timeout: "Timeout diagnostics and output",
  unknown: "Provider output",
};

function Text({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="text-xs text-gray-400">{label}</span>
      <pre className="whitespace-pre-wrap break-all text-xs">{value === null ? "(not supplied)" : value === "" ? "(empty)" : value}</pre>
    </div>
  );
}

export default function ExecutionOutput({ running, runError, results, stale, testCases, caseIndex }: {
  running: boolean; runError: string; results?: CaseResults; stale: boolean; testCases: TestCase[]; caseIndex: number;
}) {
  if (!running && !runError && !results && !stale) return null;

  const passed = results?.filter((result) => result?.verdict === "passed").length ?? 0;
  const failed = results?.filter((result) => result?.verdict === "failed").length ?? 0;
  const unchecked = results?.filter((result) => result?.verdict === "not_checked").length ?? 0;
  const pending = (results?.length ?? 0) - passed - failed - unchecked;

  return (
    <section aria-label="Execution output and errors" aria-busy={running}
      className="max-h-[48%] shrink-0 overflow-auto border-b border-white/10 px-5 py-3 text-sm text-white">
      <h2 className="font-semibold">Output / Errors</h2>
      <div aria-live="polite">
        {running && <p>Compiling and running in the sandbox…</p>}
        {runError && <p className="text-red-300">{runError}</p>}
        {stale && !running && <p>Code or test cases changed. Run again for current results.</p>}
        {results && <p>{passed} passed · {failed} failed · {unchecked} not checked · {pending} not run</p>}
      </div>
      {results?.map((result, index) => {
        const test = testCases[index];
        if (!result) return <p key={index} className="mt-2 text-xs text-gray-400">Test {index + 1} has not run.</p>;
        return (
          <details key={index} open={index === caseIndex} className="mt-2 rounded border border-white/10 p-2">
            <summary className="cursor-pointer">
              {test ? `Test ${index + 1}` : "Run"}: {labels[result.status]} · {result.verdict.replace("_", " ")}
            </summary>
            <div className="mt-2 space-y-2">
              <Text label="Input" value={test?.input ?? ""} />
              <Text label="Expected output" value={test?.expectedOutput ?? null} />
              <Text label={outputLabels[result.status]} value={result.output} />
              {result.time !== null && <p>CPU time: {result.time} s</p>}
              {result.memory !== null && <p>Memory: {result.memory} KiB</p>}
              {result.truncated && <p>Output was shortened for display.</p>}
            </div>
          </details>
        );
      })}
    </section>
  );
}
