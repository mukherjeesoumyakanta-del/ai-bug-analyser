import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { executeRequest } from "@/lib/execute-request";
import { createJudge0 } from "@/lib/judge0";

export const runtime = "nodejs";
export const maxDuration = 35;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  return executeRequest(request, session?.user?.id, process.env.NEXTAUTH_SECRET,
    (input, signal) => createJudge0()(input, signal));
}
