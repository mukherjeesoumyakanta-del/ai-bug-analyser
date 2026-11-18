import { MAX_OUTPUT, RUN_LIMIT_MS, type ExecutionResult, type TestCase } from "./execution-types.ts";
import { readJson, record, RequestError } from "./request-body.ts";

const EXECUTE_URL = "https://api.jdoodle.com/v1/execute";
// JDoodle's language table lists GCC 15.2.1 at index 3 for C++17.
const CPP = { language: "cpp17", versionIndex: "3" };

export function compareOutput(actual: string, expected: string) {
  return actual.replaceAll("\r\n", "\n") === expected.replaceAll("\r\n", "\n");
}

function metric(value: unknown) {
  const number = typeof value === "string" && value.trim() ? Number(value) : value;
  return typeof number === "number" && Number.isFinite(number) && number >= 0 ? number : null;
}

export function normalizeExecution(data: Record<string, unknown>, expected: string | null): ExecutionResult {
  const { output, isCompiled, isExecutionSuccess } = data;
  if (typeof output !== "string") {
    throw new RequestError("JDoodle did not return program output.", 502);
  }

  // JDoodle's timeout response may report isCompiled=false.
  const timedOut = isExecutionSuccess === false && /^\s*JDoodle - Timeout\s*\r?\nIf your program reads input\b/i.test(output);
  let status: ExecutionResult["status"];
  if (timedOut) {
    status = "timeout";
  } else if (isCompiled === false) {
    status = "compile_error";
  } else if (isCompiled === true && isExecutionSuccess === false) {
    status = "runtime_error";
  } else if (isCompiled === true && isExecutionSuccess === true) {
    status = "success";
  } else {
    status = "unknown";
  }

  let verdict: ExecutionResult["verdict"] = "not_checked";
  if (expected !== null && status !== "unknown") {
    verdict = status === "success" && compareOutput(output, expected) ? "passed" : "failed";
  }

  return {
    status,
    output: output.slice(0, MAX_OUTPUT),
    truncated: output.length > MAX_OUTPUT,
    time: metric(data.cpuTime),
    memory: metric(data.memory),
    verdict,
  };
}

export async function runCode(
  code: string,
  test: TestCase,
  signal: AbortSignal,
  env: Record<string, string | undefined> = process.env,
  fetcher = fetch,
) {
  const clientId = env.JDOODLE_CLIENT_ID;
  const clientSecret = env.JDOODLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new RequestError("Code execution is not configured on this server.", 503);
  }

  const deadline = AbortSignal.timeout(RUN_LIMIT_MS);
  try {
    const response = await fetcher(EXECUTE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, script: code, stdin: test.input, ...CPP }),
      signal: AbortSignal.any([signal, deadline]),
      cache: "no-store",
      redirect: "error",
    });

    // Some providers return transport errors while others put them in the JSON status.
    if (response.status === 429) throw quotaError();
    if (response.status === 401 || response.status === 403) throw credentialsError();
    const data = record(await readJson(response, 512 * 1024));
    if (Number(data.statusCode) === 429) throw quotaError();
    if ([401, 403].includes(Number(data.statusCode))) throw credentialsError();
    if (!response.ok || Number(data.statusCode) !== 200 || data.error) {
      throw new RequestError("JDoodle could not accept this run. Try again later.", 502);
    }
    return normalizeExecution(data, test.expectedOutput);
  } catch (error) {
    if (deadline.aborted) {
      throw new RequestError("Timed out waiting for JDoodle. It may have received the run.", 504);
    }
    if (error instanceof RequestError && (error.status >= 500 || error.status === 429)) throw error;
    throw new RequestError("JDoodle returned an invalid response or could not be reached.", 502);
  }
}

function quotaError() {
  return new RequestError("JDoodle's daily execution credits are exhausted. Try again after they reset.", 429);
}

function credentialsError() {
  return new RequestError("JDoodle rejected the server credentials. Check the execution setup.", 503);
}
