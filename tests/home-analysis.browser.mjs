import assert from "node:assert/strict";
import { chromium } from "playwright-core";

const base = process.env.ROOM_TEST_ORIGIN || "http://localhost:3000";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Use a local test app.");
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true,
});
try {
  const context = await browser.newContext();
  const email = "analysis-" + Date.now() + "@example.test";
  const password = "analysis-browser-test";
  assert.equal((await context.request.post(base + "/api/auth/register", { data: { email, password } })).status(), 201);
  const { csrfToken } = await (await context.request.get(base + "/api/auth/csrf")).json();
  await context.request.post(base + "/api/auth/callback/credentials", { form: { email, password, csrfToken, json: "true" } });
  const page = await context.newPage();
  page.setDefaultTimeout(25000);
  await page.goto(base);
  await page.getByRole("button", { name: "Analyze with AI", exact: true }).waitFor();
  await page.waitForFunction(() => window.monaco?.editor.getEditors().length > 0);
  let source = "int main() {\n    return missing;\n}";
  await page.evaluate(() => window.monaco.editor.getEditors()[0].focus());
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.insertText(source);
  source = await page.evaluate(() => window.monaco.editor.getModels()[0].getValue());
  assert.ok(source.includes("return missing;"));
  await page.waitForFunction((code) => window.monaco.editor.getModels()[0].getValue() === code, source);

  const executed = page.waitForResponse((response) => response.url() === base + "/api/execute");
  await page.getByRole("button", { name: "Run Code", exact: true }).click();
  const executionResponse = await executed;
  assert.equal(executionResponse.request().postDataJSON().code, source);
  const execution = await executionResponse.json();
  assert.ok(execution.result, execution.error ?? "Missing execution result");
  assert.equal(execution.result.status, "compile_error");

  await page.waitForTimeout(5100);
  const analyzed = page.waitForResponse((response) => response.url() === base + "/api/analyze", { timeout: 65000 });
  await page.getByRole("button", { name: "Analyze with AI", exact: true }).click();
  const response = await analyzed;
  const data = await response.json();
  assert.equal(response.status(), 200, data.error ?? "");
  assert.ok(data.report.findings.length > 0);
  assert.equal(data.report.executions[0].result.status, "compile_error");
  const article = page.getByRole("article", { name: "AI analysis report" });
  await article.waitFor();
  const supported = data.report.findings.find((finding) => finding.startLine);
  assert.ok(supported, "The sample should have a supported source quote.");
  await page.getByRole("button", { name: supported.title, exact: true }).click();
  await page.waitForFunction(() => document.querySelectorAll(".finding-source-line").length > 0);
  if (process.env.BROWSER_SCREENSHOT) await page.screenshot({ path: process.env.BROWSER_SCREENSHOT });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(200);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1));
  }
  console.log("Home PASS: keyboard edits submitted correctly, real compiler evidence, validated Gemini cards, Monaco highlight, 320/390/768/1440px layouts.");
} finally {
  await browser.close();
}
