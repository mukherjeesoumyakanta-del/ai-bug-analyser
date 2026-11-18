import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { executeRequest } from "@/lib/execute-request";
import { runCode } from "@/lib/code-execution";

export const runtime = "nodejs";
export const maxDuration = 35;

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  return executeRequest(request, session?.user?.id, process.env.NEXTAUTH_SECRET, runCode);
}
