import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { authOptions } from "@/lib/auth";
import { executeRequest } from "@/lib/execute-request";
import { reservePersonalActivity } from "@/lib/personal-activity";
import { runCode } from "@/lib/code-execution";

export const runtime = "nodejs";
export const maxDuration = 35;

export async function POST(request: Request) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  return executeRequest(request, userId, process.env.NEXTAUTH_SECRET, async (code, test, signal) => {
    const id = randomUUID();
    await reservePersonalActivity(id, userId!, "execution", { code, testCases: [test] });
    try {
      const result = await runCode(code, test, signal);
      await db.update(activities).set({ result, status: "complete", completedAt: new Date() }).where(eq(activities.id, id));
      return result;
    } catch (error) {
      await db.update(activities).set({ status: "error", error: "Execution could not complete.", completedAt: new Date() }).where(eq(activities.id, id));
      throw error;
    }
  });
}
