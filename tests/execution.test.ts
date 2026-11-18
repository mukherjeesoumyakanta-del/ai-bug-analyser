import assert from "node:assert/strict";
import { test } from "node:test";
import { runCode, compareOutput, normalizeExecution } from "../lib/code-execution.ts";
import { executeRequest } from "../lib/execute-request.ts";
import { verifyEvidence } from "../lib/execution-evidence.ts";
import { MAX_OUTPUT, type TestCase } from "../lib/execution-types.ts";

const secret = "local-signing-secret";
const credentials = { JDOODLE_CLIENT_ID: "test-client", JDOODLE_CLIENT_SECRET: "test-secret" };
const code = "int main() {}";
const signal = new AbortController().signal;
const emptyTest = { input: "", expectedOutput: null };
const success = { statusCode: 200, isCompiled: true, isExecutionSuccess: true, cpuTime: "0.01", memory: "3308" };
const request = (body: unknown) => new Request("https://app.example/api/execute", {
  method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
});

test("compares the returned output exactly apart from CRLF", () => {
  assert.equal(compareOutput("a\r\nb", "a\nb"), true);
  assert.equal(compareOutput("42", "42\n"), false);
  assert.equal(compareOutput(" 42", "42"), false);
  assert.equal(compareOutput("", ""), true);
});

test("normalizes compile errors, runtime failures and JDoodle timeout despite request status 200", () => {
  const timeout = "\n\n JDoodle - Timeout \nIf your program reads input, please enter the inputs.";
  const fixtures = [
    { status: "compile_error", output: "jdoodle.cpp:1: error: undefined", isCompiled: false },
    { status: "runtime_error", output: "Command exited with non-zero status 7", isCompiled: true },
    { status: "timeout", output: timeout, isCompiled: false },
  ];
  for (const { status, ...fields } of fixtures) {
    const result = normalizeExecution({ statusCode: 200, isExecutionSuccess: false, ...fields }, fields.output);
    assert.equal(result.status, status);
    assert.equal(result.output, fields.output);
    assert.equal(result.verdict, "failed");
  }
  const unknown = normalizeExecution({ statusCode: 200, output: "42" }, "42");
  assert.equal(unknown.status, "unknown");
  assert.equal(unknown.verdict, "not_checked");
});

test("accepts empty stdout and compares full output before shortening the preview", () => {
  const empty = normalizeExecution({ ...success, output: "" }, "");
  assert.equal(empty.verdict, "passed");
  assert.equal(empty.output, "");
  assert.equal(empty.time, 0.01);
  assert.equal(empty.memory, 3308);
  const output = "x".repeat(MAX_OUTPUT + 1);
  const long = normalizeExecution({ ...success, output }, output);
  assert.equal(long.verdict, "passed");
  assert.equal(long.output.length, MAX_OUTPUT);
  assert.equal(long.truncated, true);
});

test("runs only the selected case per click and accumulates signed evidence", async (context) => {
  context.mock.timers.enable({ apis: ["Date"], now: 10_000 });
  const inputs: string[] = [];
  const runner = (script: string, testCase: TestCase, requestSignal: AbortSignal) =>
    runCode(script, testCase, requestSignal, credentials, async (url, init) => {
      assert.equal(url, "https://api.jdoodle.com/v1/execute");
      assert.equal(init?.method, "POST");
      const body = JSON.parse(String(init?.body));
      assert.deepEqual(body, {
        clientId: "test-client", clientSecret: "test-secret", script: code, stdin: testCase.input,
        language: "cpp17", versionIndex: "3",
      });
      inputs.push(body.stdin);
      return Response.json({ ...success, output: body.stdin });
    });
  const input = { code, testCases: [
    { input: "first", expectedOutput: "wrong" }, { input: "second", expectedOutput: "second" },
  ] };

  const first = await executeRequest(request({ ...input, caseIndex: 1 }), "student", secret, runner);
  assert.equal(first.status, 200);
  const firstRun = await first.json();
  assert.deepEqual(inputs, ["second"]);
  assert.equal(firstRun.result.verdict, "passed");
  assert.deepEqual(verifyEvidence(secret, "student", input, firstRun.evidence), [null, firstRun.result]);
  assert.equal((await executeRequest(request(input), "student", secret, runner)).status, 429);
  assert.deepEqual(inputs, ["second"]);

  context.mock.timers.tick(5000);
  const second = await executeRequest(request({ ...input, caseIndex: 0, evidence: firstRun.evidence }), "student", secret, runner);
  assert.equal(second.status, 200);
  const secondRun = await second.json();
  assert.deepEqual(inputs, ["second", "first"]);
  assert.equal(secondRun.result.verdict, "failed");
  assert.deepEqual(verifyEvidence(secret, "student", input, secondRun.evidence), [secondRun.result, firstRun.result]);
  assert.equal(verifyEvidence(secret, "other", input, secondRun.evidence), undefined);
  assert.equal(verifyEvidence(secret, "student", { ...input, code: code + " " }, secondRun.evidence), undefined);
  assert.equal(verifyEvidence(secret, "student", input, secondRun.evidence + "x"), undefined);
});

test("rejects invalid, unauthenticated, cross-origin and oversized requests before running", async () => {
  const neverRun = async () => { assert.fail("Provider must not run"); };
  assert.equal((await executeRequest(request({ code }), undefined, secret, neverRun)).status, 401);
  assert.equal((await executeRequest(request({ code: 123 }), "invalid", secret, neverRun)).status, 400);
  assert.equal((await executeRequest(request({ code, caseIndex: 3 }), "invalid", secret, neverRun)).status, 400);
  assert.equal((await executeRequest(request({ code, testCases: Array(5).fill(emptyTest) }), "invalid", secret, neverRun)).status, 400);
  assert.equal((await executeRequest(request({ code: "x".repeat(33 * 1024) }), "invalid", secret, neverRun)).status, 400);

  const foreign = request({ code });
  foreign.headers.set("origin", "https://elsewhere.example");
  assert.equal((await executeRequest(foreign, "invalid", secret, neverRun)).status, 403);
});

test("reports quota, provider and credential errors without exposing provider messages or retrying", async () => {
  let calls = 0;
  for (const [http, providerStatus, expectedStatus] of [[429, 429, 429], [200, 429, 429], [200, 401, 503], [503, 503, 502]]) {
    const runner = (script: string, testCase: TestCase, requestSignal: AbortSignal) =>
      runCode(script, testCase, requestSignal, credentials, async () => {
        const data = { statusCode: providerStatus, error: "private provider details" };
        calls++;
        return Response.json(data, { status: http });
      });
    const response = await executeRequest(request({ code }), `error-${calls}`, secret, runner);
    assert.equal(response.status, expectedStatus);
    const body = await response.text();
    assert.doesNotMatch(body, /private provider details|test-secret/);
    if (expectedStatus === 429) assert.match(body, /daily execution credits/);
  }
  assert.equal(calls, 4);
  await assert.rejects(runCode(code, emptyTest, signal, {}), /not configured/);
});
