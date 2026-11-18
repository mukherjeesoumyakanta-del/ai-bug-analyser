import { readRunInput } from "./execution-input.ts";
import { signEvidence, verifyEvidence } from "./execution-evidence.ts";
import { RequestError } from "./request-body.ts";
import type { CaseResults, ExecutionResult, TestCase } from "./execution-types.ts";

const recentRuns = new Map<string, number>();
const COOLDOWN_SECONDS = 5;

export async function executeRequest(
  request: Request, userId: string | undefined, secret: string | undefined,
  run: (code: string, test: TestCase, signal: AbortSignal) => Promise<ExecutionResult>,
) {
  const reply = (body: object, status = 200, headers: HeadersInit = {}) =>
    Response.json(body, { status, headers: { "Cache-Control": "no-store", ...headers } });
  if (!userId) return reply({ error: "Please sign in to run code." }, 401);
  const origin = request.headers.get("origin");
  if (request.headers.get("sec-fetch-site") === "cross-site" ||
      (origin && origin !== new URL(request.url).origin && origin !== process.env.NEXTAUTH_URL)) {
    return reply({ error: "Run requests must come from this site." }, 403);
  }
  if (!secret) return reply({ error: "Code execution is not configured." }, 503);

  try {
    const { input, evidence, caseIndex } = await readRunInput(request);
    const cases = input.testCases.length ? input.testCases : [{ input: "", expectedOutput: null }];
    if (typeof caseIndex !== "number" || !Number.isInteger(caseIndex) || caseIndex < 0 || caseIndex >= cases.length) {
      throw new RequestError("Select a valid test case.");
    }

    const now = Date.now();
    for (const [id, expires] of recentRuns) if (expires <= now) recentRuns.delete(id);
    if (recentRuns.has(userId) || recentRuns.size >= 500) {
      return reply({ error: "A run is active or just started. Wait a few seconds before running again." },
        429, { "Retry-After": String(COOLDOWN_SECONDS) });
    }
    recentRuns.set(userId, Infinity);
    try {
      const result = await run(input.code, cases[caseIndex], request.signal);
      const results: CaseResults = verifyEvidence(secret, userId, input, evidence) ?? cases.map(() => null);
      results[caseIndex] = {
        ...result,
        output: result.output.slice(0, 1000),
        truncated: result.truncated || result.output.length > 1000,
      };
      return reply({ result, evidence: signEvidence(secret, userId, input, results) });
    } finally {
      recentRuns.set(userId, now + COOLDOWN_SECONDS * 1000);
    }
  } catch (error) {
    if (error instanceof RequestError) return reply({ error: error.message }, error.status);
    return reply({ error: "Execution provider unavailable. Try again later." }, 502);
  }
}
