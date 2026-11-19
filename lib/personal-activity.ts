import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { activities, users } from "@/db/schema";
import { RequestError } from "./request-body";
import type { RunInput } from "./execution-types";

export async function reservePersonalActivity(id: string, userId: string,
  kind: "execution" | "analysis", input: RunInput) {
  await db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
    const [last] = await tx.select().from(activities).where(and(eq(activities.userId, userId)))
      .orderBy(desc(activities.createdAt)).limit(1);
    if (last && Date.now() - last.createdAt.getTime() < 5000) {
      throw new RequestError("Please wait a few seconds before another provider request.", 429);
    }
    if (last?.status === "running" && Date.now() - last.createdAt.getTime() < 120_000) {
      throw new RequestError("Your previous provider request is still in progress.", 409);
    }
    await tx.insert(activities).values({ id, userId, kind, code: input.code, testCases: input.testCases });
  });
}
