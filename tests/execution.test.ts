import assert from "node:assert/strict";
import { test } from "node:test";
import { executeRequest } from "../lib/execute-request.ts";
import { verifyEvidence } from "../lib/execution-evidence.ts";
import { compareOutput, createJudge0, normalizeResult } from "../lib/judge0.ts";
import { MAX_OUTPUT } from "../lib/execution-types.ts";

const base = "https://judge.example/api";
const secret = "local-test-secret";
const code = "int main() {}";
const encode = (text: string) => Buffer.from(text).toString("base64");
const request = (body: unknown) => new Request("https://app.example/api/execute", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("output comparison preserves spaces and final newline, and accepts CRLF", () => {
  assert.equal(compareOutput("hi\r\n", "hi\n"), true);
  assert.equal(compareOutput("hi\n", "hi"), false);
  assert.equal(compareOutput(" hi", "hi"), false);
  assert.equal(compareOutput("", ""), true);
});

test("normalizes actual statuses, empty output, metrics, and truncated display", () => {
  const outcome = (id: number) => normalizeResult({ status: { id } }, "");
  assert.equal(outcome(5).status, "timeout");
  assert.equal(outcome(6).status, "compile_error");
  assert.equal(outcome(11).status, "runtime_error");
  assert.equal(outcome(13).status, "provider_error");
  assert.equal(outcome(3).verdict, "passed");
  assert.equal(outcome(3).stdout, "");
  assert.equal(normalizeResult({ status: { id: 3 } }, null).verdict, "not_checked");
  const output = "x".repeat(MAX_OUTPUT + 1);
  const result = normalizeResult({ status: { id: 3 }, stdout: encode(output), time: "0.01", memory: 100 }, output);
  assert.equal(result.verdict, "passed");
  assert.equal(result.stdout.length, MAX_OUTPUT);
  assert.equal(result.truncated, true);
  assert.equal(result.time, 0.01);
  assert.equal(result.memory, 100);
});

test("submits multiple cases, polls queued jobs, and returns verified evidence", async () => {
  let count = 0;
  const polls = new Map<string, number>();
  const runner = createJudge0({ JUDGE0_URL: base, JUDGE0_AUTH_TOKEN: "test-token" }, async (url, init) => {
    assert.equal(new Headers(init?.headers).get("X-Auth-Token"), "test-token");
    const path = new URL(String(url)).pathname;
    if (path === "/api/languages") return Response.json([{ id: 4, name: "C" }, { id: 135, name: "C++ (GCC)" }]);
    if (path === "/api/submissions") {
      const payload = JSON.parse(String(init?.body));
      assert.equal(new URL(String(url)).searchParams.get("wait"), "false");
      assert.equal(payload.language_id, 135);
      assert.equal(payload.enable_network, false);
      assert.equal(payload.cpu_time_limit, 2);
      assert.equal(payload.source_code, encode(code));
      assert.ok([encode("hello"), ""].includes(payload.stdin));
      return Response.json({ token: String(count++) });
    }
    const token = path.split("/").at(-1)!;
    const previous = polls.get(token) ?? 0;
    polls.set(token, previous + 1);
    if (!previous) return Response.json({ status: { id: 1 } });
    return Response.json({ status: { id: 3 }, stdout: token === "0" ? encode("hello") : null });
  });
  const input = { code, testCases: [{ input: "hello", expectedOutput: "hello" }, { input: "", expectedOutput: "other" }] };
  const response = await executeRequest(request(input), "student", secret, runner);
  assert.equal(response.status, 200);
  const { results, evidence } = await response.json();
  assert.deepEqual(results.map((r: { verdict: string }) => r.verdict), ["passed", "failed"]);
  assert.deepEqual(verifyEvidence(secret, "student", input, evidence), results);
  assert.equal(verifyEvidence(secret, "student", { ...input, code: code + " " }, evidence), undefined);
  assert.equal(verifyEvidence(secret, "someone else", input, evidence), undefined);
  assert.equal(verifyEvidence(secret, "student", input, evidence + "x"), undefined);
  assert.equal((await executeRequest(request(input), "student", secret, runner)).status, 429);
});

test("rejects unauthenticated, malformed, cross-origin and oversized requests before provider work", async () => {
  const neverRun = async () => { assert.fail("Provider must not run"); };
  assert.equal((await executeRequest(request({ code }), undefined, secret, neverRun)).status, 401);
  assert.equal((await executeRequest(request({ code: 123 }), "student", secret, neverRun)).status, 400);
  assert.equal((await executeRequest(request({ code, testCases: [{}] }), "student", secret, neverRun)).status, 400);
  assert.equal((await executeRequest(request({ code: "x".repeat(33 * 1024) }), "student", secret, neverRun)).status, 400);
  const foreign = request({ code });
  foreign.headers.set("origin", "https://elsewhere.example");
  assert.equal((await executeRequest(foreign, "student", secret, neverRun)).status, 403);
});

test("reports provider failure without returning its response body", async () => {
  const run = createJudge0({ JUDGE0_URL: base }, async () => new Response("provider private info", { status: 502 }));
  const response = await executeRequest(request({ code }), "provider-error-test", secret, run);
  assert.equal(response.status, 502);
  assert.doesNotMatch(await response.text(), /private info/);
});
