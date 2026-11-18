import { readRunInput } from "./execution-input.ts";
import { signEvidence } from "./execution-evidence.ts";
import { RequestError } from "./request-body.ts";
import { RUN_LIMIT_MS, type RunInput, type ExecutionResult } from "./execution-types.ts";

const recentRuns = new Map<string, number>();

export async function executeRequest(
  request: Request, userId: string | undefined, secret: string | undefined,
  run: (input: RunInput, signal: AbortSignal) => Promise<ExecutionResult[]>,
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
    const { input } = await readRunInput(request);
    const now = Date.now();
    for (const [id, expires] of recentRuns) if (expires <= now) recentRuns.delete(id);
    if (recentRuns.has(userId) || recentRuns.size >= 500) {
      return reply({ error: "Please wait before running code again." }, 429, { "Retry-After": "25" });
    }
    recentRuns.set(userId, now + RUN_LIMIT_MS);
    const results = await run(input, request.signal);
    const evidence = results.map((result) => ({
      ...result, stdout: result.stdout.slice(0, 1000), stderr: result.stderr.slice(0, 1000),
      compileOutput: result.compileOutput.slice(0, 1000),
      truncated: result.truncated || [result.stdout, result.stderr, result.compileOutput].some((text) => text.length > 1000),
    }));
    return reply({ results, evidence: signEvidence(secret, userId, input, evidence) });
  } catch (error) {
    if (error instanceof RequestError) return reply({ error: error.message }, error.status);
    if (error instanceof DOMException && error.name === "TimeoutError") {
      return reply({ error: "Execution provider did not respond in time." }, 504);
    }
    return reply({ error: "Execution provider unavailable. Check the provider configuration and try again." }, 502);
  }
}
