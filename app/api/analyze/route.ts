import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { bugReports } from "@/db/schema";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

/* ── System instruction: strict DSA tutor, never gives full code ── */
const SYSTEM_INSTRUCTION = `You are a strict Data Structures and Algorithms tutor reviewing C++ code.

Your rules:
1. NEVER output full corrected code blocks or structural rewrites. Do NOT give the student the answer.
2. If the user provides Test Cases, explicitly begin your response with a "### Test Case Evaluation" section. Dry-run the code mentally against the provided inputs and state whether each expected output was met before moving on.
3. Identify the exact lines and variables causing each bug.
4. Explain the flaw clearly — what goes wrong at runtime, what the expected vs actual behavior is, and why it happens (referencing the relevant CS concept: dangling pointers, memory leaks, off-by-one errors, undefined behavior, etc.).
5. After each explanation, ask ONE focused guiding question that leads the student toward discovering the fix themselves.
6. Format your response in Markdown with severity ratings (🔴 Critical, 🟠 High, 🟡 Medium, 🟢 Low), affected line numbers, and clear section headers.
7. Be thorough but concise — no filler text, no praise, straight to the bugs.
8. At the end, provide a short summary table of all issues found.`;

export async function POST(req: Request) {
  /* ── Authenticate User ──────────────────────── */
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "Unauthorized. Please sign in to analyze bugs." },
      { status: 401 }
    );
  }

  /* ── Validate API key ───────────────────────── */
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    return NextResponse.json(
      {
        error:
          "GEMINI_API_KEY is not configured. Add it to .env.local and restart the dev server.",
      },
      { status: 500 }
    );
  }

  /* ── Parse request body ─────────────────────── */
  let code: string;
  let testCases: Array<{id: string, input: string, expectedOutput: string}> = [];
  try {
    const body = await req.json();
    code = body.code;
    testCases = body.testCases || [];
  } catch {
    return NextResponse.json(
      { error: "Invalid request body. Expected JSON with a 'code' field." },
      { status: 400 }
    );
  }

  if (!code || typeof code !== "string" || code.trim().length === 0) {
    return NextResponse.json(
      { error: "No code provided. Paste some C++ code in the editor first." },
      { status: 400 }
    );
  }

  /* ── Call Gemini with streaming (with retry for rate limits) ── */
  const MAX_RETRIES = 3;
  const ai = new GoogleGenAI({ apiKey });

  /* ── Background Extractor ──────────────────── */
  const extractAndSave = async (fullText: string, originalCode: string, key: string) => {
    try {
      const extractorAi = new GoogleGenAI({ apiKey: key });
      const extractRes = await extractorAi.models.generateContent({
        model: "gemini-2.5-flash",
        config: {
          responseMimeType: "application/json",
          systemInstruction: "You are a JSON extractor. Parse the tutor's response to identify ALL bugs found. Return ONLY valid JSON in this format: { \"bugs\": [{ \"bug_type\": \"Memory Leak\", \"severity\": \"🔴 Critical\" }] }. Use short 1-3 word categories for bug_type. If no issues found, return { \"bugs\": [{ \"bug_type\": \"Clean Code\", \"severity\": \"🟢 Low\" }] }.",
        },
        contents: [
          { role: "user", parts: [{ text: `Tutor response:\n${fullText}` }] }
        ]
      });

      const parsed = JSON.parse(extractRes.text || "{}");
      const bugs = Array.isArray(parsed.bugs) ? parsed.bugs : [parsed];

      for (const bug of bugs) {
        let rawBugType = bug.bug_type || parsed.bug_type || "Unknown";
        // Normalize to Sentence case to group duplicates like "Use-After-Free" and "Use-after-free"
        const bugType = rawBugType.charAt(0).toUpperCase() + rawBugType.slice(1).toLowerCase();
        const severity = bug.severity || parsed.severity || "Unknown";

        await db.insert(bugReports).values({
          userId: session.user.id, // Securely use the authenticated user's ID
          codeSnippet: originalCode,
          bugType,
          severity
        });
        console.log("[/api/analyze] Saved bug report to SQLite:", { bugType, severity });
      }
    } catch (e) {
      console.error("[/api/analyze] Failed to extract and save:", e);
    }
  };

  const makeRequest = () => {
    let promptText = `Analyze the following C++ code for bugs, memory issues, undefined behavior, and bad practices:\n\n\`\`\`cpp\n${code}\n\`\`\``;

    const validTestCases = testCases.filter(tc => tc.input.trim() || tc.expectedOutput.trim());
    if (validTestCases.length > 0) {
      promptText += `\n\nHere are the user's test cases:\n`;
      validTestCases.forEach((tc, idx) => {
        promptText += `Test Case ${idx + 1}:\n- Input: ${tc.input}\n- Expected Output: ${tc.expectedOutput}\n\n`;
      });
      promptText += `Please begin your response by evaluating these test cases based on the provided code.\n`;
    }

    return ai.models.generateContentStream({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
      },
      contents: [
        {
          role: "user",
          parts: [{ text: promptText }],
        },
      ],
    });
  };

  /* ── Helper: extract retry delay from error ── */
  function parseRetryDelay(err: unknown): number {
    try {
      const msg = err instanceof Error ? err.message : String(err);
      // Look for "retry in X.XXXs" or RetryInfo delay
      const match = msg.match(/retry\s+in\s+(\d+(?:\.\d+)?)\s*s/i);
      if (match) return Math.ceil(parseFloat(match[1]));
    } catch {
      /* ignore parse errors */
    }
    return 0;
  }

  /* ── Helper: check if error is a 429 rate limit ── */
  function isRateLimitError(err: unknown): boolean {
    const msg = err instanceof Error ? err.message : String(err);
    return (
      msg.includes("429") ||
      msg.includes("RESOURCE_EXHAUSTED") ||
      msg.includes("quota") ||
      msg.includes("rate")
    );
  }

  /* ── Helper: extract a clean user-facing message ── */
  function cleanErrorMessage(err: unknown): string {
    const raw = err instanceof Error ? err.message : String(err);

    if (isRateLimitError(err)) {
      const delay = parseRetryDelay(err);
      return delay > 0
        ? `⏳ Rate limit exceeded. All retries exhausted. Please wait ~${delay}s and try again.`
        : "⏳ Rate limit exceeded. All retries exhausted. Please wait a minute and try again.";
    }

    // Try to extract the core message from nested JSON error blobs
    try {
      // Sometimes err.message has a prefix like "[500 Internal Server Error] " before the JSON
      const jsonStart = raw.indexOf('{');
      if (jsonStart !== -1) {
        const jsonStr = raw.slice(jsonStart);
        const parsed = JSON.parse(jsonStr);
        if (parsed?.error?.message) {
           // If the inner message is ALSO JSON, parse it
           try {
             const innerParsed = JSON.parse(parsed.error.message);
             if (innerParsed?.error?.message) {
               return innerParsed.error.message;
             }
           } catch {
             return parsed.error.message;
           }
        }
      }
    } catch {
      /* not JSON, use raw */
    }

    return raw;
  }

  /* ── Retry loop with exponential backoff ──── */
  let lastError: unknown = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await makeRequest();

      /* ── Pipe the async generator into a ReadableStream ── */
      const stream = new ReadableStream({
        async start(controller) {
          let accumulatedText = "";
          try {
            const encoder = new TextEncoder();
            for await (const chunk of response) {
              const text = chunk.text;
              if (text) {
                accumulatedText += text;
                controller.enqueue(encoder.encode(text));
              }
            }
            controller.close();
            
            // Fire and forget background task
            extractAndSave(accumulatedText, code, apiKey).catch(() => console.error("Background task failed"));
          } catch (streamError) {
            controller.error(streamError);
          }
        },
      });

      return new NextResponse(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Content-Type-Options": "nosniff",
        },
      });
    } catch (error: unknown) {
      lastError = error;

      /* Only retry on rate limit errors */
      if (isRateLimitError(error) && attempt < MAX_RETRIES) {
        const apiDelay = parseRetryDelay(error);
        const backoff = apiDelay > 0
          ? apiDelay * 1000
          : Math.min(1000 * Math.pow(2, attempt + 1), 30000); // 2s, 4s, 8s (capped at 30s)

        console.log(
          `[/api/analyze] Rate limited (attempt ${attempt + 1}/${MAX_RETRIES}). Retrying in ${backoff}ms…`
        );
        await new Promise((resolve) => setTimeout(resolve, backoff));
        continue;
      }

      /* Non-retryable error or retries exhausted — break out */
      break;
    }
  }

  /* ── All retries failed ──────────────────────── */
  const message = cleanErrorMessage(lastError);
  console.error("[/api/analyze] Gemini error (after retries):", message);

  const statusCode = isRateLimitError(lastError) ? 429 : 500;
  return NextResponse.json({ error: message }, { status: statusCode });
}

