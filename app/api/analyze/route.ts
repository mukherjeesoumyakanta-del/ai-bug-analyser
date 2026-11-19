import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { getServerSession } from "next-auth";
import { db } from "@/db";
import { activities } from "@/db/schema";
import { authOptions } from "@/lib/auth";
import { readRunInput } from "@/lib/execution-input";
import { verifyEvidence } from "@/lib/execution-evidence";
import { analysisError } from "@/lib/ai-error";
import { reservePersonalActivity } from "@/lib/personal-activity";
import { gemini, generateAnalysis, saveAnalysis } from "@/lib/ai-analysis";

export const maxDuration = 60;

export async function POST(request: Request) {
  const userId = (await getServerSession(authOptions))?.user?.id;
  if (!userId) return Response.json({ error: "Please sign in to analyze bugs." }, { status: 401 });
  const id = randomUUID();
  let saved = false;
  try {
    const { input, evidence } = await readRunInput(request);
    gemini();
    await reservePersonalActivity(id, userId, "analysis", input);
    saved = true;
    const verified = verifyEvidence(process.env.NEXTAUTH_SECRET, userId, input, evidence);
    const report = await generateAnalysis(id, input, verified);
    await saveAnalysis(report, userId, input.code);
    return Response.json({ report }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const failure = analysisError(error);
    if (saved) await db.update(activities).set({ status: "error", error: failure.message, completedAt: new Date() }).where(eq(activities.id, id));
    return Response.json({ error: failure.message }, { status: failure.status });
  }
}
