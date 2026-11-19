import assert from "node:assert/strict";
import { chromium } from "playwright-core";
import { createRequire } from "node:module";
const require = createRequire(new URL("../package.json", import.meta.url));
const postgres = require("postgres");
const base = process.env.ROOM_TEST_ORIGIN || "http://localhost:3000";
if (!process.env.TEST_DATABASE_URL) throw new Error("Set TEST_DATABASE_URL to a migrated local test database.");
if (!["localhost","127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Browser fixture tests require a localhost app.");
const password = "room-test-only-password";
const stamp = Date.now();
const voiceCheck = process.argv.includes("--voice");
const providerChecks = !process.argv.includes("--collaboration-only");
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true,
  args: voiceCheck ? ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"] : [],
});
const database = postgres(process.env.TEST_DATABASE_URL);
try {
  async function account(letter) {
    const context = await browser.newContext({ ignoreHTTPSErrors: true, permissions: ["clipboard-read", "clipboard-write"] });
    if (voiceCheck) await context.addInitScript(() => {
      window.__demoConnections = [];
      window.__demoMicTracks = [];
      const getUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = async (...options) => {
        const stream = await getUserMedia(...options);
        window.__demoMicTracks.push(...stream.getTracks());
        return stream;
      };
      window.RTCPeerConnection = new Proxy(window.RTCPeerConnection, {
        construct(target, args) {
          const connection = Reflect.construct(target, args);
          window.__demoConnections.push(connection);
          return connection;
        },
      });
    });
    const email = `room-${letter}-${stamp}@example.test`;
    const registration = await context.request.post(base + "/api/auth/register", { data: { email, password } });
    assert.equal(registration.status(), 201);
    const page = await context.newPage();
    page.setDefaultTimeout(30000);
    page.on("pageerror", (error) => console.log(letter, "page error", error.message));
    page.on("console", (message) => { if (message.type() === "error") console.log(letter, message.text().replace(/access_token=[^&\s\x27]+/g, "access_token=[redacted]").slice(0, 350)); });
    await page.goto(base + "/login?callbackUrl=/collaborate");
    await page.locator('input[type="email"]').fill(email);
    await page.locator('input[type="password"]').fill(password);
    await page.getByRole("button", { name: "Sign In" }).click();
    await page.waitForURL("**/collaborate");
    await page.getByRole("button", { name: "Create room" }).waitFor();
    return { page, context, email };
  }
  const [a, b, c] = await Promise.all(["a", "b", "c"].map(account));
  await a.page.getByRole("button", { name: "Create room" }).click();
  await a.page.waitForURL(/\/collaborate\/[a-f0-9-]{36}$/);
  const url = a.page.url();
  const id = url.split("/").at(-1);
  const rawRoom = (await database`select invite_code from debug_rooms where id=${id}`)[0];
  await a.page.getByRole("button", { name: "Copy Invite Link" }).click();
  const invite = await a.page.evaluate(() => navigator.clipboard.readText());
  assert.equal(new URL(invite).searchParams.get("invite"), rawRoom.invite_code);
  console.log("A created a room and copied its invitation.");

  await b.page.goto(invite);
  await b.page.getByRole("button", { name: "Request access" }).click();
  await b.page.waitForURL(url);
  await b.page.getByRole("heading", { name: "Waiting for the owner" }).waitFor();
  assert.equal((await b.context.request.post(base + "/api/liveblocks-auth", { data: { room: "debug-" + id } })).status(), 403);

  await c.page.goto(url);
  assert.equal((await c.context.request.post(base + "/api/liveblocks-auth", { data: { room: "debug-" + id } })).status(), 403);
  assert.equal(await c.page.getByRole("heading", { name: "Shared editor · main.cpp" }).count(), 0);
  await a.page.getByRole("button", { name: "Admit", exact: true }).click();
  await b.page.getByRole("button", { name: "Shared code", exact: true }).waitFor();
  await a.page.getByRole("button", { name: "Shared code", exact: true }).click();
  await b.page.getByRole("button", { name: "Shared code", exact: true }).click();
  await c.page.goto(invite);
  await c.page.getByRole("button", { name: "Request access" }).click();
  await c.page.getByRole("alert").filter({ hasText: "two participants" }).waitFor();
  console.log("B requested access and joined after A admitted them. C was refused.");

  const ready = (page) => page.waitForFunction(() => window.monaco?.editor.getEditors().some((editor) =>
    editor.getModel() && !editor.getOption(window.monaco.editor.EditorOption.readOnly)), { timeout: 30000 });
  const set = (page, source) => page.evaluate((code) => {
    const model = window.monaco.editor.getModels()[0];
    model.applyEdits([{ range: model.getFullModelRange(), text: code }]);
  }, source);
  const value = (page) => page.evaluate(() => window.monaco.editor.getModels()[0].getValue());
  const matches = (page, source) => page.waitForFunction((code) => window.monaco?.editor.getModels()[0]?.getValue() === code, source);
  const append = (page, text) => page.evaluate((text) => {
    const model = window.monaco.editor.getModels()[0];
    const position = model.getPositionAt(model.getValueLength());
    model.applyEdits([{ range: new window.monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column), text }]);
  }, text);

  await Promise.all([ready(a.page), ready(b.page)]);
  assert.equal(await value(a.page), await value(b.page));
  await set(a.page, "int main() { return 0; }");
  await matches(b.page, "int main() { return 0; }");
  await append(b.page, "\n// B");
  await new Promise((resolve) => setTimeout(resolve, 1200));
  console.log("B edit captured:", JSON.stringify([await value(a.page), await value(b.page)]));
  await matches(a.page, "int main() { return 0; }\n// B");
  await Promise.all([append(a.page, "\n// A parallel"), append(b.page, "\n// B parallel")]);
  await a.page.waitForFunction(() => ["// A parallel", "// B parallel"].every((text) => window.monaco.editor.getModels()[0].getValue().includes(text)));
  const shared = await value(a.page);
  await matches(b.page, shared);
  await b.page.reload();
  await ready(b.page);
  await matches(b.page, shared);
  const duplicate = await b.context.newPage();
  await duplicate.goto(url);
  await ready(duplicate);
  await matches(duplicate, shared);
  await a.page.getByRole("heading", { name: "Participants · 2/2" }).waitFor();
  console.log("Liveblocks and Monaco passed bidirectional edits, simultaneous convergence, reload, and a second tab for B.");

  if (process.argv.includes("--board") || process.argv.includes("--voice")) {
    async function whiteboard(page) {
      await page.getByRole("button", { name: "Whiteboard" }).click();
      await page.getByRole("button", { name: /^pen$/i }).waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll("button")].some((button) =>
        button.innerText.toLowerCase() === "pen" && !button.disabled));
    }
    async function draw(page, start, end) {
      const bounds = await page.getByLabel("Shared drawing canvas").boundingBox();
      await page.mouse.move(bounds.x + bounds.width * start[0], bounds.y + bounds.height * start[1]);
      await page.mouse.down();
      await page.mouse.move(bounds.x + bounds.width * end[0], bounds.y + bounds.height * end[1], { steps: 12 });
      await page.mouse.up();
    }
    const pixel = (page, x, y, alpha) => page.waitForFunction(({ x, y, alpha }) => {
      const canvas = document.querySelector("canvas[aria-label='Shared drawing canvas']");
      if (!canvas?.clientWidth) return false;
      const value = canvas.getContext("2d").getImageData(Math.round(canvas.width * x), Math.round(canvas.height * y), 1, 1).data[3];
      return alpha ? value > 20 : value === 0;
    }, { x, y, alpha });
    await Promise.all([whiteboard(a.page), whiteboard(b.page)]);
    await a.page.getByRole("button", { name: "Blue", exact: true }).click();
    await b.page.getByRole("button", { name: "Green", exact: true }).click();
    await Promise.all([draw(a.page, [0.2, 0.25], [0.7, 0.25]), draw(b.page, [0.2, 0.65], [0.7, 0.65])]);
    await Promise.all([pixel(a.page, 0.45, 0.65, true), pixel(b.page, 0.45, 0.25, true)]);
    await a.page.getByRole("button", { name: "Shared code" }).click();
    await append(a.page, "\n// Editing while the other participant draws");
    await draw(b.page, [0.2, 0.8], [0.7, 0.8]);
    await whiteboard(a.page);
    await pixel(a.page, 0.45, 0.8, true);
    await b.page.getByRole("button", { name: "Shared code" }).click();
    await matches(b.page, shared + "\n// Editing while the other participant draws");
    await whiteboard(b.page);

    await b.page.getByRole("button", { name: /^eraser$/i }).click();
    await draw(b.page, [0.45, 0.19], [0.45, 0.31]);
    await pixel(a.page, 0.45, 0.25, false);
    await pixel(a.page, 0.55, 0.25, true);
    await b.page.setViewportSize({ width: 1050, height: 900 });
    await pixel(b.page, 0.55, 0.25, true);
    await b.page.reload();
    await whiteboard(b.page);
    await pixel(b.page, 0.55, 0.25, true);
    await pixel(b.page, 0.45, 0.25, false);

    a.page.once("dialog", (dialog) => dialog.accept());
    await a.page.getByRole("button", { name: "Clear board" }).click();
    await Promise.all([pixel(a.page, 0.55, 0.25, false), pixel(b.page, 0.55, 0.25, false), pixel(b.page, 0.45, 0.65, false)]);
    console.log("Whiteboard passed concurrent strokes, code alongside drawing, remote erasing, resize, reload, and shared clear.");
  }

  if (voiceCheck) {
    const join = (page) => page.getByRole("button", { name: "Join call", exact: true }).click();
    const button = (page, name) => page.getByRole("button", { name, exact: true });
    const rejected = await c.context.request.post(base + "/api/voice-token", { data: { roomId: id } });
    assert.equal(rejected.status(), 403);
    const voiceToken = await a.context.request.post(base + "/api/voice-token", { data: { roomId: id } });
    assert.equal(voiceToken.status(), 200);
    const { token } = await voiceToken.json();
    const claims = JSON.parse(Buffer.from(token.split(".")[1], "base64url"));
    assert.equal(claims.video.room, "debug-" + id);
    assert.deepEqual(claims.video.canPublishSources, ["microphone", "camera"]);
    assert.equal(claims.video.canPublishData, false);
    assert.equal(claims.roomConfig.maxParticipants, 2);

    await Promise.all([join(a.page), join(b.page)]);
    await Promise.all([button(a.page, "Turn camera on").waitFor(), button(b.page, "Turn camera on").waitFor()]);
    assert.equal(await a.page.locator("video").count(), 0);
    await Promise.all([button(a.page, "Unmute microphone").click(), button(b.page, "Unmute microphone").click()]);
    await Promise.all([button(a.page, "Turn camera on").click(), button(b.page, "Turn camera on").click()]);
    for (const page of [a.page, b.page]) await page.waitForFunction(() => {
      const videos = [...document.querySelectorAll("video")];
      return videos.length === 2 && videos.every((video) => video.videoWidth > 0 && !video.paused);
    });
    await button(a.page, "Turn camera off").click();
    await b.page.waitForFunction(() => document.querySelectorAll("video").length === 1);
    await button(a.page, "Turn camera on").click();
    await b.page.waitForFunction(() => document.querySelectorAll("video").length === 2);
    await a.page.getByRole("button", {name:"Shared code",exact:true}).click();
    const duringCall = await value(a.page);
    await append(a.page, "\n// editing during video");
    await matches(b.page,duringCall+"\n// editing during video");
    await draw(b.page,[0.2,0.45],[0.7,0.45]);
    await whiteboard(a.page);
    await pixel(a.page,0.45,0.45,true);
    console.log("Both participants render Cloud video; camera off/on, editing, and drawing during the video call passed.");
    const heard = (page) => page.waitForFunction(async () => {
      const player = document.querySelector("audio");
      if (!player || player.paused || !player.srcObject?.getAudioTracks().length) return false;
      for (const pc of window.__demoConnections) {
        const stats = await pc.getStats();
        for (const item of stats.values()) {
          if (item.type === "inbound-rtp" && (item.kind === "audio" || item.mediaType === "audio") && item.bytesReceived > 0) return true;
        }
      }
      return false;
    });
    await Promise.all([heard(a.page), heard(b.page)]);
    await button(a.page, "Mute microphone").click();
    await button(a.page, "Unmute microphone").waitFor();
    await button(a.page, "Unmute microphone").click();
    await button(a.page, "Mute microphone").waitFor();

    await button(b.page, "Leave call").click();
    await b.page.waitForFunction(() => window.__demoMicTracks.length > 0 && window.__demoMicTracks.every((track) => track.readyState === "ended") && !document.querySelector("audio"));
    await b.page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException("Test permission denied", "NotAllowedError");
      };
    });
    await join(b.page);
    await button(b.page, "Turn camera on").click();
    await b.page.getByText(/Camera permission denied/).waitFor();
    await button(b.page, "Unmute microphone").click();
    await b.page.getByText(/Microphone permission denied/).waitFor();
    await heard(b.page);
    await button(b.page, "Leave call").click();
    await button(a.page, "Leave call").click();
    await a.page.waitForFunction(() => window.__demoMicTracks.length > 0 && window.__demoMicTracks.every((track) => track.readyState === "ended") && !document.querySelector("audio"));
    console.log("Video/audio passed two-way reception, camera on/off, mute/unmute, denied devices, media cleanup, and third-account rejection.");
    await join(a.page);
    await button(a.page, "Turn camera on").waitFor();
    console.log("Rejoining after disconnect passed.");
    if (providerChecks) {
    await button(a.page, "Turn camera on").click();

    const endpoint = base + "/api/rooms/" + id + "/activities";
    assert.equal((await c.context.request.get(endpoint)).status(), 403);
    assert.equal((await c.context.request.post(endpoint, {data:{}})).status(), 403);
    await a.page.getByRole("button", {name:"Shared code",exact:true}).click();
    await set(a.page, "int main() { return 0; }");
    await a.page.getByRole("button", {name:"Run Code",exact:true}).click();
    await a.page.getByText("success · not checked", {exact:true}).waitFor();
    await b.page.getByText("success · not checked", {exact:true}).waitFor();
    const historyA = await (await a.context.request.get(endpoint)).json();
    const historyB = await (await b.context.request.get(endpoint)).json();
    assert.equal(historyA.activities[0].id, historyB.activities[0].id);
    const operationId = historyA.activities[0].id;
    const duplicate = await b.context.request.post(endpoint, {data:{code:"int main() { return 0; }",testCases:[{input:"",expectedOutput:null}],operation:{id:operationId,kind:"execution"}}});
    assert.equal(duplicate.status(), 200);
    assert.equal((await duplicate.json()).activity.id, operationId);
    await append(a.page,"\n// later edit");
    await a.page.getByText("This result belongs to an older code snapshot.").waitFor();
    await new Promise((resolve) => setTimeout(resolve,5100));
    await b.page.getByRole("button",{name:"Generate Debug Report",exact:true}).click();
    await b.page.getByRole("button",{name:"Download report",exact:true}).waitFor();
    await a.page.getByRole("button",{name:"Download report",exact:true}).waitFor();
    assert.match(await b.page.getByText("# Debugging session report",{exact:false}).innerText(), /No AI analysis was recorded/);
    const downloaded = b.page.waitForEvent("download");
    await b.page.getByRole("button",{name:"Download report",exact:true}).click();
    assert.ok((await downloaded).suggestedFilename().endsWith(".md"));
    console.log("Room execution, cross-account results, request replay, stale source, report sharing and download passed.");
    await new Promise((resolve) => setTimeout(resolve,5100));
    const analysisResponse = a.page.waitForResponse((response) => response.url() === endpoint && response.request().method() === "POST", {timeout:65000});
    await a.page.getByRole("button",{name:"Analyze with AI",exact:true}).click();
    const analysisData = await (await analysisResponse).json();
    const savedAnalysis = analysisData.activities.find((row) => row.kind === "analysis");
    assert.equal(savedAnalysis.status,"complete", savedAnalysis.error ?? "");
    assert.ok(savedAnalysis.content.length > 20);
    await b.page.locator(`[data-analysis-id="${savedAnalysis.id}"]`).waitFor();
    assert.ok(savedAnalysis.analysis);
    await button(a.page,"Leave call").click();
    console.log("Live Gemini analysis persisted and appeared for both accounts while the call remained active.");
    } else { await button(a.page,"Leave call").click(); }
  }

  const [owner] = await database`select id from "user" where email=${a.email}`;
  const [other] = await database`select id from "user" where email=${b.email}`;
  const [report] = await database`insert into bug_reports (user_id,code_snippet,bug_type,severity)
    values (${owner.id},'int alpha;','Memory leak','High') returning id`;
  const [foreign] = await database`insert into bug_reports (user_id,code_snippet,bug_type,severity)
    values (${other.id},'int private_source;','Private category','High') returning id`;
  await database`insert into bug_reports (user_id,code_snippet,bug_type,severity)
    values (${owner.id},'int beta;','Null pointer','High'),(${owner.id},'int alpha;','Clean code','Low')`;
  const analytics = await a.context.newPage();
  await analytics.goto(base + "/analytics?report=" + report.id, { waitUntil: "domcontentloaded" });
  await analytics.getByText("Memory leak", { exact: true }).waitFor();
  assert.equal(await analytics.getByText("Null pointer", { exact: true }).count(), 0);
  assert.equal(await analytics.getByText("Clean code", { exact: true }).count(), 0);
  await analytics.goto(base + "/analytics?report=" + foreign.id, { waitUntil: "domcontentloaded" });
  await analytics.getByText("This code report is unavailable.").waitFor();
  console.log("Analytics filtered correctly by exact source and rejected a report from a different account.");
  if (providerChecks) {
  await new Promise((resolve) => setTimeout(resolve,5100));
  await analytics.goto(base + "/");
  await ready(analytics);
  await analytics.getByRole("button",{name:"Analyze with AI",exact:true}).waitFor();
  await analytics.waitForTimeout(500);
  await analytics.evaluate(() => window.monaco.editor.getEditors()[0].focus());
  await analytics.keyboard.press("ControlOrMeta+A");
  await analytics.keyboard.insertText("int main() {\n    return missing;\n}");
  const executed = analytics.waitForResponse((response) => response.url() === base + "/api/execute");
  await analytics.getByRole("button",{name:"Run Code",exact:true}).click();
  const actual = await (await executed).json();
  assert.ok(actual.result,actual.error ?? "Execution result missing");
  assert.equal(actual.result.status,"compile_error");
  await new Promise((resolve) => setTimeout(resolve,5100));
  const analyzed = analytics.waitForResponse((response) => response.url() === base + "/api/analyze",{timeout:65000});
  await analytics.getByRole("button",{name:"Analyze with AI",exact:true}).click();
  const json = await (await analyzed).json();
  assert.ok(json.report,json.error??"Missing structured report");
  assert.ok(json.report.findings.length > 0);
  assert.equal(json.report.executions[0].result.status,"compile_error");
  await analytics.getByRole("article",{name:"AI analysis report"}).waitFor();
  const supported = json.report.findings.find((finding) => finding.startLine);
  if(supported) {
    await analytics.getByRole("button",{name:supported.title,exact:true}).click();
    await analytics.waitForFunction(() => document.querySelectorAll(".finding-source-line").length > 0);
  }
  if (process.env.BROWSER_SCREENSHOT) await analytics.screenshot({ path: process.env.BROWSER_SCREENSHOT });
  console.log("Home analysis renders real structured Gemini findings, verified compilation errors, and supported Monaco line highlights.");
  }
  console.log("Room for manual testing:", url);
} finally {
  await database.end();
  await browser.close();
}
