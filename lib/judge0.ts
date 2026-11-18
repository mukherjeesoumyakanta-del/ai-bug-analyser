import { setTimeout as delay } from "node:timers/promises";
import { MAX_OUTPUT, RUN_LIMIT_MS, type ExecutionResult, type RunInput } from "./execution-types.ts";
import { readJson, record } from "./request-body.ts";

export class ProviderError extends Error {}

export function compareOutput(actual: string, expected: string) {
  // Treat CRLF as LF; preserve all other characters, including the final newline.
  return actual.replaceAll("\r\n", "\n") === expected.replaceAll("\r\n", "\n");
}

function decodeOutput(value: unknown) {
  if (value == null) return Buffer.alloc(0);
  if (typeof value !== "string" || !/^[A-Za-z0-9+/=\s]*$/.test(value)) {
    throw new ProviderError("Invalid output encoding.");
  }
  return Buffer.from(value, "base64");
}

function metric(value: unknown) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : null;
}

export function normalizeResult(raw: Record<string, unknown>, expected: string | null): ExecutionResult {
  const id = record(raw.status).id;
  const status = id === 3 ? "success" : id === 6 ? "compile_error" : id === 5 ? "timeout"
    : typeof id === "number" && id >= 7 && id <= 12 ? "runtime_error" : "provider_error";
  const stdout = decodeOutput(raw.stdout);
  const stderr = decodeOutput(raw.stderr);
  const compile = decodeOutput(raw.compile_output);
  const actual = stdout.toString("utf8");
  const matches = Buffer.from(actual).equals(stdout) && expected !== null && compareOutput(actual, expected);
  return {
    status,
    stdout: stdout.subarray(0, MAX_OUTPUT).toString("utf8"),
    stderr: stderr.subarray(0, MAX_OUTPUT).toString("utf8"),
    compileOutput: compile.subarray(0, MAX_OUTPUT).toString("utf8"),
    truncated: [stdout, stderr, compile].some((output) => output.length > MAX_OUTPUT),
    time: metric(raw.time),
    exitCode: metric(raw.exit_code),
    exitSignal: metric(raw.exit_signal),
    memory: metric(raw.memory),
    verdict: expected === null || status === "provider_error" ? "not_checked"
      : status === "success" && matches ? "passed" : "failed",
  };
}

export function createJudge0(env: Record<string, string | undefined> = process.env, fetcher = fetch) {
  let base: URL;
  try {
    base = new URL((env.JUDGE0_URL ?? "").replace(/\/+$/, "") + "/");
    if (base.protocol !== "https:" || base.username || base.password || base.search || base.hash) throw new Error();
  } catch {
    throw new ProviderError("Configure a valid HTTPS execution provider URL.");
  }

  const headers = new Headers({ "Content-Type": "application/json" });
  if (env.JUDGE0_AUTH_TOKEN) headers.set("X-Auth-Token", env.JUDGE0_AUTH_TOKEN);
  if (env.JUDGE0_API_KEY) {
    headers.set("X-RapidAPI-Key", env.JUDGE0_API_KEY);
    headers.set("X-RapidAPI-Host", base.host);
  }

  async function request(path: string, signal: AbortSignal, body?: object) {
    const response = await fetcher(new URL(path, base), {
      method: body ? "POST" : "GET",
      headers, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)]),
      cache: "no-store", redirect: "error",
    });
    if (!response.ok) throw new ProviderError("Execution provider rejected the request.");
    try {
      return await readJson(response, 512 * 1024);
    } catch {
      throw new ProviderError("Invalid or oversized response from execution provider.");
    }
  }

  async function languageId(signal: AbortSignal) {
    const languages = await request("languages", signal);
    if (!Array.isArray(languages)) throw new ProviderError("Invalid provider language list.");
    const supported = languages.map(record).find(({ id, name }) =>
      typeof id === "number" && Number.isSafeInteger(id) && id > 0 &&
      typeof name === "string" && /^C\+\+(?:\s|$)/i.test(name) &&
      (!env.JUDGE0_CPP_NAME || name === env.JUDGE0_CPP_NAME));
    if (!supported) throw new ProviderError("No matching C++ compiler on the execution provider.");
    return supported.id;
  }

  async function submit(code: string, input: string, language: unknown, signal: AbortSignal) {
    const { token } = record(await request("submissions?base64_encoded=true&wait=false", signal, {
      language_id: language, source_code: Buffer.from(code).toString("base64"),
      stdin: Buffer.from(input).toString("base64"), enable_network: false,
      cpu_time_limit: 2, cpu_extra_time: 0, wall_time_limit: 5,
      memory_limit: 128000, max_file_size: 64, number_of_runs: 1,
    }));
    if (typeof token !== "string" || !/^[\w-]{1,100}$/.test(token)) {
      throw new ProviderError("Execution provider did not return a valid submission token.");
    }
    return token;
  }

  async function poll(token: string, signal: AbortSignal) {
    for (;;) {
      await delay(700, undefined, { signal });
      const result = record(await request(
        `submissions/${token}?base64_encoded=true&fields=status,stdout,stderr,compile_output,time,memory,exit_code,exit_signal`, signal));
      const status = record(result.status).id;
      if (typeof status !== "number") throw new ProviderError("Invalid submission status.");
      if (status !== 1 && status !== 2) return result;
    }
  }

  return async (input: RunInput, requestSignal?: AbortSignal) => {
    const deadline = AbortSignal.timeout(RUN_LIMIT_MS);
    const signal = requestSignal ? AbortSignal.any([deadline, requestSignal]) : deadline;
    const language = await languageId(signal).catch((error) => {
      if (error instanceof DOMException && error.name === "TimeoutError") throw error;
      throw new ProviderError("Could not discover the execution provider compiler.");
    });
    const cases = input.testCases.length ? input.testCases : [{ input: "", expectedOutput: null }];
    return Promise.all(cases.map(async (test): Promise<ExecutionResult> => {
      try {
        return normalizeResult(await poll(await submit(input.code, test.input, language, signal), signal), test.expectedOutput);
      } catch (error) {
        return {
          status: deadline.aborted || (error instanceof DOMException && error.name === "TimeoutError")
            ? "provider_timeout" : "provider_error",
          stdout: "", stderr: "", compileOutput: "", time: null, memory: null, exitCode: null, exitSignal: null,
          truncated: false, verdict: "not_checked",
        };
      }
    }));
  };
}
