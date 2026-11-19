import { eq } from "drizzle-orm";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { roomApiError, requireRoomMember } from "@/lib/room-access";
import { roomId } from "@/lib/room-id";
import { listActivities, reserveActivity } from "@/lib/room-activities";
import { readRunInput } from "@/lib/execution-input";
import { record, RequestError } from "@/lib/request-body";
import { runCode } from "@/lib/code-execution";
import { analysisError } from "@/lib/ai-error";
import { generateAnalysis, saveAnalysis } from "@/lib/ai-analysis";
import { debugReport } from "@/lib/debug-report";
import type { CaseResults } from "@/lib/execution-types";
import type { Activity } from "@/lib/activity-types";

export const maxDuration = 60;
type Context = { params: Promise<{ id: string }> };

export async function GET(_: Request, context: Context) {
  try {
    const { id } = await requireRoomMember((await context.params).id);
    return Response.json({ activities: await listActivities(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return roomApiError(error, "Room history is unavailable.");
  }
}

export async function POST(request: Request, context: Context) {
  try {
    const { id, user } = await requireRoomMember((await context.params).id);
    const { input, caseIndex, operation } = await readRunInput(request);
    const action = record(operation);
    const requestId = roomId(action.id);
    const kind = action.kind;
    if (!requestId || (kind !== "execution" && kind !== "analysis" && kind !== "report")) {
      throw new RequestError("Invalid room action.");
    }
    const cases = input.testCases.length ? input.testCases : [{ input: "", expectedOutput: null }];
    if (typeof caseIndex !== "number" || !Number.isInteger(caseIndex) || caseIndex < 0 || caseIndex >= cases.length) {
      throw new RequestError("Select a valid test case.");
    }
    const history = await listActivities(id);
    const saved = await reserveActivity(id, user.id, requestId, kind, input, caseIndex);
    if (!saved.created) return Response.json({ activity: saved.activity });
    try {
      if (kind === "execution") {
        const result = await runCode(input.code, cases[caseIndex], AbortSignal.timeout(28_000));
        await db.update(activities).set({ result, status: "complete", completedAt: new Date() }).where(eq(activities.id, requestId));
      } else if (kind === "analysis") {
        const observations: CaseResults = input.testCases.length ? input.testCases.map(() => null) : [null];
        for (const row of [...history].reverse()) {
          if (row.kind === "execution" && row.code === input.code && row.result &&
              JSON.stringify(row.testCases) === JSON.stringify(input.testCases)) observations[row.caseIndex] = row.result;
        }
        const report = await generateAnalysis(requestId, input, observations);
        await saveAnalysis(report, user.id, input.code);
      } else {
        const content = debugReport(JSON.parse(JSON.stringify(history)) as Activity[], input.code);
        await db.update(activities).set({ content, status: "complete", completedAt: new Date() }).where(eq(activities.id, requestId));
      }
    } catch (error) {
      const message = error instanceof RequestError ? error.message : kind === "analysis" ? analysisError(error).message : "The provider or database could not finish this action. No automatic retry was made.";
      await db.update(activities).set({ status: "error", error: message, completedAt: new Date() }).where(eq(activities.id, requestId));
    }
    return Response.json({ activities: await listActivities(id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return roomApiError(error, "Room action could not be saved.");
  }
}
