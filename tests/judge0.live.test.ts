import { test } from "node:test";
import assert from "node:assert/strict";
import { createJudge0 } from "../lib/judge0.ts";

const skip = !process.env.JUDGE0_URL && "Set JUDGE0_URL and any required credentials to run live tests.";
test("live sandbox: C++ stdin/stdout, several tests, and empty output", { skip }, async () => {
  const run = createJudge0();
  const results = await run({
    code: "#include <iostream>\nint main(){int n; if(std::cin >> n) std::cout << n*2 << '\\n';}",
    testCases: [{ input: "21", expectedOutput: "42\n" }, { input: "3", expectedOutput: "6\n" }, { input: "", expectedOutput: "" }],
  });
  assert.deepEqual(results.map(({ status }) => status), ["success", "success", "success"]);
  assert.deepEqual(results.map(({ verdict }) => verdict), ["passed", "passed", "passed"]);
  assert.equal(results[2].stdout, "");
});

test("live sandbox: compile error, nonzero exit, and infinite loop", { skip }, async () => {
  const run = createJudge0();
  const [compile, runtime, timeout] = await Promise.all([
    run({ code: "int main() { invalid_identifier; }", testCases: [] }),
    run({ code: "int main() { return 7; }", testCases: [] }),
    run({ code: "int main() { volatile unsigned n = 0; while (true) n = n + 1; }", testCases: [] }),
  ]);
  assert.equal(compile[0].status, "compile_error");
  assert.ok(compile[0].compileOutput);
  assert.equal(runtime[0].status, "runtime_error");
  assert.equal(timeout[0].status, "timeout");
});
