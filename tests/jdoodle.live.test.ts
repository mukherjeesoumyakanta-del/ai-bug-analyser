import assert from "node:assert/strict";
import { test } from "node:test";
import { runCode } from "../lib/code-execution.ts";

const skip = (!process.env.JDOODLE_CLIENT_ID || !process.env.JDOODLE_CLIENT_SECRET) &&
  "Set JDoodle credentials to run this one-credit live test.";

test("live JDoodle C++17 run reads stdin and returns expected output", { skip }, async () => {
  const code = '#include <iostream>\nint main() { int n; std::cin >> n; std::cout << n * 2 << "\\n"; }';
  const result = await runCode(code, { input: "21", expectedOutput: "42" }, new AbortController().signal);
  assert.equal(result.status, "success");
  assert.equal(result.output, "42");
  assert.equal(result.verdict, "passed");
});
