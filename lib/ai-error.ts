import { RequestError } from "./request-body.ts";

export function analysisError(error: unknown) {
  if (error instanceof RequestError) return error;
  const status = typeof error === "object" && error !== null && "status" in error ? Number(error.status) : 0;
  if (status === 401 || status === 403) {
    return new RequestError("Gemini rejected the server API key. Check GEMINI_API_KEY and its project permissions in Google AI Studio.", 503);
  }
  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(String(error))) {
    return new RequestError("Gemini quota reached. Please try again after your quota resets.", 429);
  }
  return new RequestError("Gemini could not finish this analysis. Try again later.", 502);
}
