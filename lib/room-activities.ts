import { and, desc, eq, lt } from "drizzle-orm";
import { db } from "@/db";
import { activities, debugRooms } from "@/db/schema";
import { isMember } from "@/lib/rooms";
import type { RunInput } from "./execution-types";
import { RequestError } from "./request-body";

export async function listActivities(id: string) {
  await db.update(activities).set({
    status: "error", error: "The request did not finish. Provider outcome is unknown. It will not be retried automatically.",
    completedAt: new Date(),
  }).where(and(eq(activities.roomId, id), eq(activities.status, "running"), lt(activities.createdAt, new Date(Date.now() - 120_000))));
  return db.select().from(activities).where(eq(activities.roomId, id)).orderBy(desc(activities.createdAt)).limit(50);
}

export async function reserveActivity(id: string, userId: string, requestId: string,
  kind: "execution" | "analysis" | "report", input: RunInput, caseIndex: number) {
  return db.transaction(async (tx) => {
    const [room] = await tx.select().from(debugRooms).where(eq(debugRooms.id, id)).for("update");
    if (!isMember(room, userId)) throw new RequestError("You do not have access to this room.", 403);
    const [existing] = await tx.select().from(activities).where(eq(activities.id, requestId));
    if (existing) {
      if (existing.roomId !== id) throw new RequestError("Request ID already used.", 409);
      return { activity: existing, created: false };
    }
    const [last] = await tx.select().from(activities).where(eq(activities.roomId, id)).orderBy(desc(activities.createdAt)).limit(1);
    if (last?.status === "running") throw new RequestError("Another room action is in progress.", 409);
    if (last && Date.now() - last.createdAt.getTime() < 5000) throw new RequestError("Please wait a few seconds before the next room action.", 429);
    const [activity] = await tx.insert(activities).values({
      id: requestId, roomId: id, userId, kind, code: input.code, testCases: input.testCases, caseIndex,
    }).returning();
    return { activity, created: true };
  });
}
