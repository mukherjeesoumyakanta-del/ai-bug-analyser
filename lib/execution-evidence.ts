import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { CaseResults, RunInput } from "./execution-types.ts";

function binding(userId: string, input: RunInput) {
  return createHash("sha256").update(JSON.stringify([userId, input])).digest("hex");
}

function mac(payload: string, secret: string) {
  return createHmac("sha256", secret).update("cpp-run-v2:" + payload).digest("base64url");
}

export function signEvidence(secret: string, userId: string, input: RunInput, results: CaseResults) {
  const payload = Buffer.from(JSON.stringify({
    binding: binding(userId, input), expires: Date.now() + 30 * 60_000, results,
  })).toString("base64url");
  return payload + "." + mac(payload, secret);
}

export function verifyEvidence(secret: string | undefined, userId: string, input: RunInput, token?: string) {
  if (!secret || !token) return undefined;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return undefined;
  const expected = Buffer.from(mac(payload, secret));
  const actual = Buffer.from(signature);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return undefined;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (data.expires > Date.now() && data.binding === binding(userId, input)) {
      return data.results as CaseResults;
    }
  } catch {
    return undefined;
  }
}
