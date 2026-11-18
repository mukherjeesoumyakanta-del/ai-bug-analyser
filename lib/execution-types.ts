export const MAX_CASES = 4;
export const MAX_CODE = 32 * 1024;
export const MAX_CASE_TEXT = 8 * 1024;
export const MAX_OUTPUT = 4096;
export const RUN_LIMIT_MS = 25_000;

export type TestCase = { input: string; expectedOutput: string | null };
export type RunInput = { code: string; testCases: TestCase[] };
export type ExecutionResult = {
  status: "success" | "compile_error" | "runtime_error" | "timeout" | "provider_error" | "provider_timeout";
  stdout: string;
  stderr: string;
  compileOutput: string;
  truncated: boolean;
  time: number | null;
  exitCode: number | null;
  exitSignal: number | null;
  memory: number | null;
  verdict: "passed" | "failed" | "not_checked";
};
