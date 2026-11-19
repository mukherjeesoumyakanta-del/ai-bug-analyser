import assert from "node:assert/strict";
import { test } from "node:test";
import { debugReport } from "../lib/debug-report.ts";
import { invitationCode, roomId } from "../lib/room-id.ts";
import type { Activity } from "../lib/activity-types.ts";

test("room IDs and invitation links reject malformed input", () => {
  const id = "11111111-1111-4111-8111-111111111111";
  assert.equal(roomId(id), id);
  assert.equal(roomId("../../users"), null);
  assert.equal(invitationCode("https://example.test/collaborate?invite=" + id), id);
  assert.equal(invitationCode("javascript:alert(1)"), null);
});

test("reports state missing evidence and preserve source without claiming a fix", () => {
  const report = debugReport([], "int main() {}");
  assert.match(report, /No executions were recorded/);
  assert.match(report, /No initial recorded snapshot/);
  assert.match(report, /root cause has not been established/);
  const row = { id: "sample", kind: "execution", code: "before", testCases: [], caseIndex: 0,
    status: "error", result: null, error: "Provider unavailable", createdAt: "2026-11-19", content: null } as unknown as Activity;
  const changed = debugReport([row], "after");
  assert.match(changed, /does not establish that a bug was fixed/);
  assert.match(changed, /Provider unavailable/);
  assert.match(changed, /program unavailable/);
});
