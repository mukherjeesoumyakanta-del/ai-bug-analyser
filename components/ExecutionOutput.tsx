import type { ExecutionResult, TestCase } from "@/lib/execution-types";

const labels: Record<ExecutionResult["status"], string> = {
  success: "Compiled and ran successfully",
  compile_error: "Compilation failed",
  runtime_error: "Compiled; runtime error",
  timeout: "Compiled; execution timed out",
  provider_error: "Execution provider error",
  provider_timeout: "Timed out waiting for the execution provider",
};

function Text({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <span className="text-xs text-gray-400">{label}</span>
      <pre className="whitespace-pre-wrap break-all text-xs">{value === null ? "(not supplied)" : value === "" ? "(empty)" : value}</pre>
    </div>
  );
}

export default function ExecutionOutput({ running, runError, results, stale, testCases }: {
  running: boolean; runError: string; results?: ExecutionResult[]; stale: boolean; testCases: TestCase[];
}) {
  if (!running && !runError && !results && !stale) return null;

  const passed = results?.filter(({ verdict }) => verdict === "passed").length ?? 0;
  const failed = results?.filter(({ verdict }) => verdict === "failed").length ?? 0;
  return (
    <section aria-label="Execution output and errors" aria-busy={running}
      className="max-h-[48%] shrink-0 overflow-auto border-b border-white/10 px-5 py-3 text-sm text-white">
      <h2 className="font-semibold">Output / Errors</h2>
      <p aria-live="polite">
        {running ? "Compiling and running in the sandbox…" : stale ? "Code or test cases changed. Run again for current results." :
          runError || (results && `${passed} passed · ${failed} failed · ${results.length - passed - failed} not checked`)}
      </p>
      {results?.map((result, index) => {
        const test = testCases[index];
        return (
          <details key={index} open={results.length === 1} className="mt-2 rounded border border-white/10 p-2">
            <summary className="cursor-pointer">
              {test ? `Test ${index + 1}` : "Run"}: {labels[result.status]} · {result.verdict.replace("_", " ")}
            </summary>
            <div className="mt-2 space-y-2">
              <Text label="Input" value={test?.input ?? ""} />
              <Text label="Expected output" value={test?.expectedOutput ?? null} />
              <Text label="Actual output (stdout)" value={
                ["provider_error", "provider_timeout"].includes(result.status) ? null : result.stdout
              } />
              {result.compileOutput && <Text label="Compiler messages" value={result.compileOutput} />}
              {result.stderr && <Text label="Runtime messages (stderr)" value={result.stderr} />}
              {result.exitCode !== null && result.exitCode !== 0 && <p>Exit code: {result.exitCode}</p>}
              {result.exitSignal !== null && result.exitSignal !== 0 && <p>Exit signal: {result.exitSignal}</p>}
              {result.time !== null && <p>CPU time: {result.time} s</p>}
              {result.memory !== null && <p>Memory: {result.memory} KiB</p>}
              {result.truncated && <p>Some output was shortened for display.</p>}
            </div>
          </details>
        );
      })}
    </section>
  );
}
