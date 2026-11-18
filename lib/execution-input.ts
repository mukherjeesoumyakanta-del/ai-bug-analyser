import { MAX_CASES, MAX_CASE_TEXT, MAX_CODE, type RunInput } from "./execution-types.ts";
import { readJson, record, RequestError } from "./request-body.ts";

export async function readRunInput(request: Request) {
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
    throw new RequestError("Send an application/json request.", 415);
  }
  const body = record(await readJson(request, 700 * 1024));
  const { code, testCases = [], evidence } = body;
  if (typeof code !== "string" || !code.trim() || Buffer.byteLength(code) > MAX_CODE) {
    throw new RequestError("Enter nonblank C++ code of at most 32 KiB.");
  }
  if (!Array.isArray(testCases) || testCases.length > MAX_CASES) {
    throw new RequestError("Send at most four test cases.");
  }
  const input: RunInput = {
    code,
    testCases: testCases.map((item) => {
      const { input, expectedOutput } = record(item);
      if (typeof input !== "string" || Buffer.byteLength(input) > MAX_CASE_TEXT ||
          (expectedOutput !== null &&
            (typeof expectedOutput !== "string" || Buffer.byteLength(expectedOutput) > MAX_CASE_TEXT))) {
        throw new RequestError("Each input or expected output must be at most 8 KiB.");
      }
      return { input, expectedOutput };
    }),
  };
  return { input, evidence: typeof evidence === "string" && evidence.length < 180_000 ? evidence : undefined };
}
